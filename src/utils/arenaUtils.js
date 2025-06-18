// src/utils/arenaUtils.js - COMPLETE UPDATED VERSION with rate limiting support

import retroAPI from '../services/retroAPI.js';
import RetroAPIUtils from './RetroAPIUtils.js';
import { EmbedBuilder } from 'discord.js';
import titleUtils from './titleUtils.js';

class ArenaUtils {
    constructor() {
        // Track leaderboard validation status to avoid repeated failures
        this.invalidLeaderboards = new Set();
        this.lastValidationCheck = new Map();
        
        // Cache for game info to reduce API calls
        this.gameInfoCache = new Map();
        this.gameInfoCacheTTL = 300000; // 5 minutes
    }

    /**
     * IMPROVED: Fetch leaderboard scores with better error handling and validation
     * @param {number} gameId - Game ID
     * @param {number} leaderboardId - Leaderboard ID  
     * @param {Array<string>} raUsernames - Array of RA usernames to get scores for
     * @returns {Promise<Array>} Array of score objects
     */
    async fetchLeaderboardScores(gameId, leaderboardId, raUsernames) {
        try {
            console.log(`Fetching leaderboard scores for game ${gameId}, leaderboard ${leaderboardId}`);
            console.log('Target users:', raUsernames);

            // Check if this leaderboard was previously marked as invalid
            if (this.invalidLeaderboards.has(leaderboardId)) {
                console.log(`Leaderboard ${leaderboardId} was previously marked as invalid, returning no-score results`);
                return this.createNoScoreResults(raUsernames);
            }

            // Validate leaderboard before attempting to fetch (with caching)
            const lastCheck = this.lastValidationCheck.get(leaderboardId);
            const shouldValidate = !lastCheck || (Date.now() - lastCheck) > 300000; // 5 minutes

            if (shouldValidate) {
                console.log(`Validating leaderboard ${leaderboardId}...`);
                const isValid = await retroAPI.validateLeaderboard(leaderboardId);
                this.lastValidationCheck.set(leaderboardId, Date.now());
                
                if (!isValid) {
                    console.log(`Leaderboard ${leaderboardId} validation failed, marking as invalid`);
                    this.invalidLeaderboards.add(leaderboardId);
                    return this.createNoScoreResults(raUsernames);
                }
                console.log(`Leaderboard ${leaderboardId} validation passed`);
            }

            // Try multiple methods with fallbacks
            let rawEntries = null;
            
            // Method 1: Use RetroAPIUtils (most reliable)
            try {
                console.log('Attempting to fetch via RetroAPIUtils...');
                rawEntries = await RetroAPIUtils.getLeaderboardEntries(leaderboardId, 1000);
                if (rawEntries && rawEntries.length > 0) {
                    console.log(`RetroAPIUtils succeeded: ${rawEntries.length} entries`);
                }
            } catch (apiError) {
                console.warn('RetroAPIUtils failed:', apiError.message);
            }

            // Method 2: Fallback to retroAPI service
            if (!rawEntries || rawEntries.length === 0) {
                console.log('Attempting to fetch via retroAPI service...');
                try {
                    const response = await retroAPI.getLeaderboardEntries(leaderboardId, 0, 1000);
                    if (response && response.length > 0) {
                        // Convert format to match RetroAPIUtils format
                        rawEntries = response.map(entry => ({
                            User: entry.User,
                            Rank: entry.ApiRank,
                            FormattedScore: entry.TrackTime,
                            Score: entry.TrackTime,
                            DateSubmitted: entry.DateSubmitted
                        }));
                        console.log(`retroAPI service succeeded: ${rawEntries.length} entries`);
                    }
                } catch (apiError) {
                    console.warn('retroAPI service failed:', apiError.message);
                    
                    // If this was a rate limiting error, mark for temporary avoidance
                    if (apiError.message.includes('422') || apiError.message.includes('429')) {
                        console.log(`Rate limiting detected for leaderboard ${leaderboardId}, temporary avoidance`);
                        this.invalidLeaderboards.add(leaderboardId);
                        setTimeout(() => {
                            this.invalidLeaderboards.delete(leaderboardId);
                        }, 300000); // 5 minutes
                    }
                }
            }

            // If both methods failed, mark leaderboard as problematic
            if (!rawEntries || rawEntries.length === 0) {
                console.log(`No leaderboard data received for ${leaderboardId} from any method`);
                
                // Mark as invalid for a shorter period (don't permanently cache failures)
                this.invalidLeaderboards.add(leaderboardId);
                setTimeout(() => {
                    this.invalidLeaderboards.delete(leaderboardId);
                    this.lastValidationCheck.delete(leaderboardId);
                }, 600000); // 10 minutes
                
                return this.createNoScoreResults(raUsernames);
            }

            console.log(`Successfully retrieved ${rawEntries.length} leaderboard entries`);

            // Find scores for target users
            const userScores = [];
            
            for (const username of raUsernames) {
                const entry = rawEntries.find(entry => {
                    return entry.User && entry.User.toLowerCase() === username.toLowerCase();
                });

                if (entry) {
                    userScores.push({
                        raUsername: username,
                        rank: entry.Rank,
                        score: entry.FormattedScore || entry.Score?.toString() || 'No score',
                        fetchedAt: new Date()
                    });
                    console.log(`Found score for ${username}: rank ${entry.Rank}, score ${entry.FormattedScore || entry.Score}`);
                } else {
                    userScores.push({
                        raUsername: username,
                        rank: null,
                        score: 'No score',
                        fetchedAt: new Date()
                    });
                    console.log(`No score found for ${username}`);
                }
            }

            return userScores;
        } catch (error) {
            console.error('Error in fetchLeaderboardScores:', error);
            
            // If this was a rate limiting error, mark for temporary avoidance
            if (error.message.includes('422') || error.message.includes('429')) {
                console.log(`Rate limiting detected for leaderboard ${leaderboardId}, temporary avoidance`);
                this.invalidLeaderboards.add(leaderboardId);
                setTimeout(() => {
                    this.invalidLeaderboards.delete(leaderboardId);
                }, 300000); // 5 minutes
            }
            
            return this.createNoScoreResults(raUsernames);
        }
    }

