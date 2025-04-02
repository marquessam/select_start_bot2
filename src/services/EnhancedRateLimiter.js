/**
 * Advanced rate limiter for RetroAchievements API
 * - Enforces a configurable delay between requests
 * - Implements backoff strategy for failures
 * - Provides concurrency control
 * - Tracks request history for debugging
 */
class EnhancedRateLimiter {
    constructor(options = {}) {
        // Default options
        this.options = {
            requestsPerMinute: 40,           // Maximum of ~40 requests per minute
            baseDelayMs: 1500,               // Base delay between requests (1.5 seconds)
            maxRetries: 3,                   // Maximum retry attempts
            retryBackoffMultiplier: 2,       // Exponential backoff multiplier
            maxConcurrentRequests: 1,        // No parallel requests
            ...options
        };
        
        this.queue = [];
        this.activeRequests = 0;
        this.lastRequestTime = 0;
        this.requestHistory = [];            // Track timestamp, endpoint, success/failure
        this.processing = false;
        this.consecutiveFailures = 0;
    }

    /**
     * Add a function to the rate limiter queue
     * @param {Function} fn - Function to execute
     * @param {string} endpointName - Name of the endpoint for tracking
     * @returns {Promise<any>} Result of the function
     */
    async add(fn, endpointName = 'unknown') {
        return new Promise((resolve, reject) => {
            this.queue.push({ 
                fn, 
                resolve, 
                reject, 
                endpointName,
                retryCount: 0,
                addedTime: Date.now() 
            });
            
            // Start processing if not already
            if (!this.processing) {
                this.process();
            }
        });
    }

    /**
     * Process the queue
     */
    async process() {
        if (this.activeRequests >= this.options.maxConcurrentRequests || this.queue.length === 0) {
            this.processing = false;
            return;
        }
        
        this.processing = true;
        this.activeRequests++;
        
        // Calculate time to wait since last request
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const timeToWait = Math.max(0, this.options.baseDelayMs - timeSinceLastRequest);
        
        // Add dynamic delay if we've had consecutive failures
        const backoffDelay = this.consecutiveFailures > 0 
            ? Math.min(30000, this.options.baseDelayMs * Math.pow(this.options.retryBackoffMultiplier, this.consecutiveFailures))
            : 0;
            
        const totalDelay = timeToWait + backoffDelay;
        
        if (totalDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
        
        // Get the next item
        const item = this.queue.shift();
        this.lastRequestTime = Date.now();
        
        try {
            // Execute the function
            const result = await item.fn();
            
            // Record success
            this.recordRequest(item.endpointName, true);
            this.consecutiveFailures = 0; // Reset failures counter
            
            // Resolve the promise
            item.resolve(result);
        } catch (error) {
            // Record failure
            this.recordRequest(item.endpointName, false, error.message);
            this.consecutiveFailures++;
            
            // Check if should retry
            if (item.retryCount < this.options.maxRetries && 
                this.shouldRetry(error)) {
                
                // Put the item back in the queue with incremented retry count
                this.queue.unshift({
                    ...item,
                    retryCount: item.retryCount + 1
                });
                
                console.log(`Retrying request (${item.retryCount + 1}/${this.options.maxRetries}): ${item.endpointName}`);
            } else {
                // Max retries reached or non-retryable error
                item.reject(error);
            }
        } finally {
            this.activeRequests--;
            
            // Wait the base delay before processing the next item regardless of success/failure
            setTimeout(() => {
                this.process();
            }, this.options.baseDelayMs);
        }
    }
    
    /**
     * Record request history for debugging
     */
    recordRequest(endpoint, success, errorMessage = null) {
        const entry = {
            timestamp: new Date(),
            endpoint,
            success,
            errorMessage
        };
        
        this.requestHistory.push(entry);
        
        // Keep only the last 100 requests
        if (this.requestHistory.length > 100) {
            this.requestHistory.shift();
        }
        
        // Log failures
        if (!success) {
            console.warn(`RetroAPI request failed: ${endpoint} - ${errorMessage}`);
        }
    }
    
    /**
     * Determine if an error is retryable
     */
    shouldRetry(error) {
        // Retry on network errors, timeouts, and specific status codes
        return error.name === 'FetchError' ||
               error.message.includes('timeout') ||
               error.message.includes('ECONNRESET') ||
               error.message.includes('ETIMEDOUT') ||
               (error.status && [429, 500, 502, 503, 504].includes(error.status));
    }
    
    /**
     * Get stats about the rate limiter
     */
    getStats() {
        return {
            queueLength: this.queue.length,
            activeRequests: this.activeRequests,
            consecutiveFailures: this.consecutiveFailures,
            requestsInLastMinute: this.requestHistory
                .filter(r => (Date.now() - r.timestamp) < 60000)
                .length
        };
    }
}

export default EnhancedRateLimiter;
