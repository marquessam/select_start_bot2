// File: src/utils/staticCache.js
const Cache = require('./cache');

class StaticCache {
    constructor() {
        // Cache for game data - 24 hours
        this.gameCache = new Cache(24 * 60 * 60 * 1000);
        
        // Cache for user profiles - 6 hours
        this.profileCache = new Cache(6 * 60 * 60 * 1000);
        
        // Cache for monthly challenges - 1 hour
        this.challengeCache = new Cache(60 * 60 * 1000);
        
        // Cache for achievement info - 12 hours
        this.achievementCache = new Cache(12 * 60 * 60 * 1000);

        // Cache for game metadata (console, developer, etc.) - 7 days
        this.gameMetadataCache = new Cache(7 * 24 * 60 * 60 * 1000);

        // Cache for total achievement counts - 24 hours
        this.achievementCountCache = new Cache(24 * 60 * 60 * 1000);
    }

    // Game methods
    async getGameInfo(gameId, fetchFunction) {
        const cacheKey = `game-${gameId}`;
        let gameInfo = this.gameCache.get(cacheKey);
        
        if (!gameInfo) {
            gameInfo = await fetchFunction();
            if (gameInfo) {
                this.gameCache.set(cacheKey, gameInfo);
                // Cache metadata separately
                this.gameMetadataCache.set(`metadata-${gameId}`, {
                    console: gameInfo.Console,
                    developer: gameInfo.Developer,
                    publisher: gameInfo.Publisher,
                    genre: gameInfo.Genre,
                    released: gameInfo.Released
                });
            }
        }
        
        return gameInfo;
    }

    // Achievement methods
    async getAchievementInfo(gameId, achievementId, fetchFunction) {
        const cacheKey = `achievement-${gameId}-${achievementId}`;
        let achievementInfo = this.achievementCache.get(cacheKey);
        
        if (!achievementInfo) {
            achievementInfo = await fetchFunction();
            if (achievementInfo) {
                this.achievementCache.set(cacheKey, achievementInfo);
            }
        }
        
        return achievementInfo;
    }

    // Profile methods
    async getUserProfile(username, fetchFunction) {
        const cacheKey = `profile-${username.toLowerCase()}`;
        let profile = this.profileCache.get(cacheKey);
        
        if (!profile) {
            profile = await fetchFunction();
            if (profile) {
                this.profileCache.set(cacheKey, profile);
            }
        }
        
        return profile;
    }

    // Challenge methods
    async getCurrentChallenges(fetchFunction) {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const cacheKey = `challenges-${currentYear}-${currentMonth}`;
        
        let challenges = this.challengeCache.get(cacheKey);
        
        if (!challenges) {
            challenges = await fetchFunction();
            if (challenges) {
                this.challengeCache.set(cacheKey, challenges);
            }
        }
        
        return challenges;
    }

    // Achievement count methods
    async getGameAchievementCount(gameId, fetchFunction) {
        const cacheKey = `count-${gameId}`;
        let count = this.achievementCountCache.get(cacheKey);
        
        if (count === undefined) {
            count = await fetchFunction();
            if (count !== undefined) {
                this.achievementCountCache.set(cacheKey, count);
            }
        }
        
        return count;
    }

    // Bulk operations
    bulkCacheGameInfo(games) {
        for (const game of games) {
            const cacheKey = `game-${game.gameId}`;
            this.gameCache.set(cacheKey, game);
        }
    }

    // Clear methods
    clearGameCache() {
        this.gameCache.clear();
        this.gameMetadataCache.clear();
    }

    clearProfileCache() {
        this.profileCache.clear();
    }

    clearChallengeCache() {
        this.challengeCache.clear();
    }

    clearAll() {
        this.gameCache.clear();
        this.profileCache.clear();
        this.challengeCache.clear();
        this.achievementCache.clear();
        this.gameMetadataCache.clear();
        this.achievementCountCache.clear();
    }

    // Stats
    getCacheStats() {
        return {
            games: this.gameCache.size(),
            profiles: this.profileCache.size(),
            challenges: this.challengeCache.size(),
            achievements: this.achievementCache.size(),
            metadata: this.gameMetadataCache.size(),
            achievementCounts: this.achievementCountCache.size()
        };
    }
}

module.exports = StaticCache;
