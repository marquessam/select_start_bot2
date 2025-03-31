import { buildAuthorization, getGame, getGameExtended, getUserProfile, getUserRecentAchievements, 
    getUserSummary, getGameInfoAndUserProgress, getGameRankAndScore, getUserCompletedGames,
    getUserAwards, getGameList, getConsoleIds, getAchievementCount } from '@retroachievements/api';
import { User } from '../models/User.js';
import { config } from '../config/config.js';

/**
 * Enhanced rate limiter with exponential backoff and better queue management
 */
class EnhancedRateLimiter {
    constructor(options = {}) {
        // Default options
        this.options = {
            requestsPerMinute: 30,           // Default: 30 requests per minute (~2 seconds per request)
            maxRetries: 3,                   // Maximum number of retries for failed requests
            initialBackoff: 5000,            // Initial backoff time in ms (5 seconds)
            maxBackoff: 60000,               // Maximum backoff time in ms (1 minute)
            jitter: true,                    // Add jitter to avoid thundering herd problem
            ...options
        };

        this.queue = [];                     // Request queue
        this.processing = false;             // Is the queue being processed
        this.lastRequestTime = 0;            // Time of last successful request
        this.retryMap = new Map();           // Map to track retry counts for specific endpoints
        
        // Calculate time between requests in ms
        this.timeBetweenRequests = Math.ceil(60000 / this.options.requestsPerMinute);
        
        // Debugging
        console.log(`Rate limiter configured: ${this.options.requestsPerMinute} requests/minute (${this.timeBetweenRequests}ms between requests)`);
    }

    /**
     * Add a function to the rate limiter queue
     * @param {Function} fn - Function to execute
     * @param {string} endpoint - API endpoint for tracking retries (optional)
     * @returns {Promise<any>} Result of the function
     */
    async add(fn, endpoint = '') {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject, endpoint });
            this.processQueue();
        });
    }

    /**
     * Process the request queue
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        try {
            const { fn, resolve, reject, endpoint } = this.queue.shift();
            
            // Calculate time to wait before making the request
            const now = Date.now();
            const elapsed = now - this.lastRequestTime;
            const timeToWait = Math.max(0, this.timeBetweenRequests - elapsed);
            
            // Add jitter if enabled (±10% of time between requests)
            const jitter = this.options.jitter 
                ? (Math.random() * 0.2 - 0.1) * this.timeBetweenRequests 
                : 0;
            
            const actualWaitTime = Math.max(0, timeToWait + jitter);
            
            if (actualWaitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, actualWaitTime));
            }
            
            try {
                const result = await fn();
                this.lastRequestTime = Date.now();
                
                // Reset retry count for successful requests
                if (endpoint) this.retryMap.delete(endpoint);
                
                resolve(result);
            } catch (error) {
                // Handle retries with exponential backoff
                const retryCount = (this.retryMap.get(endpoint) || 0) + 1;
                
                if (this.shouldRetry(error) && retryCount <= this.options.maxRetries) {
                    this.retryMap.set(endpoint, retryCount);
                    
                    // Calculate backoff time with exponential increase
                    const backoffTime = Math.min(
                        this.options.initialBackoff * Math.pow(2, retryCount - 1),
                        this.options.maxBackoff
                    );
                    
                    console.warn(`Rate limit or network error for ${endpoint}. Retry ${retryCount}/${this.options.maxRetries} in ${backoffTime/1000}s`);
                    
                    // Put the request back in the queue after backoff
                    setTimeout(() => {
                        this.queue.unshift({ fn, resolve, reject, endpoint });
                        this.processQueue();
                    }, backoffTime);
                } else {
                    // Max retries exceeded or non-retriable error
                    reject(error);
                }
            }
        } finally {
            this.processing = false;
            
            // Continue processing queue with a small delay
            setTimeout(() => {
                if (this.queue.length > 0) {
                    this.processQueue();
                }
            }, 100);
        }
    }
    
    /**
     * Determine if an error is retriable
     */
    shouldRetry(error) {
        // Retry network errors, timeouts, and rate limit responses
        return (
            error.name === 'AbortError' ||
            error.name === 'TimeoutError' ||
            error.message.includes('timeout') ||
            error.message.includes('rate limit') ||
            error.message.includes('429') ||
            error.message.includes('503') ||
            (error.response && (
                error.response.status === 429 ||
                error.response.status === 503 ||
                error.response.status === 500
            ))
        );
    }
}

