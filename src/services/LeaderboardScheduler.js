import cron from 'node-cron';
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { HistoricalLeaderboard } from '../models/HistoricalLeaderboard.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';
import leaderboardCommand from '../commands/user/leaderboard.js';

// Helper function to get month key from date (YYYY-MM format)
function getMonthKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

// Award emojis (should match the ones in leaderboard.js)
const AWARD_EMOJIS = {
    MASTERY: '✨',
    BEATEN: '⭐',
    PARTICIPATION: '🏁'
};

const TIEBREAKER_EMOJI = '⚔️';

export class LeaderboardScheduler {
    constructor(client) {
        this.client = client;
        this.initialized = false;
    }

    // Initialize the scheduler
    initialize() {
        if (this.initialized) return;

        // Schedule task to run at 00:15 on the 1st day of each month
        // This gives a buffer after midnight to ensure all systems are ready
        cron.schedule('15 0 1 * *', async () => {
            console.log('Running scheduled leaderboard finalization task');
            await this.finalizeLeaderboard();
        });

        this.initialized = true;
        console.log('Leaderboard scheduler initialized');
    }

    // Method to finalize the previous month's leaderboard
    async finalizeLeaderboard() {
        try {
            // Get current date
            const now = new Date();
            
            // Get previous month
            let prevMonth = now.getMonth() - 1;
            let prevYear = now.getFullYear();
            if (prevMonth < 0) {
                prevMonth = 11;  // December
                prevYear = now.getFullYear() - 1;
            }
            
            const prevMonthStart = new Date(prevYear, prevMonth, 1);
            const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            
            // Get month key
            const monthKey = getMonthKey(prevMonthStart);
            const monthName = prevMonthStart.toLocaleString('default', { month: 'long' });
            
            console.log(`Attempting to finalize leaderboard for ${monthKey}`);
            
            // Check if already finalized
            const existingLeaderboard = await HistoricalLeaderboard.findOne({ 
                monthKey,
                isFinalized: true 
            });
            
            if (existingLeaderboard) {
                console.log(`Leaderboard for ${monthKey} is already finalized`);
                
                // If not yet announced, announce it now
                if (!existingLeaderboard.resultsAnnounced) {
                    console.log(`Announcing results for ${monthKey}`);
                    await this.announceResults(existingLeaderboard);
                }
                
                return;
            }
            
            // Get the challenge for the previous month
            const challenge = await Challenge.findOne({
                date: {
                    $gte: prevMonthStart,
                    $lt: prevMonthEnd
                }
            });
            
            if (!challenge) {
                console.error(`No challenge found for ${monthKey}`);
                return;
            }
            
            // Get game info - use stored metadata if available, or fetch it
            let gameTitle = challenge.monthly_game_title;
            let gameImageUrl = challenge.monthly_game_icon_url;
            let consoleName = challenge.monthly_game_console;
            
            // If metadata isn't stored in the Challenge model, fetch it
            if (!gameTitle || !gameImageUrl) {
                try {
                    const gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
                    gameTitle = gameInfo.title;
                    gameImageUrl = gameInfo.imageIcon;
                    consoleName = gameInfo.consoleName;
                    
                    // Update the challenge with this metadata for future use
                    if (gameInfo) {
                        challenge.monthly_game_title = gameTitle;
                        challenge.monthly_game_icon_url = gameImageUrl;
                        challenge.monthly_game_console = consoleName;
                        await challenge.save();
                    }
                } catch (error) {
                    console.error(`Error fetching game info for ${challenge.monthly_challange_gameid}:`, error);
                }
            }
            
            // Get all users and their progress for the challenge
            const users = await User.find({});
            const monthKeyForUser = User.formatDateKey(challenge.date);
            
            // Get all users who participated in the challenge
            const participants = users.filter(user => 
                user.monthlyChallenges && 
                user.monthlyChallenges.has(monthKeyForUser) &&
                user.monthlyChallenges.get(monthKeyForUser).achievements > 0
            );
            
            if (participants.length === 0) {
                console.warn(`No participants found for the ${monthKey} challenge`);
                return;
            }
            
            // Map user data to the format needed for the historical leaderboard
            const leaderboardParticipants = participants.map(user => {
                const challengeData = user.monthlyChallenges.get(monthKeyForUser);
                const points = challengeData.progress || 0;
                
                // Determine award emoji based on points
                let award = '';
                if (points === 7) award = AWARD_EMOJIS.MASTERY;
                else if (points === 4) award = AWARD_EMOJIS.BEATEN;
                else if (points === 1) award = AWARD_EMOJIS.PARTICIPATION;
                
                return {
                    username: user.raUsername,
                    achievements: challengeData.achievements,
                    percentage: challengeData.percentage,
                    points: points,
                    award: award
                };
            });
            
            // Sort participants by achievements and points
            leaderboardParticipants.sort((a, b) => {
                if (b.achievements !== a.achievements) {
                    return b.achievements - a.achievements;
                }
                return b.points - a.points;
            });
            
            // Check if there was a tiebreaker for this month
            const tiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                monthKey: monthKey
            });
            
