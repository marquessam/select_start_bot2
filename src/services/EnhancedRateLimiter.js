// src/services/EnhancedRateLimiter.js
class EnhancedRateLimiter {
    constructor(options = {}) {
        // Default options
        this.options = {
            requestsPerInterval: 1,       // Number of requests allowed per interval
            interval: 1000,               // Interval in milliseconds (1 second default)
            maxRetries: 3,                // Maximum number of retries for failed requests
            retryDelay: 2000,             // Initial delay between retries in milliseconds
            ...options
        };
        
        this.queue = [];                  // Queue of pending requests
        this.processing = false;          // Whether we're currently processing the queue
        this.requestTimestamps = [];      // Timestamps of recent requests to track rate
    }

    /**
     * Add a function to the rate limiter queue
     * @param {Function} fn - Function to execute
     * @returns {Promise<any>} Result of the function
     */
    async add(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ 
                fn, 
                resolve, 
                reject,
                retries: 0 
            });
            
            // Start processing the queue if not already processing
            if (!this.processing) {
                this.process();
            }
        });
    }

    /**
     * Process the queue
     */
    async process() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        try {
            const now = Date.now();
            
            // Clean up old timestamps
            this.requestTimestamps = this.requestTimestamps.filter(
                timestamp => now - timestamp < this.options.interval
            );
            
            // If we've hit the rate limit, wait before processing
            if (this.requestTimestamps.length >= this.options.requestsPerInterval) {
                const oldestTimestamp = this.requestTimestamps[0];
                const timeToWait = Math.max(0, this.options.interval - (now - oldestTimestamp));
                
                await new Promise(resolve => setTimeout(resolve, timeToWait + 100)); // Add a small buffer
            }
            
            // Get the next item from the queue
            const item = this.queue.shift();
            const { fn, resolve, reject, retries } = item;
            
            // Track this request
            this.requestTimestamps.push(Date.now());
            
            try {
                // Execute the function
                const result = await fn();
                resolve(result);
            } catch (error) {
                // Check if we should retry for rate limiting errors
                if (retries < this.options.maxRetries && error.message && error.message.includes('429')) {
                    console.log(`Rate limit hit, retrying (attempt ${retries + 1}/${this.options.maxRetries})...`);
                    
                    // Add back to queue with incremented retry count and increased delay
                    setTimeout(() => {
                        this.queue.unshift({
                            ...item,
                            retries: retries + 1
                        });
                        
                        // Restart processing if needed
                        if (!this.processing) {
                            this.process();
                        }
                    }, this.options.retryDelay * (retries + 1)); // Increase delay for each retry
                } else {
                    // No more retries or not a rate limit error, reject the promise
                    reject(error);
                }
            }
        } catch (error) {
            console.error('Error in rate limiter processing:', error);
        } finally {
            this.processing = false;
            
            // If there are more items in the queue, process them after a short delay
            if (this.queue.length > 0) {
                setTimeout(() => {
                    this.process();
                }, 100); // Add a small delay between processing items
            }
        }
    }
}

export default EnhancedRateLimiter;