/**
 * Simple in-memory cache with TTL
 */
class Cache {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            size: 0
        };
        
        // Run cache cleanup every 10 minutes
        setInterval(() => this.cleanup(), 10 * 60 * 1000);
    }
    
    /**
     * Get item from cache
     */
    get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            this.stats.misses++;
            return null;
        }
        
        // Check if item has expired
        if (item.expiry < Date.now()) {
            this.cache.delete(key);
            this.stats.misses++;
            this.stats.size = this.cache.size;
            return null;
        }
        
        this.stats.hits++;
        return item.value;
    }
    
    /**
     * Set item in cache with TTL
     */
    set(key, value, ttlMs) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttlMs
        });
        this.stats.size = this.cache.size;
    }
    
    /**
     * Remove expired items from cache
     */
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (item.expiry < now) {
                this.cache.delete(key);
            }
        }
        this.stats.size = this.cache.size;
        console.log(`Cache cleanup completed. Size: ${this.stats.size}, Hits: ${this.stats.hits}, Misses: ${this.stats.misses}`);
    }
}

class RetroAchievementsService {
    constructor() {
        this.authorization = buildAuthorization({
            userName: process.env.RA_USERNAME,
            webApiKey: config.retroAchievements.apiKey
        });
        
        // Create enhanced rate limiter (20 requests per minute)
        this.rateLimiter = new EnhancedRateLimiter({
            requestsPerMinute: 20,
            maxRetries: 3
        });
        
        // Create cache with different TTLs
        this.cache = new Cache();
        
        // Cache TTLs
        this.cacheTTL = {
            gameInfo: 24 * 60 * 60 * 1000,        // 24 hours for game info
            userInfo: 12 * 60 * 60 * 1000,        // 12 hours for user info
            gameProgress: 30 * 60 * 1000,         // 30 minutes for game progress
            leaderboard: 60 * 60 * 1000,          // 1 hour for leaderboards
            consoles: 7 * 24 * 60 * 60 * 1000     // 7 days for console list
        };
    }

