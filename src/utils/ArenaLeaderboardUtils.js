// src/utils/ArenaLeaderboardUtils.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { formatTimeRemaining } from './FeedUtils.js';
import { processLeaderboardEntries, findUserInLeaderboard } from './arenaUtils.js';
import RetroAPIUtils from './RetroAPIUtils.js';

/**
 * Utility class for handling arena leaderboard refresh functionality
 */
export class ArenaLeaderboardUtils {
    /**
     * Refresh leaderboard for a direct challenge (1v1)
     * @param {Object} interaction - Discord interaction
     * @param {Object} challenge - Challenge object
     */
    static async refreshDirectChallengeLeaderboard(interaction, challenge) {
        try {
            // Get current leaderboard data from RetroAchievements API
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
            const leaderboardEntries = processLeaderboardEntries(rawEntries);
            
            // Find challenger and challengee entries
            const challengerEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengerUsername);
            const challengeeEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengeeUsername);
            
            // Format scores for display
            const challengerScore = {
                value: challengerEntry ? challengerEntry.Value : 0,
                formattedScore: challengerEntry ? challengerEntry.FormattedScore : 'No score yet',
                exists: !!challengerEntry,
                rank: challengerEntry ? challengerEntry.ApiRank : 0
            };
            
            const challengeeScore = {
                value: challengeeEntry ? challengeeEntry.Value : 0,
                formattedScore: challengeeEntry ? challengeeEntry.FormattedScore : 'No score yet',
                exists: !!challengeeEntry,
                rank: challengeeEntry ? challengeeEntry.ApiRank : 0
            };
            
            // Determine who's leading based on rank only (lower rank is better)
            let leader = null;
            if (challengerScore.exists && challengeeScore.exists) {
                if (challengerScore.rank < challengeeScore.rank) {
                    leader = challenge.challengerUsername;
                } else if (challengeeScore.rank < challengerScore.rank) {
                    leader = challenge.challengeeUsername;
                } else {
                    leader = 'Tie';
                }
            }
            
            // Get leaderboard URL
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
            
            // Create embed for display
            const embed = new EmbedBuilder()
                .setColor('#FF5722') // Red for arena challenges
                .setTitle(`Live Leaderboard: ${challenge.gameTitle}`)
                .setDescription(
                    `**Challenge:** ${challenge.challengerUsername} vs ${challenge.challengeeUsername}\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n` +
                    `**Time Remaining:** ${formatTimeRemaining(challenge.endDate)}\n` +
                    `**Leaderboard:** [View on RetroAchievements](${leaderboardUrl})\n\n` +
                    `${leader ? `**Current Leader:** ${leader === 'Tie' ? 'Tied!' : leader}` : ''}`
                );
                
            // Add challenger info with global rank
            const challengerRankText = challengerScore.rank ? ` (Global: #${challengerScore.rank})` : '';
            embed.addFields({
                name: `${challenge.challengerUsername}${leader === challenge.challengerUsername ? ' 👑' : ''}`,
                value: challengerScore.exists ? 
                    `**Score:** ${challengerScore.formattedScore}${challengerRankText}` : 
                    'No score recorded yet'
            });
            
            // Add challengee info with global rank
            const challengeeRankText = challengeeScore.rank ? ` (Global: #${challengeeScore.rank})` : '';
            embed.addFields({
                name: `${challenge.challengeeUsername}${leader === challenge.challengeeUsername ? ' 👑' : ''}`,
                value: challengeeScore.exists ? 
                    `**Score:** ${challengeeScore.formattedScore}${challengeeRankText}` : 
                    'No score recorded yet'
            });
            
            // Add wager and bet info
            const totalWagered = challenge.wagerAmount * 2;
            const totalBets = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
            const totalPool = totalWagered + totalBets;
            
