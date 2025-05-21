// src/utils/RetroAPIUtils.js
import retroAPI from '../services/retroAPI.js';

// Cache timeouts in milliseconds
const CACHE_TIMEOUTS = {
    GAME_INFO: 24 * 60 * 60 * 1000,     // 24 hours
    USER_INFO: 60 * 60 * 1000,          // 1 hour
    USER_PROGRESS: 15 * 60 * 1000,      // 15 minutes
    LEADERBOARD: 5 * 60 * 1000,         // 5 minutes
    RECENT_ACHIEVEMENTS: 2 * 60 * 1000  // 2 minutes
};

// Simple cache implementation
class APICache {
    constructor() {
        this.cache = new Map();
    }
    
    get(key) {
        if (!this.cache.has(key)) return null;
        
        const { value, expiry } = this.cache.get(key);
        
        if (Date.now() > expiry) {
            this.cache.delete(key);
            return null;
        }
        
        return value;
    }
    
    set(key, value, ttl) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl
        });
    }
    
    clear(prefix = null) {
        if (!prefix) {
            this.cache.clear();
            return;
        }
        
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }
}

// Create a shared cache instance
const apiCache = new APICache();

/**
 * Get game info with caching
 */
export async function getGameInfo(gameId) {
    const cacheKey = `game:${gameId}`;
    const cached = apiCache.get(cacheKey);
    
    if (cached) return cached;
    
    try {
        const gameInfo = await retroAPI.getGameInfo(gameId);
        apiCache.set(cacheKey, gameInfo, CACHE_TIMEOUTS.GAME_INFO);
        return gameInfo;
    } catch (error) {
        console.error(`Error fetching game info for ${gameId}:`, error);
        // Return minimal object to prevent errors
        return { 
            id: gameId,
            title: `Game ${gameId}`,
            imageIcon: "",
            consoleName: "Unknown"
        };
    }
}

/**
 * Get user info with caching
 */
export async function getUserInfo(username) {
    const cacheKey = `user:${username}`;
    const cached = apiCache.get(cacheKey);
    
    if (cached) return cached;
    
    try {
        const userInfo = await retroAPI.getUserInfo(username);
        apiCache.set(cacheKey, userInfo, CACHE_TIMEOUTS.USER_INFO);
        return userInfo;
    } catch (error) {
        console.error(`Error fetching user info for ${username}:`, error);
        // Return minimal object to prevent errors
        return { 
            username,
            profileImageUrl: `https://retroachievements.org/UserPic/${username}.png`
        };
    }
}

/**
 * Get user's game progress with caching
 */
export async function getUserGameProgress(username, gameId) {
    const cacheKey = `progress:${username}:${gameId}`;
    const cached = apiCache.get(cacheKey);
    
    if (cached) return cached;
    
    try {
        const progress = await retroAPI.getUserGameProgress(username, gameId);
        apiCache.set(cacheKey, progress, CACHE_TIMEOUTS.USER_PROGRESS);
        return progress;
    } catch (error) {
        console.error(`Error fetching game progress for ${username} on ${gameId}:`, error);
        // Return minimal object to prevent errors
        return { 
            numAwardedToUser: 0,
            achievements: {}
        };
    }
}

/**
 * Get user's recent achievements with caching
 */
export async function getUserRecentAchievements(username, count = 50) {
    const cacheKey = `recent:${username}:${count}`;
    const cached = apiCache.get(cacheKey);
    
    if (cached) return cached;
    
    try {
        const achievements = await retroAPI.getUserRecentAchievements(username, count);
        apiCache.set(cacheKey, achievements, CACHE_TIMEOUTS.RECENT_ACHIEVEMENTS);
        return achievements;
    } catch (error) {
        console.error(`Error fetching recent achievements for ${username}:`, error);
        return [];
    }
}

/**
 * Get leaderboard entries with caching and improved handling
 */
