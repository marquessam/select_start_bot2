// services/retroAPI.js
import { buildAuthorization, getGame, getGameExtended, getUserProfile, getUserRecentAchievements, 
    getUserSummary, getGameInfoAndUserProgress, getGameRankAndScore, getUserCompletedGames,
    getUserAwards, getGameList, getConsoleIds, getAchievementCount } from '@retroachievements/api';
import { config } from '../config/config.js';
import EnhancedRateLimiter from './EnhancedRateLimiter.js';

class RetroAchievementsService {
    constructor() {
        this.authorization = buildAuthorization({
            userName: process.env.RA_USERNAME,
            webApiKey: config.retroAchievements.apiKey
        });
        
        // Create an enhanced rate limiter
        this.rateLimiter = new EnhancedRateLimiter({
            requestsPerInterval: 1,     // 1 request per interval
            interval: 1200,             // 1.2 seconds (slightly more than 1 second for safety margin)
            maxRetries: 3,              // Retry up to 3 times for rate limit errors
            retryDelay: 3000            // Start with a 3-second delay between retries
        });
        
        // Cache for responses to reduce API calls
        this.cache = new Map();
        // TTL for cache in milliseconds (5 minutes)
        this.cacheTTL = 5 * 60 * 1000;
    }

    /**
     * Get item from cache if valid
     * @param {string} key - Cache key
     * @returns {any} Cached item or undefined if not found/expired
     */
    getCachedItem(key) {
        if (!this.cache.has(key)) return undefined;
        
        const { data, timestamp } = this.cache.get(key);
        const now = Date.now();
        
        // Check if cached item is still valid
        if (now - timestamp > this.cacheTTL) {
            this.cache.delete(key);
            return undefined;
        }
        
        return data;
    }

    /**
     * Store item in cache
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     */
    setCachedItem(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * ADDED: Get user's awards/badges using the getUserAwards endpoint
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Object>} User awards data
     */
    async getUserAwards(username) {
        const cacheKey = `user_awards_${username}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        // Use shorter cache TTL for awards (2 minutes) since they can change frequently
        if (cachedData && (Date.now() - this.cache.get(cacheKey).timestamp) < 120000) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const awards = await this.rateLimiter.add(() => 
                getUserAwards(this.authorization, { userName: username })
            );
            
            // Normalize the response to handle different field name formats
            if (awards) {
                // Handle both VisibleUserAwards and visibleUserAwards
                if (awards.VisibleUserAwards && !awards.visibleUserAwards) {
                    awards.visibleUserAwards = awards.VisibleUserAwards;
                }
                
                // Normalize other field names
                if (awards.TotalAwardsCount && !awards.totalAwardsCount) {
                    awards.totalAwardsCount = awards.TotalAwardsCount;
                }
                
                if (awards.MasteryAwardsCount && !awards.masteryAwardsCount) {
                    awards.masteryAwardsCount = awards.MasteryAwardsCount;
                }
                
                if (awards.BeatenHardcoreAwardsCount && !awards.beatenHardcoreAwardsCount) {
                    awards.beatenHardcoreAwardsCount = awards.BeatenHardcoreAwardsCount;
                }
                
                // Normalize award field names within each award
                if (awards.visibleUserAwards && Array.isArray(awards.visibleUserAwards)) {
                    awards.visibleUserAwards = awards.visibleUserAwards.map(award => ({
                        ...award,
                        // Normalize to lowercase versions for consistency
                        awardedAt: award.awardedAt || award.AwardedAt,
                        awardType: award.awardType || award.AwardType,
                        awardData: award.awardData || award.AwardData,
                        awardDataExtra: award.awardDataExtra || award.AwardDataExtra,
                        title: award.title || award.Title,
                        consoleName: award.consoleName || award.ConsoleName,
                        imageIcon: award.imageIcon || award.ImageIcon,
                        consoleId: award.consoleId || award.ConsoleID,
                        // Keep original fields as well for backward compatibility
                        AwardedAt: award.AwardedAt || award.awardedAt,
                        AwardType: award.AwardType || award.awardType,
                        AwardData: award.AwardData || award.awardData,
                        AwardDataExtra: award.AwardDataExtra || award.awardDataExtra,
                        Title: award.Title || award.title,
                        ConsoleName: award.ConsoleName || award.consoleName,
                        ImageIcon: award.ImageIcon || award.imageIcon,
                        ConsoleID: award.ConsoleID || award.consoleId
                    }));
                }
            }
            
            // Cache the normalized result
            this.setCachedItem(cacheKey, awards);
            
            return awards;
        } catch (error) {
            console.error(`Error fetching user awards for ${username}:`, error);
            
            // Return a minimal valid response structure to prevent further errors
            return {
                totalAwardsCount: 0,
                masteryAwardsCount: 0,
                beatenHardcoreAwardsCount: 0,
                visibleUserAwards: []
            };
        }
    }

    /**
     * Get user's progress for a specific game with award metadata
     * @param {string} username - RetroAchievements username
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} User's progress data including awards
     */
    async getUserGameProgressWithAwards(username, gameId) {
        const cacheKey = `progress_awards_${username}_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Make direct API request to get award metadata
            const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?g=${gameId}&u=${username}&a=1&z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}`;
            
            const response = await this.rateLimiter.add(async () => {
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`API request failed with status ${res.status}`);
                }
                return res.json();
            });

            // Cache the result
            this.setCachedItem(cacheKey, response);

            return response;
        } catch (error) {
            console.error(`Error fetching game progress with awards for ${username} in game ${gameId}:`, error);
            
            // Return a minimal valid response structure to prevent further errors
            return {
                NumAwardedToUser: 0,
                NumAchievements: 0,
                UserCompletion: '0%',
                UserCompletionHardcore: '0%',
                HighestAwardKind: null,
                HighestAwardDate: null,
                Achievements: {},
                title: `Game ${gameId}`
            };
        }
    }

    /**
     * Get user's progress for a specific game (standard method)
     * @param {string} username - RetroAchievements username
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} User's progress data
     */
    async getUserGameProgress(username, gameId) {
        const cacheKey = `progress_${username}_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const progress = await this.rateLimiter.add(() => 
                getGameInfoAndUserProgress(this.authorization, {
                    gameId: gameId,
                    userName: username
                })
            );