            // Process tiebreaker information if available
            let tiebreakerEntries = [];
            let tiebreakerInfo = null;
            
            if (tiebreaker) {
                try {
                    // Fetch tiebreaker leaderboard entries
                    const batch1 = await retroAPI.getLeaderboardEntriesDirect(tiebreaker.leaderboardId, 0, 500);
                    const batch2 = await retroAPI.getLeaderboardEntriesDirect(tiebreaker.leaderboardId, 500, 500);
                    
                    // Process entries (similar to the display logic)
                    let rawEntries = [];
                    
                    if (batch1) {
                        if (Array.isArray(batch1)) {
                            rawEntries = [...rawEntries, ...batch1];
                        } else if (batch1.Results && Array.isArray(batch1.Results)) {
                            rawEntries = [...rawEntries, ...batch1.Results];
                        }
                    }
                    
                    if (batch2) {
                        if (Array.isArray(batch2)) {
                            rawEntries = [...rawEntries, ...batch2];
                        } else if (batch2.Results && Array.isArray(batch2.Results)) {
                            rawEntries = [...rawEntries, ...batch2.Results];
                        }
                    }
                    
                    tiebreakerEntries = rawEntries.map(entry => {
                        const user = entry.User || entry.user || '';
                        const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                        const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                        const rank = entry.Rank || entry.rank || 0;
                        
                        return {
                            username: user.trim().toLowerCase(),
                            score: formattedScore,
                            apiRank: parseInt(rank, 10)
                        };
                    });
                    
                    // Store tiebreaker info
                    tiebreakerInfo = {
                        gameId: tiebreaker.gameId,
                        gameTitle: tiebreaker.gameTitle,
                        leaderboardId: tiebreaker.leaderboardId,
                        isActive: true
                    };
                } catch (error) {
                    console.error('Error fetching tiebreaker entries:', error);
                }
            }
            
            // Store original order for stable sorting
            leaderboardParticipants.forEach((participant, index) => {
                participant.originalIndex = index;
            });
            
            // Add tiebreaker info to participants
            if (tiebreakerEntries && tiebreakerEntries.length > 0) {
                for (const participant of leaderboardParticipants) {
                    const entry = tiebreakerEntries.find(e => 
                        e.username === participant.username.toLowerCase()
                    );
                    
                    if (entry) {
                        participant.tiebreakerScore = entry.score;
                        participant.tiebreakerRank = entry.apiRank;
                        participant.hasTiebreaker = true;
                    } else {
                        participant.hasTiebreaker = false;
                    }
                }
            }
            
            // Apply the same rank calculation logic as in the leaderboard command
            leaderboardCommand.assignRanks(leaderboardParticipants, tiebreakerEntries, tiebreaker);
            
            // Create winners array (top 3 participants)
            const winners = leaderboardParticipants
                .filter(p => p.displayRank <= 3)
                .map(p => ({
                    rank: p.displayRank,
                    username: p.username,
                    achievements: p.achievements,
                    percentage: p.percentage,
                    award: p.award,
                    points: p.points,
                    tiebreakerScore: p.tiebreakerScore || null
                }));
            
            // Check for shadow challenge info
            let shadowChallengeInfo = null;
            if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                // Get shadow game info - use stored metadata if available, or fetch it
                let shadowGameTitle = challenge.shadow_game_title;
                let shadowGameImageUrl = challenge.shadow_game_icon_url;
                
                // If metadata isn't stored in the Challenge model, fetch it
                if (!shadowGameTitle || !shadowGameImageUrl) {
                    try {
                        const shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
                        shadowGameTitle = shadowGameInfo.title;
                        shadowGameImageUrl = shadowGameInfo.imageIcon;
                        
                        // Update the challenge with this metadata for future use
                        if (shadowGameInfo) {
                            challenge.shadow_game_title = shadowGameTitle;
                            challenge.shadow_game_icon_url = shadowGameImageUrl;
                            await challenge.save();
                        }
                    } catch (error) {
                        console.error(`Error fetching shadow game info for ${challenge.shadow_challange_gameid}:`, error);
                    }
                }
                