    /**
     * Create no-score results for all users
     * @param {Array<string>} raUsernames - Array of usernames
     * @returns {Array} Array of no-score results
     */
    createNoScoreResults(raUsernames) {
        return raUsernames.map(username => ({
            raUsername: username,
            rank: null,
            score: 'No score',
            fetchedAt: new Date()
        }));
    }

    /**
     * ADDED: Batch validate leaderboards for multiple challenges
     * @param {Array<Object>} challenges - Array of challenge objects with leaderboardId
     * @returns {Promise<Object>} Map of leaderboardId -> isValid
     */
    async validateChallengeLeaderboards(challenges) {
        const leaderboardIds = [...new Set(challenges.map(c => c.leaderboardId))];
        console.log(`Validating ${leaderboardIds.length} unique leaderboards...`);
        
        const results = await retroAPI.validateLeaderboardsBatch(leaderboardIds);
        
        // Update our invalid leaderboards set
        Object.entries(results).forEach(([id, isValid]) => {
            if (!isValid) {
                this.invalidLeaderboards.add(parseInt(id));
            } else {
                this.invalidLeaderboards.delete(parseInt(id));
            }
        });
        
        return results;
    }

    /**
     * IMPROVED: Validate game and leaderboard with better error handling
     * @param {string} gameId - Game ID
     * @param {string} leaderboardId - Leaderboard ID
     * @returns {Promise<Object>} Validation result with game and leaderboard info
     */
    async validateGameAndLeaderboard(gameId, leaderboardId) {
        try {
            console.log(`Validating game ${gameId} and leaderboard ${leaderboardId}`);
            
            // Get game info first with caching
            const gameInfo = await this.getGameInfo(gameId);
            if (!gameInfo || !gameInfo.title) {
                throw new Error(`Game ${gameId} not found or inaccessible`);
            }
            
            // Validate leaderboard exists and is accessible
            const isValidLeaderboard = await retroAPI.validateLeaderboard(leaderboardId);
            if (!isValidLeaderboard) {
                throw new Error(`Leaderboard ${leaderboardId} not found or inaccessible`);
            }
            
            // Get leaderboard info by trying to fetch one entry
            const leaderboardData = await retroAPI.getLeaderboardEntries(leaderboardId, 0, 1);
            
            return {
                game: {
                    id: gameId,
                    title: gameInfo.title || `Game ${gameId}`,
                    consoleName: gameInfo.consoleName || 'Unknown Console',
                    imageIcon: gameInfo.imageIcon || '',
                    ID: gameId,
                    Title: gameInfo.title || `Game ${gameId}`
                },
                leaderboard: {
                    id: leaderboardId,
                    title: `Leaderboard ${leaderboardId}`,
                    entryCount: leaderboardData.length,
                    ID: leaderboardId,
                    Title: `Leaderboard ${leaderboardId}`
                }
            };
        } catch (error) {
            console.error('Validation error:', error);
            throw error;
        }
    }