    /**
     * Get user's progress for a specific game with caching
     */
    async getUserGameProgress(username, gameId) {
        const cacheKey = `progress:${username}:${gameId}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const progress = await this.rateLimiter.add(
                () => getGameInfoAndUserProgress(this.authorization, {
                    gameId: gameId,
                    userName: username
                }),
                `getUserGameProgress:${username}:${gameId}`
            );
            
            // Cache the result
            this.cache.set(cacheKey, progress, this.cacheTTL.gameProgress);
            return progress;
        } catch (error) {
            console.error(`Error fetching game progress for ${username} in game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get extended game info with caching
     */
    async getGameInfoExtended(gameId) {
        const cacheKey = `gameExtended:${gameId}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const game = await this.rateLimiter.add(
                () => getGameExtended(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                `getGameInfoExtended:${gameId}`
            );
            
            // Cache the result
            this.cache.set(cacheKey, game, this.cacheTTL.gameInfo);
            return game;
        } catch (error) {
            console.error(`Error fetching extended game info for ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get achievement count for a game with caching
     */
    async getGameAchievementCount(gameId) {
        const cacheKey = `achievementCount:${gameId}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const game = await this.rateLimiter.add(
                () => getAchievementCount(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                `getGameAchievementCount:${gameId}`
            );
            
            // Cache the result
            this.cache.set(cacheKey, game.achievementIds.length, this.cacheTTL.gameInfo);
            return game.achievementIds.length;
        } catch (error) {
            console.error(`Error fetching achievement count for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get user's recent achievements
     */
    async getUserRecentAchievements(username, count = 50) {
        // Don't cache recent achievements - they change frequently
        try {
            const achievements = await this.rateLimiter.add(
                () => getUserRecentAchievements(this.authorization, {
                    username,
                    count
                }),
                `getUserRecentAchievements:${username}`
            );
            
            return achievements;
        } catch (error) {
            console.error(`Error fetching recent achievements for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Get basic game info with caching
     */
    async getGameInfo(gameId) {
        const cacheKey = `game:${gameId}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const game = await this.rateLimiter.add(
                () => getGame(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                `getGameInfo:${gameId}`
            );
            
            // Cache the result
            this.cache.set(cacheKey, game, this.cacheTTL.gameInfo);
            return game;
        } catch (error) {
            console.error(`Error fetching game info for ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get user profile info with caching
     */
    async getUserInfo(username) {
        const cacheKey = `user:${username.toLowerCase()}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Make parallel requests
            const [summary, profile, awards] = await Promise.all([
                this.rateLimiter.add(
                    () => getUserSummary(this.authorization, { userName: username }),
                    `getUserSummary:${username}`
                ),
                this.rateLimiter.add(
                    () => getUserProfile(this.authorization, { userName: username }),
                    `getUserProfile:${username}`
                ),
                this.rateLimiter.add(
                    () => getUserAwards(this.authorization, { userName: username }),
                    `getUserAwards:${username}`
                )
            ]);
            
            const combinedData = {
                ...summary,
                ...profile,
                awards,
                profileImageUrl: `https://retroachievements.org${profile.userPic}`
            };
            
            // Cache the result
            this.cache.set(cacheKey, combinedData, this.cacheTTL.userInfo);
            return combinedData;
        } catch (error) {
            console.error(`Error fetching user info for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Get game leaderboard rankings with caching
     */
    async getGameRankAndScore(gameId) {
        const cacheKey = `leaderboard:${gameId}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const rankings = await this.rateLimiter.add(
                () => getGameRankAndScore(this.authorization, {
                    gameId: parseInt(gameId),
                    type: 'high-scores'
                }),
                `getGameRankAndScore:${gameId}`
            );
            
            // Cache the result
            this.cache.set(cacheKey, rankings, this.cacheTTL.leaderboard);
            return rankings;
        } catch (error) {
            console.error(`Error fetching rankings for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of games for a console with caching
     */
    async getConsoleGames(consoleId) {
        const cacheKey = `consoleGames:${consoleId}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const games = await this.rateLimiter.add(
                () => getGameList(this.authorization, {
                    consoleId: parseInt(consoleId)
                }),
                `getConsoleGames:${consoleId}`
            );
            
            // Cache the result
            this.cache.set(cacheKey, games, this.cacheTTL.gameInfo);
            return games;
        } catch (error) {
            console.error(`Error fetching games for console ${consoleId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of all consoles with caching
     */
    async getConsoles() {
        const cacheKey = 'consoles';
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const consoles = await this.rateLimiter.add(
                () => getConsoleIds(this.authorization),
                `getConsoles`
            );
            
            // Cache the result
            this.cache.set(cacheKey, consoles, this.cacheTTL.consoles);
            return consoles;
        } catch (error) {
            console.error('Error fetching console list:', error);
            throw error;
        }
    }

    /**
     * Get user's completed games
     */
    async getUserCompletedGames(username) {
        const cacheKey = `completedGames:${username}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const completed = await this.rateLimiter.add(
                () => getUserCompletedGames(this.authorization, {
                    username
                }),
                `getUserCompletedGames:${username}`
            );
            
            // Cache the result (shorter TTL since this can change)
            this.cache.set(cacheKey, completed, 6 * 60 * 60 * 1000); // 6 hours
            return completed;
        } catch (error) {
            console.error(`Error fetching completed games for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Validate that a user exists with caching
     */
    async validateUser(username) {
        const cacheKey = `userExists:${username.toLowerCase()}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData !== null) {
            return cachedData;
        }
        
        try {
            await this.rateLimiter.add(
                () => getUserProfile(this.authorization, { userName: username }),
                `validateUser:${username}`
            );
            
            // Cache positive result for longer
            this.cache.set(cacheKey, true, 7 * 24 * 60 * 60 * 1000); // 7 days
            return true;
        } catch (error) {
            // Cache negative result for shorter time
            this.cache.set(cacheKey, false, 24 * 60 * 60 * 1000); // 1 day
            return false;
        }
    }

    /**
     * Get leaderboard entries for a specific leaderboard with caching
     */
    async getLeaderboardEntries(leaderboardId, offset = 0, count = 100) {
        const cacheKey = `leaderboardEntries:${leaderboardId}:${offset}:${count}`;
        const cachedData = this.cache.get(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            const entries = await this.rateLimiter.add(
                () => this.apiRequest(`API_GetLeaderboardEntries.php?i=${leaderboardId}&o=${offset}&c=${count}`),
                `getLeaderboardEntries:${leaderboardId}`
            );
            
            // Process and standardize the entries
            const processedEntries = this.processLeaderboardEntries(entries);
            
            // Cache the result
            this.cache.set(cacheKey, processedEntries, this.cacheTTL.leaderboard);
            return processedEntries;
        } catch (error) {
            console.error(`Error fetching leaderboard entries for leaderboard ${leaderboardId}:`, error);
            throw error;
        }
    }

    /**
     * Process leaderboard entries to standardize the format
     */
    processLeaderboardEntries(data) {
        // Handle different API response formats
        let entries = [];
        
        if (data.Results && Array.isArray(data.Results)) {
            entries = data.Results.map(result => result.UserEntry || result);
        } else if (Array.isArray(data)) {
            entries = data;
        } else if (data.Entries && Array.isArray(data.Entries)) {
            entries = data.Entries;
        } else if (typeof data === 'object') {
            entries = Object.values(data);
        }

        // Convert entries to a standard format
        return entries
            .filter(entry => {
                // Filter out invalid entries
                const hasUser = Boolean(entry && (entry.User || entry.user));
                const hasScore = Boolean(entry && (entry.Score || entry.score || entry.FormattedScore || entry.formattedScore));
                return hasUser && hasScore;
            })
            .map(entry => {
                // Standardize entry format
                const rawUser = entry.User || entry.user || '';
                const apiRank = entry.Rank || entry.rank || '0';
                const formattedScore = entry.FormattedScore || entry.formattedScore;
                const fallbackScore = entry.Score || entry.score || '0';
                const trackTime = formattedScore ? formattedScore.trim() : fallbackScore.toString();
                
                return {
                    ApiRank: parseInt(apiRank, 10),
                    User: rawUser.trim(),
                    TrackTime: trackTime,
                    DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
                };
            })
            .filter(entry => !isNaN(entry.ApiRank) && entry.User.length > 0);
    }

    /**
     * Make a direct API request to the RetroAchievements API
     */
    async apiRequest(endpoint) {
        const baseUrl = 'https://retroachievements.org/API/';
        const url = `${baseUrl}${endpoint}&z=${this.authorization.userName}&y=${this.authorization.webApiKey}`;
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fetch recent achievements for all registered users with smart rate limiting
     */
    async fetchAllRecentAchievements() {
        try {
            console.log('Fetching ALL recent achievements...');
    
            // Get all users
            const users = await User.find({ isActive: true }); // Only check active users
            
            if (!users || users.length === 0) {
                console.warn('No active users found, returning empty achievements list.');
                return [];
            }

            // Filter out users with recent checks to avoid unnecessarily hammering the API
            const MIN_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds
            const now = Date.now();
            
            const usersToCheck = users.filter(user => {
                const lastCheck = user.lastAchievementCheck || 0;
                const timeSinceLastCheck = now - lastCheck;
                return timeSinceLastCheck >= MIN_CHECK_INTERVAL;
            });
            
            console.log(`Filtered ${users.length} users to ${usersToCheck.length} that need checking`);
    
            // Configuration - much more conservative
            const ACHIEVEMENTS_PER_USER = 25;
            const USER_CHUNK_SIZE = 2;         // Only 2 users per batch
            const CHUNK_DELAY_MS = 10000;      // 10 seconds between batches
            const MAX_USERS_PER_RUN = 20;      // Limit maximum users per run
            
            // Priority users - users who had achievements recently go first
            const prioritizedUsers = usersToCheck
                .sort((a, b) => (b.lastAchievementCheck || 0) - (a.lastAchievementCheck || 0))
                .slice(0, MAX_USERS_PER_RUN);
            
            console.log(`Processing top ${prioritizedUsers.length} users with recent activity`);
    
            const allAchievements = [];
    
            // Process users in chunks to avoid hammering the API
            for (let i = 0; i < prioritizedUsers.length; i += USER_CHUNK_SIZE) {
                const userChunk = prioritizedUsers.slice(i, i + USER_CHUNK_SIZE);
                
                const chunkPromises = userChunk.map(async user => {
                    try {
                        // First validate the user exists in RetroAchievements
                        const cachedValidation = this.cache.get(`userExists:${user.raUsername.toLowerCase()}`);
                        let userExists = cachedValidation;
                        
                        if (userExists === null || userExists === undefined) {
                            userExists = await this.validateUser(user.raUsername)
                                .catch(err => {
                                    console.error(`Error validating user ${user.raUsername}:`, err);
                                    return false;
                                });
                        }
                        
                        if (!userExists) {
                            console.warn(`User ${user.raUsername} not found in RetroAchievements system, skipping`);
                            // Update the user in our database to mark as inactive
                            user.isActive = false;
                            await user.save();
                            return { username: user.raUsername, achievements: [] };
                        }
                        
                        console.log(`Fetching achievements for ${user.raUsername}...`);
                        
                        // Use the rate limiter to make the API call
                        const recentData = await this.rateLimiter.add(
                            () => getUserRecentAchievements(this.authorization, {
                                username: user.raUsername,
                                count: ACHIEVEMENTS_PER_USER
                            }),
                            `fetchRecentAchievements:${user.raUsername}`
                        );
    
                        // Make sure we have an array even if the API returns something unexpected
                        const achievements = Array.isArray(recentData) ? recentData : [];
                        
                        // Update the last check timestamp regardless of whether we found achievements
                        user.lastAchievementCheck = Date.now();
                        await user.save();
                        
                        // Log success for debugging
                        if (achievements.length > 0) {
                            console.log(`Found ${achievements.length} recent achievements for ${user.raUsername}`);
                        } else {
                            console.log(`No recent achievements found for ${user.raUsername}`);
                        }
                        
                        return { username: user.raUsername, achievements };
                    } catch (error) {
                        console.error(`Error fetching achievements for ${user.raUsername}:`, error);
                        return { username: user.raUsername, achievements: [] };
                    }
                });
    
                const chunkResults = await Promise.all(chunkPromises);
                allAchievements.push(...chunkResults.filter(result => result && result.achievements.length > 0));
    
                // Add delay between chunks if more chunks remain
                if (i + USER_CHUNK_SIZE < prioritizedUsers.length) {
                    console.log(`Waiting ${CHUNK_DELAY_MS/1000} seconds before checking next user batch...`);
                    await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
                }
            }
    
            // Log the total number of achievements found
            const totalAchievements = allAchievements.reduce((total, user) => total + user.achievements.length, 0);
            console.log(`Found a total of ${totalAchievements} recent achievements across ${allAchievements.length} users`);
    
            return allAchievements;
        } catch (error) {
            console.error('Error in fetchAllRecentAchievements:', error);
            return [];
        }
    }
}

// Create and export a singleton instance
const retroAPI = new RetroAchievementsService();
export default retroAPI;
