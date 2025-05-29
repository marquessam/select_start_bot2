// src/utils/arenaUtils.js - UPDATED with gear for creator
import { config } from '../config/config.js';

class ArenaUtils {
    /**
     * Get RetroAchievements API credentials using environment variables (like retroAPI)
     * @private
     */
    getRACredentials() {
        const username = process.env.RA_USERNAME;
        const apiKey = process.env.RA_API_KEY;
        
        if (!username || !apiKey) {
            throw new Error('RetroAchievements API credentials not found. Please set RA_USERNAME and RA_API_KEY environment variables.');
        }
        
        return { username, apiKey };
    }

    /**
     * Get leaderboard entries using direct API request (following retroAPI pattern)
     * @param {number} leaderboardId - RetroAchievements leaderboard ID
     * @param {number} offset - Starting position (0-based)
     * @param {number} count - Number of entries to retrieve
     * @returns {Promise<Object>} Leaderboard data object with Results array
     */
    async getLeaderboardEntriesDirect(leaderboardId, offset = 0, count = 1000) {
        try {
            const { username, apiKey } = this.getRACredentials();
            
            // Make direct API request to the RetroAchievements leaderboard endpoint (same as retroAPI)
            const url = `https://retroachievements.org/API/API_GetLeaderboardEntries.php?i=${leaderboardId}&o=${offset}&c=${count}&z=${username}&y=${apiKey}`;
            
            console.log(`Fetching leaderboard entries for leaderboard ${leaderboardId} (offset: ${offset}, count: ${count})`);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`Successfully fetched ${data?.Results?.length || 0} leaderboard entries`);
            
            return data;
        } catch (error) {
            console.error(`Error fetching direct leaderboard entries for ${leaderboardId}:`, error);
            return { Results: [] }; // Return empty Results array for consistent structure
        }
    }

    /**
     * Process leaderboard entries to standardize the format (following retroAPI pattern)
     * @param {Object|Array} data - Raw API response
     * @returns {Array} Standardized leaderboard entries
     */
    processLeaderboardEntries(data) {
        // Check if we have a Results array (API sometimes returns different formats)
        const entries = data.Results || data;
        
        if (!entries || !Array.isArray(entries)) {
            return [];
        }
        
        // Convert entries to a standard format (same as retroAPI)
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
                RawScore: score, // Keep raw score for sorting
                FormattedScore: formattedScore // Keep formatted score
            };
        }).filter(entry => entry.User.length > 0);
    }

    /**
     * Fetch leaderboard scores for specific users (updated to use 1000 entries like arcade)
     */
    async fetchLeaderboardScores(gameId, leaderboardId, raUsernames) {
        try {
            console.log(`Fetching leaderboard scores for game ${gameId}, leaderboard ${leaderboardId}`);
            console.log('Target users:', raUsernames);

            // Fetch up to 1000 entries like the arcade service does
            const data = await this.getLeaderboardEntriesDirect(leaderboardId, 0, 1000);
            
            // Process entries to standardized format
            const processedEntries = this.processLeaderboardEntries(data);
            
            if (!processedEntries || processedEntries.length === 0) {
                console.log('No leaderboard data received or invalid format');
                return this.createNoScoreResults(raUsernames);
            }

            console.log(`Processed ${processedEntries.length} leaderboard entries`);

            // Find entries for our target users (same logic as before)
            const userScores = [];
            
            for (const username of raUsernames) {
                const entry = processedEntries.find(entry => {
                    return entry.User && entry.User.toLowerCase() === username.toLowerCase();
                });

                if (entry) {
                    userScores.push({
                        raUsername: username,
                        rank: entry.ApiRank,
                        score: entry.TrackTime,
                        fetchedAt: new Date()
                    });
                    console.log(`Found score for ${username}: rank ${entry.ApiRank}, score ${entry.TrackTime}`);
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
            console.error('Error fetching leaderboard scores:', error);
            
            // Return no-score results for all users on error
            return this.createNoScoreResults(raUsernames);
        }
    }

    /**
     * Create no-score results for all users
     * @private
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
     * Parse rank value to ensure it's a number
     * @private
     */
    parseRank(rank) {
        if (rank === null || rank === undefined || rank === '') {
            return null;
        }
        
        const parsed = parseInt(rank, 10);
        return isNaN(parsed) ? null : parsed;
    }

    /**
     * Format score for display
     * @private
     */
    formatScore(score) {
        if (score === null || score === undefined || score === '') {
            return 'No score';
        }
        
        // If it's a number, format it nicely
        if (typeof score === 'number') {
            return score.toLocaleString();
        }
        
        // If it's a string that looks like a number, parse and format
        const parsed = parseFloat(score);
        if (!isNaN(parsed)) {
            return parsed.toLocaleString();
        }
        
        // Otherwise return as string
        return String(score);
    }

    /**
     * Determine the winner from final scores
     * Lower rank wins (rank 1 is better than rank 2)
     */
    determineWinner(finalScores) {
        try {
            console.log('Determining winner from scores:', finalScores);

            if (!finalScores || finalScores.length === 0) {
                console.log('No scores to evaluate');
                return null;
            }

            // Filter out users with no valid rank
            const validScores = finalScores.filter(score => 
                score.rank !== null && 
                score.rank !== undefined && 
                !isNaN(score.rank) && 
                score.rank > 0
            );

            console.log('Valid scores:', validScores);

            if (validScores.length === 0) {
                console.log('No valid scores found');
                return null;
            }

            // Sort by rank (lower is better)
            validScores.sort((a, b) => a.rank - b.rank);

            const bestRank = validScores[0].rank;
            const winners = validScores.filter(score => score.rank === bestRank);

            console.log(`Best rank: ${bestRank}, Winners with this rank:`, winners);

            if (winners.length > 1) {
                console.log('Tie detected - multiple users with same best rank');
                return null; // Tie
            }

            console.log(`Winner determined: ${winners[0].raUsername} with rank ${winners[0].rank}`);
            return winners[0];
        } catch (error) {
            console.error('Error determining winner:', error);
            return null;
        }
    }

    /**
     * Validate game and leaderboard info from RetroAchievements API
     */
    async validateGameAndLeaderboard(gameId, leaderboardId) {
        try {
            // First, validate the game exists
            const gameInfo = await this.getGameInfo(gameId);
            if (!gameInfo) {
                throw new Error(`Game with ID ${gameId} not found`);
            }

            // Then validate the leaderboard exists for this game
            const leaderboardInfo = await this.getLeaderboardInfo(gameId, leaderboardId);
            if (!leaderboardInfo) {
                throw new Error(`Leaderboard with ID ${leaderboardId} not found for game ${gameId}`);
            }

            return {
                game: gameInfo,
                leaderboard: leaderboardInfo
            };
        } catch (error) {
            console.error('Error validating game and leaderboard:', error);
            throw error;
        }
    }

    /**
     * Get game information from RetroAchievements API (following retroAPI pattern)
     */
    async getGameInfo(gameId) {
        try {
            const { username, apiKey } = this.getRACredentials();

            const url = `https://retroachievements.org/API/API_GetGame.php`;
            const params = new URLSearchParams({
                z: username,
                y: apiKey,
                i: gameId
            });

            console.log(`Fetching game info for ID ${gameId}...`);
            const response = await fetch(`${url}?${params}`);
            
            if (!response.ok) {
                console.error(`HTTP error fetching game ${gameId}! status: ${response.status}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Check if we got valid game data
            if (!data || !data.Title) {
                console.error(`No valid game data received for ID ${gameId}:`, data);
                return null;
            }

            console.log(`✅ Successfully fetched game: ${data.Title} (ID: ${gameId})`);
            return {
                id: data.ID || gameId,
                title: data.Title,
                consoleName: data.ConsoleName,
                imageIcon: data.ImageIcon,
                description: data.Description || ''
            };
        } catch (error) {
            console.error(`Error fetching game info for ${gameId}:`, error);
            return null;
        }
    }

    /**
     * Get leaderboard information for a specific game (following retroAPI pattern)
     */
    async getLeaderboardInfo(gameId, leaderboardId) {
        try {
            const { username, apiKey } = this.getRACredentials();

            const url = `https://retroachievements.org/API/API_GetGameLeaderboards.php`;
            const params = new URLSearchParams({
                z: username,
                y: apiKey,
                i: gameId
            });

            console.log(`Fetching leaderboards for game ID ${gameId}...`);
            const response = await fetch(`${url}?${params}`);
            
            if (!response.ok) {
                console.error(`HTTP error fetching leaderboards for game ${gameId}! status: ${response.status}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Handle different API response formats - check for Results array first
            let leaderboards = [];
            if (data && data.Results && Array.isArray(data.Results)) {
                leaderboards = data.Results;
                console.log(`Fetched ${leaderboards.length} leaderboards for game ${gameId} (from Results array)`);
            } else if (Array.isArray(data)) {
                leaderboards = data;
                console.log(`Fetched ${leaderboards.length} leaderboards for game ${gameId} (direct array)`);
            } else {
                console.error(`No valid leaderboard data received for game ${gameId}:`, data);
                return null;
            }

            if (leaderboards.length === 0) {
                console.error(`No leaderboards found for game ${gameId}`);
                return null;
            }

            // Find the specific leaderboard
            const leaderboard = leaderboards.find(lb => 
                String(lb.ID) === String(leaderboardId) || 
                String(lb.id) === String(leaderboardId)
            );

            if (!leaderboard) {
                console.error(`Leaderboard ${leaderboardId} not found in game ${gameId} leaderboards`);
                console.log(`Available leaderboards:`, leaderboards.map(lb => ({
                    ID: lb.ID || lb.id,
                    Title: lb.Title || lb.title
                })));
                return null;
            }

            console.log(`✅ Found leaderboard: ${leaderboard.Title || leaderboard.title} (ID: ${leaderboardId})`);
            return {
                id: leaderboard.ID || leaderboard.id,
                title: leaderboard.Title || leaderboard.title,
                description: leaderboard.Description || leaderboard.description || '',
                format: leaderboard.Format || leaderboard.format || 'score',
                lowerIsBetter: leaderboard.LowerIsBetter || leaderboard.lowerIsBetter || false
            };
        } catch (error) {
            console.error(`Error fetching leaderboard info for game ${gameId}, leaderboard ${leaderboardId}:`, error);
            return null;
        }
    }

    /**
     * Search for games by title (helper for UI)
     */
    async searchGames(query) {
        try {
            // Note: RetroAchievements doesn't have a direct search API
            // This would need to be implemented based on available API endpoints
            // For now, we'll return an empty array
            console.log(`Game search not yet implemented for query: ${query}`);
            return [];
        } catch (error) {
            console.error('Error searching games:', error);
            return [];
        }
    }

    /**
     * Format a challenge for display - UPDATED to include gear for creator
     */
    formatChallengeDisplay(challenge) {
        const statusEmoji = {
            'pending': '⏳',
            'active': '🔥',
            'completed': '✅',
            'cancelled': '❌'
        };

        const typeEmoji = challenge.type === 'direct' ? '⚔️' : '🌍';
        
        let description = `${statusEmoji[challenge.status]} ${typeEmoji} **${challenge.gameTitle}**\n`;
        description += `📊 ${challenge.leaderboardTitle}\n`;
        
        // ADD CHALLENGE DESCRIPTION IF PROVIDED
        if (challenge.description && challenge.description.trim()) {
            description += `📝 ${challenge.description}\n`;
        }
        
        // UPDATED: Gear for creator
        description += `⚙️ Created by: ${challenge.creatorRaUsername}\n`;
        description += `💰 Wager: ${challenge.participants[0]?.wager || 0} GP\n`;
        description += `👥 Participants: ${challenge.participants.length}`;
        
        if (challenge.bets.length > 0) {
            description += `\n🎰 Bets: ${challenge.bets.length} (${challenge.getTotalBets()} GP)`;
        }

        if (challenge.status === 'active' && challenge.endedAt) {
            const timeLeft = Math.max(0, challenge.endedAt.getTime() - Date.now());
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
            const daysLeft = Math.floor(hoursLeft / 24);
            
            if (daysLeft > 0) {
                description += `\n⏰ ${daysLeft} day(s) remaining`;
            } else if (hoursLeft > 0) {
                description += `\n⏰ ${hoursLeft} hour(s) remaining`;
            } else {
                description += `\n⏰ Ending soon`;
            }
        }

        return description;
    }

    /**
     * Create challenge embed for Discord - UPDATED to include gear for creator
     */
    createChallengeEmbed(challenge, color = '#0099ff') {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle(`${challenge.type === 'direct' ? '⚔️ Direct Challenge' : '🌍 Open Challenge'}`)
            .setDescription(this.formatChallengeDisplay(challenge))
            .setColor(color)
            .addFields(
                { name: 'Challenge ID', value: challenge.challengeId, inline: true },
                { name: 'Created by', value: `⚙️ ${challenge.creatorRaUsername}`, inline: true }, // UPDATED: Changed to gear
                { name: 'Status', value: challenge.status.charAt(0).toUpperCase() + challenge.status.slice(1), inline: true }
            );

        // ADD DESCRIPTION AS SEPARATE FIELD IF PROVIDED
        if (challenge.description && challenge.description.trim()) {
            embed.addFields({
                name: '📝 Challenge Description',
                value: challenge.description,
                inline: false
            });
        }

        embed.setTimestamp(challenge.createdAt);

        // Add game thumbnail if available
        if (challenge.gameId) {
            embed.setThumbnail(`https://retroachievements.org/Images/${challenge.gameId}.png`);
        }

        return embed;
    }
}

export default new ArenaUtils();