                shadowChallengeInfo = {
                    gameId: challenge.shadow_challange_gameid,
                    gameTitle: shadowGameTitle,
                    gameImageUrl: shadowGameImageUrl,
                    totalAchievements: challenge.shadow_challange_game_total,
                    wasRevealed: true
                };
            }
            
            // Create the historical leaderboard record
            const historicalLeaderboard = new HistoricalLeaderboard({
                monthKey: monthKey,
                date: prevMonthStart,
                challengeId: challenge._id,
                gameId: challenge.monthly_challange_gameid,
                gameTitle: gameTitle,
                gameImageUrl: gameImageUrl,
                consoleName: consoleName,
                totalAchievements: challenge.monthly_challange_game_total,
                progressionAchievements: challenge.monthly_challange_progression_achievements || [],
                winAchievements: challenge.monthly_challange_win_achievements || [],
                participants: leaderboardParticipants,
                winners: winners,
                tiebreakerInfo: tiebreakerInfo,
                shadowChallengeInfo: shadowChallengeInfo,
                isFinalized: true,
                resultsAnnounced: false
            });
            
            // Save the historical leaderboard
            await historicalLeaderboard.save();
            console.log(`Successfully finalized leaderboard for ${monthKey}`);
            
            // Announce results
            await this.announceResults(historicalLeaderboard);
            
        } catch (error) {
            console.error('Error in automatic leaderboard finalization:', error);
        }
    }
    
    // Method to announce results
    async announceResults(leaderboard) {
        try {
            // Get the announcement channel from config
            const announcementChannelId = config.discord.announcementChannelId;
            
            if (!announcementChannelId) {
                console.error('Announcement channel ID is not configured in config.js');
                return;
            }
            
            // Get the guild and channel
            const guild = this.client.guilds.cache.first(); // Assumes bot is in only one guild
            if (!guild) {
                console.error('Could not find guild for announcement');
                return;
            }
            
            const announcementChannel = await guild.channels.fetch(announcementChannelId);
            
            if (!announcementChannel) {
                console.error(`Announcement channel with ID ${announcementChannelId} not found`);
                return;
            }
            
            // Format date for display
            const date = new Date(leaderboard.date);
            const monthName = date.toLocaleString('default', { month: 'long' });
            const year = date.getFullYear();
            
            // Create the announcement embed using Discord.js
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${monthName} ${year} Challenge Results 🏆`)
                .setColor('#FFD700')
                .setDescription(`The results for the **${monthName} ${year}** monthly challenge are in! Congratulations to all participants who tackled **${leaderboard.gameTitle}**!`)
                .setThumbnail(`https://retroachievements.org${leaderboard.gameImageUrl}`);
                
            // Add winners section
            if (leaderboard.winners && leaderboard.winners.length > 0) {
                let winnersText = '';
                
                leaderboard.winners.forEach(winner => {
                    const medalEmoji = winner.rank === 1 ? '🥇' : (winner.rank === 2 ? '🥈' : '🥉');
                    winnersText += `${medalEmoji} **${winner.username}**: ${winner.achievements}/${leaderboard.totalAchievements} (${winner.percentage}%) ${winner.award}\n`;
                    
                    // Add tiebreaker info if available
                    if (winner.tiebreakerScore) {
                        winnersText += `   ${TIEBREAKER_EMOJI} Tiebreaker: ${winner.tiebreakerScore}\n`;
                    }
                });
                
                embed.addFields({
                    name: 'Winners',
                    value: winnersText
                });
            } else {
                embed.addFields({
                    name: 'No Winners',
                    value: 'No participants qualified for the top 3 positions.'
                });
            }
            
            // Add total participants count
            embed.addFields({
                name: 'Participation',
                value: `A total of **${leaderboard.participants.length}** members participated in this challenge.`
            });
            
            // Add shadow challenge info if applicable
            if (leaderboard.shadowChallengeInfo && leaderboard.shadowChallengeInfo.wasRevealed) {
                embed.addFields({
                    name: 'Shadow Challenge',
                    value: `This month also featured a shadow challenge: **${leaderboard.shadowChallengeInfo.gameTitle}**`
                });
            }
            
            // Add view leaderboard instructions
            embed.addFields({
                name: 'View Complete Leaderboard',
                value: 'Use `/leaderboard history:true` to view the full historical leaderboard and see all participants.'
            });
            
            embed.setFooter({ text: 'Monthly Challenge • RetroAchievements' });
            embed.setTimestamp();
            
            // Send the announcement
            await announcementChannel.send({ embeds: [embed] });
            
            // Update the historical leaderboard to mark as announced
            leaderboard.resultsAnnounced = true;
            await leaderboard.save();
            
            // Attempt to notify the API to refresh its cache
            try {
                const response = await fetch('https://select-start-api-production.up.railway.app/api/admin/force-update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': '0000'
                    },
                    body: JSON.stringify({ target: 'leaderboards' })
                });
                
                console.log('API notification response:', response.ok ? 'Success' : 'Failed');
            } catch (apiError) {
                console.error('Error notifying API:', apiError);
                // Continue execution even if API notification fails
            }
            
            console.log(`Successfully announced the results for ${monthName} ${year}`);
            
        } catch (error) {
            console.error('Error announcing results:', error);
        }
    }
}