            embed.addFields({
                name: '💰 Prize Pool',
                value: `**Total Prize Pool:** ${totalPool} GP\n` +
                      `**Wager Amount:** ${challenge.wagerAmount} GP each\n` +
                      `**Betting Pool:** ${totalBets} GP`
            });
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Buttons row with refresh and back buttons
            const buttonsRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arena_refresh_leaderboard_${challenge._id}`)
                        .setLabel('Refresh Data')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄'),
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: [buttonsRow]
            });
        } catch (error) {
            console.error('Error refreshing direct challenge leaderboard:', error);
            await interaction.editReply('An error occurred while refreshing the leaderboard data.');
        }
    }

    /**
     * Refresh leaderboard for an open challenge (multiple participants)
     * @param {Object} interaction - Discord interaction
     * @param {Object} challenge - Challenge object
     */
    static async refreshOpenChallengeLeaderboard(interaction, challenge) {
        try {
            // Get current leaderboard data from RetroAchievements API
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
            const leaderboardEntries = processLeaderboardEntries(rawEntries);
            
            // Get leaderboard URL
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
            
            // Create embed for display
            const embed = new EmbedBuilder()
                .setColor('#3498DB')  // Blue for open challenges
                .setTitle(`Live Leaderboard: ${challenge.gameTitle} (Open Challenge)`)
                .setDescription(
                    `**Creator:** ${challenge.challengerUsername}\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n` +
                    `**Time Remaining:** ${formatTimeRemaining(challenge.endDate)}\n` +
                    `**Leaderboard:** [View on RetroAchievements](${leaderboardUrl})\n`
                );
                
            // Get all participants including creator
            const participants = [];
            
            // Add creator
            const creatorEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengerUsername);
            participants.push({
                username: challenge.challengerUsername,
                isCreator: true,
                score: creatorEntry ? creatorEntry.FormattedScore : 'No score yet',
                exists: !!creatorEntry,
                rank: creatorEntry ? creatorEntry.ApiRank : 999999,
                value: creatorEntry ? creatorEntry.Value : 0
            });
            
            // Add all participants
            if (challenge.participants && challenge.participants.length > 0) {
                for (const participant of challenge.participants) {
                    const entry = findUserInLeaderboard(leaderboardEntries, participant.username);
                    participants.push({
                        username: participant.username,
                        isCreator: false,
                        score: entry ? entry.FormattedScore : 'No score yet',
                        exists: !!entry,
                        rank: entry ? entry.ApiRank : 999999,
                        value: entry ? entry.Value : 0
                    });
                }
            }
            
            // Sort participants by global rank (lower is better)
            participants.sort((a, b) => {
                // Put participants with scores first
                if (a.exists && !b.exists) return -1;
                if (!a.exists && b.exists) return 1;
                
                // If both have scores, sort by global rank
                if (a.exists && b.exists) {
                    return a.rank - b.rank;
                }
                
                return 0;
            });
            
            // Build standings text
            let standingsText = '';
            participants.forEach((participant, index) => {
                const medal = index === 0 ? '👑 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '';
                const creatorTag = participant.isCreator ? ' (Creator)' : '';
                const rankText = participant.rank < 999999 ? ` (Global: #${participant.rank})` : '';
                
                standingsText += `${medal}**${participant.username}${creatorTag}**: ${participant.score}${rankText}\n`;
            });
            
            embed.addFields({
                name: '📊 Current Standings',
                value: standingsText || 'No participants have scores yet.'
            });
            
            // Add wager and prize info
            const participantCount = challenge.participants?.length + 1 || 1; // +1 for creator
            const totalWagered = challenge.wagerAmount * participantCount;
            const totalBets = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
            const totalPool = totalWagered + totalBets;
            
            embed.addFields({
                name: '💰 Prize Pool',
                value: 
                    `**Total Prize Pool:** ${totalPool} GP\n` +
                    `**Wager Amount:** ${challenge.wagerAmount} GP per player\n` +
                    `**Total Participants:** ${participantCount}\n` +
                    `**Betting Pool:** ${totalBets} GP`
            });
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Buttons row with refresh and back buttons
            const buttonsRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arena_refresh_leaderboard_${challenge._id}`)
                        .setLabel('Refresh Data')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄'),
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: [buttonsRow]
            });
        } catch (error) {
            console.error('Error refreshing open challenge leaderboard:', error);
            await interaction.editReply('An error occurred while refreshing the leaderboard data.');
        }
    }

    /**
     * Get live scores for updating challenge feeds
     * @param {Object} challenge - Challenge object
     * @returns {Object} - Score information
     */
    static async getLiveScores(challenge) {
        try {
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
            const leaderboardEntries = processLeaderboardEntries(rawEntries);
            
            const scores = {
                participants: new Map()
            };
            
            // Get challenger score
            const challengerEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengerUsername);
            scores.challenger = {
                exists: !!challengerEntry,
                formattedScore: challengerEntry ? challengerEntry.FormattedScore : 'No score yet',
                rank: challengerEntry ? challengerEntry.ApiRank : 0,
                value: challengerEntry ? challengerEntry.Value : 0
            };
            
            // Get challengee score (if not open challenge)
            if (!challenge.isOpenChallenge && challenge.challengeeUsername) {
                const challengeeEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengeeUsername);
                scores.challengee = {
                    exists: !!challengeeEntry,
                    formattedScore: challengeeEntry ? challengeeEntry.FormattedScore : 'No score yet',
                    rank: challengeeEntry ? challengeeEntry.ApiRank : 0,
                    value: challengeeEntry ? challengeeEntry.Value : 0
                };
            }
            
            // Get participant scores (for open challenges)
            if (challenge.participants && challenge.participants.length > 0) {
                for (const participant of challenge.participants) {
                    const entry = findUserInLeaderboard(leaderboardEntries, participant.username);
                    scores.participants.set(participant.username.toLowerCase(), {
                        exists: !!entry,
                        formattedScore: entry ? entry.FormattedScore : 'No score yet',
                        rank: entry ? entry.ApiRank : 0,
                        value: entry ? entry.Value : 0
                    });
                }
            }
            
            return scores;
        } catch (error) {
            console.error('Error getting live scores:', error);
            return null;
        }
    }
}

export default ArenaLeaderboardUtils;
