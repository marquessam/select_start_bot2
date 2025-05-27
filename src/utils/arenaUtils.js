// src/utils/arenaUtils.js
import { config } from '../config/config.js';

class ArenaUtils {
    /**
     * Fetch leaderboard scores for specific users
     */
    async fetchLeaderboardScores(gameId, leaderboardId, raUsernames) {
        try {
            console.log(`Fetching leaderboard scores for game ${gameId}, leaderboard ${leaderboardId}`);
            console.log('Target users:', raUsernames);

            const url = `https://retroachievements.org/API/API_GetLeaderboardEntries.php`;
            const params = new URLSearchParams({
                z: config.retroachievements.username,
                y: config.retroachievements.apiKey,
                i: leaderboardId,
                o: 1, // Offset
                c: 500 // Count - get more entries to ensure we find all users
            });

            const response = await fetch(`${url}?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data || !Array.isArray(data)) {
                console.log('No leaderboard data received or invalid format');
                return this.createNoScoreResults(raUsernames);
            }

            console.log(`Fetched ${data.length} leaderboard entries`);

            // Find entries for our target users
            const userScores = [];
            
            for (const username of raUsernames) {
                const entry = data.find(entry => {
                    const entryUser = entry.User || entry.user || entry.UserName || entry.username;
                    return entryUser && entryUser.toLowerCase() === username.toLowerCase();
                });

                if (entry) {
                    userScores.push({
                        raUsername: username,
                        rank: this.parseRank(entry.Rank || entry.rank),
                        score: this.formatScore(entry.Score || entry.score),
                        fetchedAt: new Date()
                    });
                    console.log(`Found score for ${username}: rank ${entry.Rank || entry.rank}, score ${entry.Score || entry.score}`);
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
     * Get game information from RetroAchievements API
     */
    async getGameInfo(gameId) {
        try {
            const url = `https://retroachievements.org/API/API_GetGame.php`;
            const params = new URLSearchParams({
                z: config.retroachievements.username,
                y: config.retroachievements.apiKey,
                i: gameId
            });

            const response = await fetch(`${url}?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data || !data.Title) {
                return null;
            }

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
     * Get leaderboard information for a specific game
     */
    async getLeaderboardInfo(gameId, leaderboardId) {
        try {
            const url = `https://retroachievements.org/API/API_GetGameLeaderboards.php`;
            const params = new URLSearchParams({
                z: config.retroachievements.username,
                y: config.retroachievements.apiKey,
                i: gameId
            });

            const response = await fetch(`${url}?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data || !Array.isArray(data)) {
                return null;
            }

            // Find the specific leaderboard
            const leaderboard = data.find(lb => 
                String(lb.ID) === String(leaderboardId) || 
                String(lb.id) === String(leaderboardId)
            );

            if (!leaderboard) {
                return null;
            }

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
     * Format a challenge for display
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
     * Create challenge embed for Discord
     */
    createChallengeEmbed(challenge, color = '#0099ff') {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle(`${challenge.type === 'direct' ? '⚔️ Direct Challenge' : '🌍 Open Challenge'}`)
            .setDescription(this.formatChallengeDisplay(challenge))
            .setColor(color)
            .addFields(
                { name: 'Challenge ID', value: challenge.challengeId, inline: true },
                { name: 'Created by', value: challenge.creatorRaUsername, inline: true },
                { name: 'Status', value: challenge.status.charAt(0).toUpperCase() + challenge.status.slice(1), inline: true }
            )
            .setTimestamp(challenge.createdAt);

        // Add game thumbnail if available
        if (challenge.gameId) {
            embed.setThumbnail(`https://retroachievements.org/Images/${challenge.gameId}.png`);
        }

        return embed;
    }
}

export default new ArenaUtils();