            // Cache the result
            this.setCachedItem(cacheKey, progress);

            return progress;
        } catch (error) {
            console.error(`Error fetching game progress for ${username} in game ${gameId}:`, error);
            
            // Return a minimal valid response structure to prevent further errors
            return {
                numAwardedToUser: 0,
                achievements: {},
                title: `Game ${gameId}`
            };
        }
    }

    /**
     * Get a bunch of info about a game
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} Game data including achievements and more
     */
    async getGameInfoExtended(gameId) {
        const cacheKey = `game_extended_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getGameExtended(this.authorization, {
                    gameId: parseInt(gameId)
                })
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, game);
            
            return game;
        } catch (error) {
            console.error(`Error fetching achievements for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get the number of achievements for a game
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} Game data including achievement count
     */
    async getGameAchievementCount(gameId) {
        const cacheKey = `achievement_count_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData !== undefined) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getAchievementCount(this.authorization, {
                    gameId: parseInt(gameId)
                })
            );
            
            const count = game.achievementIds.length;
            
            // Cache the result
            this.setCachedItem(cacheKey, count);
            
            return count;
        } catch (error) {
            console.error(`Error fetching achievements for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get user's recently earned achievements with improved handling
     * @param {string} username - RetroAchievements username
     * @param {number} count - Number of achievements to fetch (default: 50)
     * @returns {Promise<Array>} Array of recent achievements with normalized data
     */
    async getUserRecentAchievements(username, count = 50) {
        // For recent achievements, we use a shorter cache period
        const cacheKey = `recent_achievements_${username}_${count}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        // Recent achievements should have a shorter TTL (1 minute)
        if (cachedData && (Date.now() - this.cache.get(cacheKey).timestamp) < 60000) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const achievements = await this.rateLimiter.add(() => 
                getUserRecentAchievements(this.authorization, {
                    userName: username, // Make sure to use the correct parameter name (userName, not username)
                    count
                })
            );
            
            // Validate and normalize the achievement data
            const normalizedAchievements = [];
            
            if (Array.isArray(achievements)) {
                // Process each achievement
                for (const achievement of achievements) {
                    if (!achievement) continue;
                    
                    // Create a normalized achievement object with all required fields
                    const normalizedAchievement = {
                        ID: achievement.ID || achievement.id || 
                            (achievement.AchievementID ? String(achievement.AchievementID) : null) || 
                            (achievement.achievementId ? String(achievement.achievementId) : null) || 
                            "unknown",
                        Title: achievement.Title || achievement.title || "Unknown Achievement",
                        Description: achievement.Description || achievement.description || "",
                        Points: parseInt(achievement.Points || achievement.points || 0, 10),
                        BadgeName: achievement.BadgeName || achievement.badgeName || "",
                        GameID: achievement.GameID || achievement.gameId || 
                            (achievement.GameID ? String(achievement.GameID) : null) || "unknown",
                        GameTitle: achievement.GameTitle || achievement.gameTitle || "Unknown Game",
                        ConsoleName: achievement.ConsoleName || achievement.consoleName || "Unknown Console",
                        DateEarned: achievement.DateEarned || achievement.dateEarned || new Date().toISOString()
                    };
                    
                    // Add the normalized achievement to the array
                    normalizedAchievements.push(normalizedAchievement);
                }
            }
            
            // Cache the normalized result
            this.setCachedItem(cacheKey, normalizedAchievements);
            
            return normalizedAchievements;
        } catch (error) {
            console.error(`Error fetching recent achievements for ${username}:`, error);
            // Return empty array instead of throwing to prevent cascading failures
            return [];
        }
    }

    /**
     * Get game information
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} Game information
     */
    async getGameInfo(gameId) {
        const cacheKey = `game_info_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getGame(this.authorization, {
                    gameId: parseInt(gameId)
                })
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, game);
            
            return game;
        } catch (error) {
            console.error(`Error fetching game info for ${gameId}:`, error);
            
            // Return a minimal valid response structure to prevent further errors
            return {
                id: gameId,
                title: `Game ${gameId}`,
                consoleName: "Unknown",
                imageIcon: ""
            };
        }
    }

    /**
     * Get user information including profile image and stats
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Object>} User information
     */
    async getUserInfo(username) {
        const cacheKey = `user_info_${username}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter for each API call
            const summary = await this.rateLimiter.add(() => 
                getUserSummary(this.authorization, { userName: username })
            );
            
            const profile = await this.rateLimiter.add(() => 
                getUserProfile(this.authorization, { userName: username })
            );
            
            const awards = await this.rateLimiter.add(() => 
                getUserAwards(this.authorization, { userName: username })
            );

            // Log key structures for debugging
            console.log(`User info API response for ${username}:`);
            console.log(`- summary keys: ${Object.keys(summary).join(', ')}`);
            console.log(`- profile keys: ${Object.keys(profile).join(', ')}`);
            
            // Normalize and merge data from different endpoints
            const result = {
                // Basic user info
                username: username,
                
                // Points and achievements - check multiple fields and prioritize non-zero values
                totalPoints: summary.totalPoints || profile.points || summary.score || 0,
                hardcorePoints: summary.totalTruePoints || profile.hardcorePoints || 0,
                
                // Achievements counts - check multiple fields
                totalAchievements: profile.totalAchievements || summary.achievements || 0,
                numAchievements: profile.numAchievements || summary.numAchievements || 0,
                
                // Mastery information
                totalCompletedGames: profile.totalCompletedGames || summary.totalCompletedGames || 0,
                masteredGamesCount: profile.masteredGamesCount || summary.masteredGamesCount || 0,
                
                // Ranking information
                rank: summary.rank || profile.rank || 0,
                totalRanked: summary.totalRanked || profile.totalRanked || 0,
                
                // RetroRatio and completion stats
                retroRatio: profile.retroRatio || summary.retroRatio || 0,
                completionPercentage: profile.completionPercentage || summary.completionPercentage || 0,
                
                // Dates and activity
                memberSince: profile.memberSince || summary.created || summary.memberSince || "",
                lastActivity: profile.lastActivity || summary.lastActivityDate || "",
                lastLogin: profile.lastLogin || summary.lastLogin || "",
                
                // Other profile data
                status: profile.status || summary.status || "",
                motto: profile.motto || summary.motto || "",
                
                // Add awards and game information
                awards: awards || [],
                richPresenceMsg: profile.richPresenceMsg || "",
                recentlyPlayedGames: summary.recentlyPlayedGames || [],
                
                // Profile image - ensure we prepend domain if needed
                profileImageUrl: profile.userPic && 
                    (profile.userPic.startsWith('http') ? profile.userPic : 
                    `https://retroachievements.org${profile.userPic}`),
                
                // Store any userStats object directly
                userStats: summary.userStats || profile.userStats || null,
                
                // Include raw objects for debugging
                _rawSummary: summary,
                _rawProfile: profile
            };
            
            // Fix profileImageUrl if it's still undefined
            if (!result.profileImageUrl) {
                result.profileImageUrl = `https://retroachievements.org/UserPic/${username}.png`;
            }
            
            // Cache the result
            this.setCachedItem(cacheKey, result);
            
            console.log(`Normalized user info for ${username}: points=${result.totalPoints}, achievements=${result.totalAchievements}, ratio=${result.retroRatio}`);
            
            return result;
        } catch (error) {
            console.error(`Error fetching user info for ${username}:`, error);
            
            // Return a minimal valid response structure to prevent further errors
            return {
                username: username,
                profileImageUrl: `https://retroachievements.org/UserPic/${username}.png`
            };
        }
    }

    /**
     * Get game leaderboard rankings
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Array>} Leaderboard entries
     */
    async getGameRankAndScore(gameId) {
        const cacheKey = `rankings_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const rankings = await this.rateLimiter.add(() => 
                getGameRankAndScore(this.authorization, {
                    gameId: parseInt(gameId),
                    type: 'high-scores'
                })
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, rankings);
            
            return rankings;
        } catch (error) {
            console.error(`Error fetching rankings for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of games for a console
     * @param {number} consoleId - RetroAchievements console ID
     * @returns {Promise<Array>} List of games
     */
    async getConsoleGames(consoleId) {
        const cacheKey = `console_games_${consoleId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const games = await this.rateLimiter.add(() => 
                getGameList(this.authorization, {
                    consoleId: parseInt(consoleId)
                })
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, games);
            
            return games;
        } catch (error) {
            console.error(`Error fetching games for console ${consoleId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of all consoles
     * @returns {Promise<Array>} List of consoles
     */
    async getConsoles() {
        const cacheKey = 'consoles';
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const consoles = await this.rateLimiter.add(() => 
                getConsoleIds(this.authorization)
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, consoles);
            
            return consoles;
        } catch (error) {
            console.error('Error fetching console list:', error);
            throw error;
        }
    }

    /**
     * Get user's completed games
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Array>} List of completed games
     */
    async getUserCompletedGames(username) {
        const cacheKey = `completed_games_${username}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const completed = await this.rateLimiter.add(() => 
                getUserCompletedGames(this.authorization, {
                    userName: username  // Make sure to use the correct parameter name (userName, not username)
                })
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, completed);
            
            return completed;
        } catch (error) {
            console.error(`Error fetching completed games for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Validate that a user exists
     * @param {string} username - RetroAchievements username
     * @returns {Promise<boolean>} Whether the user exists
     */
    async validateUser(username) {
        try {
            // User validation results can be cached for longer periods
            const cacheKey = `user_exists_${username.toLowerCase()}`;
            const cachedResult = this.getCachedItem(cacheKey);
            
            if (cachedResult !== undefined) {
                return cachedResult;
            }
            
            // Use the rate limiter to make the API call
            await this.rateLimiter.add(() => 
                getUserProfile(this.authorization, { userName: username })
            );
            
            // Cache the positive result
            this.setCachedItem(cacheKey, true);
            
            return true;
        } catch (error) {
            console.log(error);
            // Cache the negative result too
            this.setCachedItem(`user_exists_${username.toLowerCase()}`, false);
            return false;
        }
    }

    /**
     * Get leaderboard entries using direct API request
     * @param {number} leaderboardId - RetroAchievements leaderboard ID
     * @param {number} offset - Starting position (0-based)
     * @param {number} count - Number of entries to retrieve
     * @returns {Promise<Object>} Leaderboard data object with Results array
     */
    async getLeaderboardEntriesDirect(leaderboardId, offset = 0, count = 100) {
        try {
            const cacheKey = `direct_leaderboard_${leaderboardId}_${offset}_${count}`;
            const cachedData = this.getCachedItem(cacheKey);
            
            if (cachedData) {
                return cachedData;
            }
            
            // Make direct API request to the RetroAchievements leaderboard endpoint
            const url = `https://retroachievements.org/API/API_GetLeaderboardEntries.php?i=${leaderboardId}&o=${offset}&c=${count}&z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache the result
            this.setCachedItem(cacheKey, data);
            
            return data;
        } catch (error) {
            console.error(`Error fetching direct leaderboard entries for ${leaderboardId}:`, error);
            return { Results: [] }; // Return empty Results array for consistent structure
        }
    }

    /**
     * Get leaderboard entries for a specific leaderboard
     * @param {number} leaderboardId - RetroAchievements leaderboard ID
     * @param {number} offset - Starting position (0-based)
     * @param {number} count - Number of entries to retrieve
     * @returns {Promise<Array>} List of leaderboard entries
     */
    async getLeaderboardEntries(leaderboardId, offset = 0, count = 100) {
        try {
            // For leaderboards, use a shorter cache TTL
            const cacheKey = `leaderboard_entries_${leaderboardId}_${offset}_${count}`;
            const cachedData = this.getCachedItem(cacheKey);
            
            // Use a shorter TTL for leaderboard data (2 minutes)
            if (cachedData && (Date.now() - this.cache.get(cacheKey).timestamp) < 120000) {
                return cachedData;
            }
            
            // Use direct API method and pass offset and count parameters
            const entries = await this.getLeaderboardEntriesDirect(leaderboardId, offset, count);

            // Process and standardize the entries
            const processedEntries = this.processLeaderboardEntries(entries);
            
            // Cache the processed entries
            this.setCachedItem(cacheKey, processedEntries);
            
            return processedEntries;
        } catch (error) {
            console.error(`Error fetching leaderboard entries for leaderboard ${leaderboardId}:`, error);
            return [];
        }
    }

    /**
     * Process leaderboard entries to standardize the format
     * @param {Object|Array} data - Raw API response
     * @returns {Array} Standardized leaderboard entries
     */
    processLeaderboardEntries(data) {
        // Check if we have a Results array (API sometimes returns different formats)
        const entries = data.Results || data;
        
        if (!entries || !Array.isArray(entries)) {
            return [];
        }
        
        // Convert entries to a standard format
        return entries.map(entry => {
            // Handle different API response formats
            const user = entry.User || entry.user || '';
            const apiRank = entry.Rank || entry.rank || '0';
            
            // For scores, check all possible properties
            let score = null;
            
            // Check for numeric scores first (points-based leaderboards)
            if (entry.Score !== undefined) score = entry.Score;
            else if (entry.score !== undefined) score = entry.score;
            else if (entry.Value !== undefined) score = entry.Value;
            else if (entry.value !== undefined) score = entry.value;
            
            // Get the formatted version if available
            let formattedScore = null;
            if (entry.FormattedScore) formattedScore = entry.FormattedScore;
            else if (entry.formattedScore) formattedScore = entry.formattedScore;
            else if (entry.ScoreFormatted) formattedScore = entry.ScoreFormatted;
            else if (entry.scoreFormatted) formattedScore = entry.scoreFormatted;
            
            // Use the appropriate score representation
            let trackTime;
            if (formattedScore !== null) {
                trackTime = formattedScore;
            } else if (score !== null) {
                trackTime = score.toString();
            } else {
                // Last resort fallback
                trackTime = "No Score";
            }
            
            return {
                ApiRank: parseInt(apiRank, 10),
                User: user.trim(),
                TrackTime: trackTime.toString().trim(),
                DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
            };
        }).filter(entry => entry.User.length > 0);
    }

    /**
     * Make a direct API request to the RetroAchievements API
     * @param {string} endpoint - API endpoint
     * @returns {Promise<Object>} API response
     */
    async apiRequest(endpoint) {
        const baseUrl = 'https://retroachievements.org/API/';
        const url = `${baseUrl}${endpoint}&z=${this.authorization.userName}&y=${this.authorization.webApiKey}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Select-Start-Bot/1.0',
                }
            });
            
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
     * Debug utility function to analyze user data structure
     * @param {string} username - RetroAchievements username
     */
    async debugUserData(username) {
        try {
            // Get raw data from both endpoints
            const summary = await this.rateLimiter.add(() => 
                getUserSummary(this.authorization, { userName: username })
            );
            
            const profile = await this.rateLimiter.add(() => 
                getUserProfile(this.authorization, { userName: username })
            );
            
            // Log detailed structure info
            console.log(`=== DEBUG USER DATA FOR ${username} ===`);
            console.log("Summary fields:", Object.keys(summary));
            console.log("Profile fields:", Object.keys(profile));
            
            // Log specific fields we're interested in
            const fieldsToCheck = [
                'totalPoints', 'points', 'score',
                'totalAchievements', 'numAchievements', 'achievements',
                'retroRatio', 'RAPoints', 
                'completionPercentage', 'completionRate',
                'lastActivity', 'lastActivityDate',
                'rank', 'totalRanked'
            ];
            
            console.log("Critical fields:");
            for (const field of fieldsToCheck) {
                console.log(`${field}:`, {
                    inSummary: summary[field] !== undefined ? summary[field] : "undefined",
                    inProfile: profile[field] !== undefined ? profile[field] : "undefined"
                });
            }
            
            // Check if userStats exists in either
            if (summary.userStats) {
                console.log("userStats in summary:", Object.keys(summary.userStats));
            }
            if (profile.userStats) {
                console.log("userStats in profile:", Object.keys(profile.userStats));
            }
            
            console.log("=== END DEBUG ===");
        } catch (error) {
            console.error("Error in debugUserData:", error);
        }
    }
    
    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        console.log('Cache cleared');
    }
}

// Create and export a singleton instance
const retroAPI = new RetroAchievementsService();
export default retroAPI;