export async function getLeaderboardEntries(leaderboardId, maxEntries = 1000) {
    const cacheKey = `leaderboard:${leaderboardId}`;
    const cached = apiCache.get(cacheKey);
    
    if (cached) return cached;
    
    try {
        // Fetch in batches of 500
        const batches = [];
        const batchSize = 500;
        const numBatches = Math.ceil(maxEntries / batchSize);
        
        for (let i = 0; i < numBatches; i++) {
            const offset = i * batchSize;
            const batch = await retroAPI.getLeaderboardEntriesDirect(leaderboardId, offset, batchSize);
            batches.push(batch);
        }
        
        // Process and combine batch results
        let entries = [];
        
        for (const batch of batches) {
            if (Array.isArray(batch)) {
                entries = [...entries, ...batch];
            } else if (batch?.Results && Array.isArray(batch.Results)) {
                entries = [...entries, ...batch.Results];
            } else if (batch?.data && Array.isArray(batch.data)) {
                entries = [...entries, ...batch.data];
            } else if (typeof batch === 'object') {
                // Try to extract entries from unknown format
                const possibleEntries = Object.values(batch).find(val => Array.isArray(val));
                if (possibleEntries) {
                    entries = [...entries, ...possibleEntries];
                }
            }
        }
        
        // Normalize the entries
        const normalizedEntries = entries.map(entry => {
            // Handle different field name formats
            return {
                User: entry.User || entry.user || '',
                Rank: parseInt(entry.Rank || entry.rank || 0, 10),
                Score: entry.Score || entry.score || entry.Value || entry.value || 0,
                FormattedScore: entry.FormattedScore || entry.formattedScore || 
                               entry.ScoreFormatted || entry.scoreFormatted || 
                               (entry.Score || entry.score || '').toString()
            };
        });
        
        apiCache.set(cacheKey, normalizedEntries, CACHE_TIMEOUTS.LEADERBOARD);
        return normalizedEntries;
    } catch (error) {
        console.error(`Error fetching leaderboard ${leaderboardId}:`, error);
        return [];
    }
}

/**
 * Find a specific user in a leaderboard
 */
export function findUserInLeaderboard(entries, username) {
    if (!entries || !Array.isArray(entries) || !username) return null;
    
    // Try exact match first (case insensitive)
    const exactMatch = entries.find(entry => {
        const entryUser = entry.User || '';
        return entryUser.toLowerCase() === username.toLowerCase();
    });
    
    if (exactMatch) return exactMatch;
    
    // Try fuzzy matching for usernames with spaces/special chars
    return entries.find(entry => {
        const entryUser = entry.User || '';
        const normalizedEntry = entryUser.toLowerCase().replace(/[_\s-]+/g, '');
        const normalizedUsername = username.toLowerCase().replace(/[_\s-]+/g, '');
        return normalizedEntry === normalizedUsername;
    });
}

/**
 * Clear cache entries
 */
export function clearCache(type = null, identifier = null) {
    if (!type) {
        apiCache.clear();
        return;
    }
    
    let prefix;
    switch (type) {
        case 'game':
            prefix = identifier ? `game:${identifier}` : 'game:';
            break;
        case 'user':
            prefix = identifier ? `user:${identifier}` : 'user:';
            break;
        case 'progress':
            prefix = identifier ? `progress:${identifier}` : 'progress:';
            break;
        case 'recent':
            prefix = identifier ? `recent:${identifier}` : 'recent:';
            break;
        case 'leaderboard':
            prefix = identifier ? `leaderboard:${identifier}` : 'leaderboard:';
            break;
        default:
            return;
    }
    
    apiCache.clear(prefix);
}

export default {
    getGameInfo,
    getUserInfo,
    getUserGameProgress,
    getUserRecentAchievements,
    getLeaderboardEntries,
    findUserInLeaderboard,
    clearCache,
    CACHE_TIMEOUTS
};