    /**
     * ENHANCED: Get game information with caching to reduce API calls
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Game information
     */
    async getGameInfo(gameId) {
        const cacheKey = `game_${gameId}`;
        
        // Check cache first
        if (this.gameInfoCache.has(cacheKey)) {
            const cached = this.gameInfoCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.gameInfoCacheTTL) {
                return cached.data;
            } else {
                this.gameInfoCache.delete(cacheKey);
            }
        }
        
        try {
            const gameInfo = await retroAPI.getGameInfo(gameId);
            
            // Cache the result
            this.gameInfoCache.set(cacheKey, {
                data: gameInfo,
                timestamp: Date.now()
            });
            
            return gameInfo;
        } catch (error) {
            console.error(`Error fetching game info for ${gameId}:`, error);
            
            // Return minimal game info to prevent cascading failures
            return {
                id: gameId,
                title: `Game ${gameId}`,
                consoleName: 'Unknown Console',
                imageIcon: ''
            };
        }
    }

    /**
     * IMPROVED: Create challenge embed with title truncation support
     * @param {Object} challenge - Challenge object
     * @param {string} color - Embed color
     * @returns {EmbedBuilder} Discord embed
     */
    createChallengeEmbed(challenge, color = '#00FF00') {
        const typeEmoji = challenge.type === 'direct' ? '⚔️' : '🌍';
        const statusEmoji = {
            'pending': '⏳',
            'active': '🔥',
            'completed': '✅',
            'cancelled': '❌'
        };

        // Use title truncation utilities
        const gameTitle = titleUtils.truncateGameTitleForEmbed(challenge.gameTitle);
        const leaderboardTitle = titleUtils.truncateLeaderboardTitle(challenge.leaderboardTitle);
        const description = titleUtils.formatChallengeDescription(challenge.description);

        const embed = new EmbedBuilder()
            .setTitle(`${typeEmoji} ${challenge.type.charAt(0).toUpperCase() + challenge.type.slice(1)} Challenge`)
            .setColor(color)
            .addFields([
                { name: 'Challenge ID', value: challenge.challengeId, inline: true },
                { name: 'Status', value: `${statusEmoji[challenge.status]} ${challenge.status.toUpperCase()}`, inline: true },
                { name: 'Game', value: gameTitle, inline: true },
                { name: 'Leaderboard', value: leaderboardTitle, inline: false }
            ]);

        if (description) {
            embed.addFields({ name: 'Description', value: description, inline: false });
        }

        // Add creator info
        embed.addFields({ name: 'Created by', value: `⚙️ ${challenge.creatorRaUsername}`, inline: true });

        // Add wager info
        const totalWager = challenge.getTotalWager ? challenge.getTotalWager() : 
                          challenge.participants.reduce((sum, p) => sum + p.wager, 0);
        embed.addFields({ name: 'Prize Pool', value: `${totalWager} GP`, inline: true });

        // Add participant count
        embed.addFields({ name: 'Participants', value: challenge.participants.length.toString(), inline: true });

        // Add target for direct challenges
        if (challenge.type === 'direct' && challenge.targetRaUsername) {
            embed.addFields({ name: 'Target', value: challenge.targetRaUsername, inline: true });
        }

        // Add timing info
        if (challenge.status === 'active') {
            const endTime = new Date(challenge.endedAt).toLocaleDateString();
            embed.addFields({ name: 'Ends', value: endTime, inline: true });
        }

        // Add betting info if there are bets
        if (challenge.bets && challenge.bets.length > 0) {
            const totalBets = challenge.getTotalBets ? challenge.getTotalBets() : 
                             challenge.bets.reduce((sum, bet) => sum + bet.amount, 0);
            embed.addFields({ name: '🎰 Bets', value: `${totalBets} GP`, inline: true });
        }

        embed.setTimestamp();

        return embed;
    }

    /**
     * ADDED: Create safe embed description with proper length limits
     * @param {Array<Object>} challenges - Array of challenges
     * @param {boolean} includeScores - Whether to include current scores
     * @returns {Promise<string>} Safe embed description
     */
    async createChallengeListDescription(challenges, includeScores = false) {
        let description = '';
        
        for (let index = 0; index < challenges.length && index < 5; index++) {
            const challenge = challenges[index];
            
            const typeEmoji = challenge.type === 'direct' ? '⚔️' : '🌍';
            const statusEmoji = challenge.status === 'pending' ? '⏳' : '🔥';
            
            // Use title truncation for challenge display
            const gameTitle = titleUtils.createShortGameDisplayName(challenge.gameTitle, 50);
            const challengeDescription = titleUtils.formatChallengeDescription(challenge.description, 100);
            
            description += `**${index + 1}. ${typeEmoji} ${gameTitle}**\n`;
            description += `${statusEmoji} ${challenge.status.toUpperCase()} | `;
            description += `${challengeDescription}\n`;
            description += `⚙️ Created by: ${challenge.creatorRaUsername}\n`;
            description += `💰 Wager: ${challenge.participants[0]?.wager || 0} GP | `;
            description += `👥 Players: ${challenge.participants.length}`;
            
            if (challenge.bets && challenge.bets.length > 0) {
                description += ` | 🎰 Bets: ${challenge.bets.length}`;
            }
            
            // Add current scores if requested and available
            if (includeScores && challenge.participants.length > 0) {
                try {
                    const participantUsernames = challenge.participants.map(p => p.raUsername);
                    const currentScores = await this.fetchLeaderboardScores(
                        challenge.gameId,
                        challenge.leaderboardId,
                        participantUsernames
                    );
                    
                    if (currentScores && currentScores.length > 0) {
                        // Sort by rank and show current standings
                        currentScores.sort((a, b) => {
                            if (a.rank === null && b.rank === null) return 0;
                            if (a.rank === null) return 1;
                            if (b.rank === null) return -1;
                            return a.rank - b.rank;
                        });
                        
                        description += `\n📊 Current Standings:\n`;
                        currentScores.forEach((score, scoreIndex) => {
                            const standing = scoreIndex + 1;
                            const positionEmoji = standing === 1 ? '👑' : `${standing}.`;
                            const creatorIndicator = score.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                            const globalRank = score.rank ? ` (#${score.rank})` : '';
                            const scoreText = score.score !== 'No score' ? ` - ${score.score}` : ' - No score yet';
                            
                            description += `  ${positionEmoji} ${score.raUsername}${creatorIndicator}${scoreText}${globalRank}\n`;
                        });
                    } else {
                        description += `\n📊 Current Standings: Scores not available yet\n`;
                    }
                } catch (error) {
                    console.error(`Error fetching scores for challenge ${challenge.challengeId}:`, error);
                    description += `\n📊 Current Standings: Unable to fetch scores\n`;
                }
            }
            
            description += '\n';
        }

        // Ensure description doesn't exceed Discord limits
        return titleUtils.createSafeFieldValue(description, titleUtils.DISCORD_LIMITS.EMBED_DESCRIPTION);
    }

    /**
     * ADDED: Clean up expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        
        // Clean up game info cache
        for (const [key, value] of this.gameInfoCache.entries()) {
            if (now - value.timestamp > this.gameInfoCacheTTL) {
                this.gameInfoCache.delete(key);
            }
        }
        
        // Clean up old validation checks (older than 1 hour)
        for (const [key, timestamp] of this.lastValidationCheck.entries()) {
            if (now - timestamp > 3600000) { // 1 hour
                this.lastValidationCheck.delete(key);
            }
        }
        
        console.log('Arena utils cache cleanup completed');
    }

    /**
     * Clear invalid leaderboards cache (useful for testing/debugging)
     */
    clearInvalidLeaderboardsCache() {
        this.invalidLeaderboards.clear();
        this.lastValidationCheck.clear();
        this.gameInfoCache.clear();
        console.log('Cleared all arena utils caches');
    }

    /**
     * Get statistics about leaderboard validation and caching
     */
    getValidationStats() {
        return {
            invalidLeaderboards: Array.from(this.invalidLeaderboards),
            validatedCount: this.lastValidationCheck.size,
            invalidCount: this.invalidLeaderboards.size,
            gameInfoCacheSize: this.gameInfoCache.size
        };
    }

    /**
     * ADDED: Check if a leaderboard is known to be invalid
     * @param {number} leaderboardId - Leaderboard ID to check
     * @returns {boolean} Whether the leaderboard is known to be invalid
     */
    isLeaderboardInvalid(leaderboardId) {
        return this.invalidLeaderboards.has(leaderboardId);
    }

    /**
     * ADDED: Force refresh validation for a specific leaderboard
     * @param {number} leaderboardId - Leaderboard ID to refresh
     */
    refreshLeaderboardValidation(leaderboardId) {
        this.invalidLeaderboards.delete(leaderboardId);
        this.lastValidationCheck.delete(leaderboardId);
        console.log(`Refreshed validation for leaderboard ${leaderboardId}`);
    }

    /**
     * ADDED: Get challenge summary text for notifications
     * @param {Object} challenge - Challenge object
     * @returns {string} Summary text
     */
    getChallengeSignature(challenge) {
        const gameTitle = titleUtils.createShortGameDisplayName(challenge.gameTitle, 30);
        const description = challenge.description ? 
            ` - ${titleUtils.formatChallengeDescription(challenge.description, 50)}` : '';
        
        return `${gameTitle}${description}`;
    }

    /**
     * ADDED: Format challenge participants list
     * @param {Object} challenge - Challenge object
     * @param {number} maxLength - Maximum length for the list
     * @returns {string} Formatted participants list
     */
    formatParticipantsList(challenge, maxLength = 100) {
        if (!challenge.participants || challenge.participants.length === 0) {
            return 'No participants';
        }
        
        const participantNames = challenge.participants.map(p => p.raUsername);
        let result = participantNames.join(', ');
        
        if (result.length > maxLength) {
            // Truncate and add count
            const truncated = titleUtils.truncateText(result, maxLength - 10);
            const remaining = challenge.participants.length - truncated.split(', ').length;
            if (remaining > 0) {
                result = `${truncated} (+${remaining} more)`;
            } else {
                result = truncated;
            }
        }
        
        return result;
    }
}

export default new ArenaUtils();
