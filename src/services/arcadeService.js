// src/services/arcadeService.js
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, createHeaderEmbed, getDiscordTimestamp } from '../utils/FeedUtils.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertUtils from '../utils/AlertUtils.js';

class ArcadeService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.announcementChannelId);
    }

    // Override shouldClearOnStart from base class
    shouldClearOnStart() {
        return false; // Don't clear the channel on start
    }

    // Override update method from base class
    async update() {
        try {
            // Check if there are completed racing challenges that need points awarded
            await this.checkCompletedRacingChallenges();
            
            // Check if any tiebreakers have ended
            await this.checkCompletedTiebreakers();
            
            // Check if it's December 1st to award arcade points
            const now = new Date();
            if (now.getMonth() === 11 && now.getDate() === 1) { // December is month 11 (0-indexed)
                await this.awardArcadePoints();
            }
        } catch (error) {
            console.error('Error in arcade service:', error);
        }
    }

    async checkCompletedRacingChallenges() {
        try {
            const now = new Date();
            
            // Find racing challenges that have ended but haven't had points awarded yet
            const completedChallenges = await ArcadeBoard.find({
                boardType: 'racing',
                endDate: { $lt: now },
                pointsAwarded: false
            });
            
            if (completedChallenges.length === 0) {
                return;
            }
            
            console.log(`Found ${completedChallenges.length} completed racing challenges to process`);
            
            for (const challenge of completedChallenges) {
                await this.awardRacingPoints(challenge);
            }
        } catch (error) {
            console.error('Error checking completed racing challenges:', error);
        }
    }

    async awardRacingPoints(racingBoard) {
        try {
            console.log(`Processing racing challenge: ${racingBoard.boardId}`);
            
            // Fetch leaderboard entries using our utility
            const allEntries = await RetroAPIUtils.getLeaderboardEntries(racingBoard.leaderboardId, 1000);
            if (!allEntries || allEntries.length === 0) {
                console.log('No leaderboard entries found');
                return;
            }
            
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to user objects
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user);
            }
            
            // Filter entries to only show registered users
            const filteredEntries = allEntries.filter(entry => {
                if (!entry.User) return false;
                const username = entry.User.toLowerCase().trim();
                return username && registeredUsers.has(username);
            });

            if (filteredEntries.length === 0) {
                console.log('No registered users found in the leaderboard');
                racingBoard.pointsAwarded = true;
                await racingBoard.save();
                return;
            }

            // Track awarded points and results
            const results = [];
            
            // Award points to the top 3 finishers
            const pointsDistribution = [3, 2, 1]; // 1st, 2nd, 3rd place
            
            for (let i = 0; i < Math.min(3, filteredEntries.length); i++) {
                const entry = filteredEntries[i];
                const pointsToAward = pointsDistribution[i];
                const userObj = registeredUsers.get(entry.User.toLowerCase());
                
                if (userObj) {
                    // Add community award
                    const monthName = racingBoard.startDate.toLocaleString('default', { month: 'long' });
                    const year = racingBoard.startDate.getFullYear();
                    const placement = i === 0 ? '1st' : (i === 1 ? '2nd' : '3rd');
                    
                    const awardTitle = `${placement} Place in ${monthName} ${year} Racing: ${racingBoard.gameTitle}`;
                    
                    userObj.communityAwards.push({
                        title: awardTitle,
                        points: pointsToAward,
                        awardedAt: new Date(),
                        awardedBy: 'Arcade System'
                    });
                    
                    await userObj.save();
                    
                    // Record result
                    results.push({
                        username: entry.User,
                        rank: i + 1,
                        time: entry.FormattedScore || entry.TrackTime || entry.Score,
                        points: pointsToAward
                    });
                }
            }
            
            // Update the racing board to mark points as awarded and store results
            racingBoard.pointsAwarded = true;
            racingBoard.results = results;
            await racingBoard.save();
            
            // Announce results
            await this.announceRacingResults(racingBoard, results);
            
            console.log(`Successfully awarded points for racing challenge ${racingBoard.boardId}`);
        } catch (error) {
            console.error('Error awarding racing points:', error);
        }
    }

    async checkCompletedTiebreakers() {
        try {
            const now = new Date();
            
            // Find tiebreakers that have ended
            const completedTiebreakers = await ArcadeBoard.find({
                boardType: 'tiebreaker',
                endDate: { $lt: now },
                pointsAwarded: false
            });
            
            if (completedTiebreakers.length === 0) {
                return;
            }
            
            console.log(`Found ${completedTiebreakers.length} completed tiebreakers to process`);
            
            for (const tiebreaker of completedTiebreakers) {
                await this.processTiebreakerResults(tiebreaker);
            }
        } catch (error) {
            console.error('Error checking completed tiebreakers:', error);
        }
    }

    async processTiebreakerResults(tiebreaker) {
        try {
            console.log(`Processing tiebreaker: ${tiebreaker.boardId}`);
            
            // Fetch leaderboard entries using our utility
            const allEntries = await RetroAPIUtils.getLeaderboardEntries(tiebreaker.leaderboardId, 1000);
            if (!allEntries || allEntries.length === 0) {
                console.log('No leaderboard entries found');
                return;
            }
            
            // Get usernames of tied users
            const tiedUsernames = tiebreaker.tiedUsers.map(username => username.toLowerCase());
            
            // Filter entries to only show tied users
            const filteredEntries = allEntries.filter(entry => 
                entry.User && tiedUsernames.includes(entry.User.toLowerCase())
            );

            if (filteredEntries.length === 0) {
                console.log('No tied users found in the leaderboard');
                tiebreaker.pointsAwarded = true;
                await tiebreaker.save();
                return;
            }

            // Sort entries by score
            filteredEntries.sort((a, b) => {
                // For racing games, lower times are better
                // This is a simplified comparison, may need adjustment based on actual time format
                return a.FormattedScore?.localeCompare(b.FormattedScore) || 
                       a.TrackTime?.localeCompare(b.TrackTime) || 
                       a.Score - b.Score;
            });
            
            // Get the winner (first place)
            const winner = filteredEntries[0];
            
            // Mark tiebreaker as completed
            tiebreaker.pointsAwarded = true;
            tiebreaker.results = filteredEntries.map((entry, index) => ({
                username: entry.User,
                rank: index + 1,
                time: entry.FormattedScore || entry.TrackTime || entry.Score.toString(),
                points: 0 // No points awarded for tiebreakers
            }));
            
            await tiebreaker.save();
            
            // Announce results
            await this.announceTiebreakerResults(tiebreaker, filteredEntries);
            
            console.log(`Successfully processed tiebreaker ${tiebreaker.boardId}`);
        } catch (error) {
            console.error('Error processing tiebreaker results:', error);
        }
    }

    async announceRacingResults(racingBoard, results) {
        try {
            // Get the announcement channel
            const channel = await this.getChannel();
            if (!channel) {
                console.error('Announcement channel not found');
                return;
            }
            
            // Create embed
            const monthName = racingBoard.startDate.toLocaleString('default', { month: 'long' });
            const year = racingBoard.startDate.getFullYear();
            
            // Use our utilities to create a standardized embed
            const embed = createHeaderEmbed(
                `${EMOJIS.RACING} ${monthName} ${year} Racing Challenge Results`,
                `**${racingBoard.gameTitle}**\n*${racingBoard.description || ''}*`,
                {
                    color: COLORS.WARNING, // Orange/yellow color
                    timestamp: true
                }
            );
            
            // Add game thumbnail if available
            try {
                const gameInfo = await RetroAPIUtils.getGameInfo(racingBoard.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info for thumbnail:', error);
            }
            
            // Add results field
            let resultsText = '';
            
            if (results.length > 0) {
                results.forEach(result => {
                    const medalEmoji = result.rank <= 3 ? EMOJIS[`RANK_${result.rank}`] : `#${result.rank}`;
                    resultsText += `${medalEmoji} **${result.username}**: ${result.time} (${result.points} point${result.points !== 1 ? 's' : ''})\n`;
                });
            } else {
                resultsText = 'No eligible participants found.';
            }
            
            embed.addFields({ name: 'Final Standings', value: resultsText });
            
            // Send the announcement
            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error announcing racing results:', error);
        }
    }

    async announceTiebreakerResults(tiebreaker, results) {
        try {
            // Get the announcement channel
            const channel = await this.getChannel();
            if (!channel) {
                console.error('Announcement channel not found');
                return;
            }
            
            // Use our utilities to create a standardized embed
            const embed = createHeaderEmbed(
                '⚔️ Tiebreaker Challenge Results',
                `**${tiebreaker.gameTitle}**\n*${tiebreaker.description || ''}*`,
                {
                    color: COLORS.DANGER, // Red color
                    timestamp: true
                }
            );
            
            // Add game thumbnail if available
            try {
                const gameInfo = await RetroAPIUtils.getGameInfo(tiebreaker.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info for thumbnail:', error);
            }
            
            // Add participants field
            embed.addFields({ 
                name: 'Participants', 
                value: tiebreaker.tiedUsers.length > 0 ? tiebreaker.tiedUsers.join(', ') : 'No participants' 
            });
            
            // Add results field
            let resultsText = '';
            
            if (results.length > 0) {
                results.forEach((result, index) => {
                    const medalEmoji = index <= 2 ? EMOJIS[`RANK_${index + 1}`] : `#${index + 1}`;
                    const scoreText = result.FormattedScore || result.TrackTime || result.Score?.toString() || 'No score';
                    resultsText += `${medalEmoji} **${result.User}**: ${scoreText}\n`;
                });
                
                // Announce the winner
                resultsText += `\n${EMOJIS.WINNER} **${results[0].User}** has won the tiebreaker!`;
            } else {
                resultsText = 'No participants competed in the tiebreaker.';
            }
            
            embed.addFields({ name: 'Final Standings', value: resultsText });
            
            // Send the announcement
            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error announcing tiebreaker results:', error);
        }
    }

    async announceNewRacingChallenge(racingBoard) {
        try {            
            // Get the announcement channel
            const channel = await this.getChannel();
            if (!channel) {
                console.error('Announcement channel not found');
                return;
            }
            
            // Create embed
            const monthName = racingBoard.startDate.toLocaleString('default', { month: 'long' });
            const year = racingBoard.startDate.getFullYear();
            
            // Get end time in Discord timestamp format
            const endTimestamp = getDiscordTimestamp(racingBoard.endDate, 'F');
            
            // Use our utilities to create a standardized embed
            const embed = createHeaderEmbed(
                `${EMOJIS.RACING} New Racing Challenge for ${monthName} ${year}`,
                `A new monthly racing challenge has begun!\n\n` +
                `**Game:** ${racingBoard.gameTitle}\n` +
                `**Description:** ${racingBoard.description || 'No description provided'}\n\n` +
                `Challenge ends: ${endTimestamp}\n\n` +
                `The top 3 players at the end of the month will receive award points: 3 points for 1st place, 2 points for 2nd place, and 1 point for 3rd place.`,
                {
                    color: COLORS.WARNING, // Orange/yellow color
                    timestamp: true
                }
            );
            
            // Add game thumbnail if available
            try {
                const gameInfo = await RetroAPIUtils.getGameInfo(racingBoard.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info for thumbnail:', error);
            }
            
            // Send the announcement
            await channel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error announcing new racing challenge:', error);
        }
    }
    
    /**
     * Award points for arcade boards on December 1st
     * This happens once a year for all arcade boards
     */
    async awardArcadePoints() {
        console.log('Running annual arcade points awards (December 1st)');
        
        try {
            // Get all arcade boards (not racing or tiebreaker)
            const arcadeBoards = await ArcadeBoard.find({
                boardType: 'arcade'
            });
            
            if (arcadeBoards.length === 0) {
                console.log('No arcade boards found');
                return;
            }
            
            console.log(`Found ${arcadeBoards.length} arcade boards to process`);
            
            // Get all registered users
            const users = await User.find({ isActive: true });
            
            // Create mapping of RA usernames (lowercase) to user objects
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user);
            }
            
            // Track all results for the announcement
            const allResults = [];
            
            // Process each arcade board
            for (const board of arcadeBoards) {
                console.log(`Processing arcade board: ${board.boardId} - ${board.gameTitle}`);
                
                // Fetch leaderboard entries using our utility
                const allEntries = await RetroAPIUtils.getLeaderboardEntries(board.leaderboardId, 1000);
                if (!allEntries || allEntries.length === 0) {
                    console.log(`No leaderboard entries found for ${board.boardId}`);
                    continue;
                }
                
                // Filter entries to only show registered users
                const filteredEntries = allEntries.filter(entry => 
                    entry.User && registeredUsers.has(entry.User.toLowerCase())
                );
                
                if (filteredEntries.length === 0) {
                    console.log(`No registered users found in the leaderboard for ${board.boardId}`);
                    continue;
                }
                
                // Get the top 3 entries
                const topEntries = filteredEntries.slice(0, 3);
                
                // Award points (3/2/1) to the top 3
                const boardResults = [];
                const pointsDistribution = [3, 2, 1]; // 1st, 2nd, 3rd place
                
                for (let i = 0; i < Math.min(3, topEntries.length); i++) {
                    const entry = topEntries[i];
                    const pointsToAward = pointsDistribution[i];
                    const userObj = registeredUsers.get(entry.User.toLowerCase());
                    
                    if (userObj) {
                        // Get the current year
                        const currentYear = new Date().getFullYear();
                        
                        // Add community award
                        const placement = i === 0 ? '1st' : (i === 1 ? '2nd' : '3rd');
                        const awardTitle = `${placement} Place in ${currentYear} Arcade: ${board.gameTitle}`;
                        
                        userObj.communityAwards.push({
                            title: awardTitle,
                            points: pointsToAward,
                            awardedAt: new Date(),
                            awardedBy: 'Arcade System'
                        });
                        
                        await userObj.save();
                        
                        // Record result
                        boardResults.push({
                            username: entry.User,
                            rank: i + 1,
                            score: entry.FormattedScore || entry.Score?.toString() || 'No score',
                            points: pointsToAward
                        });
                    }
                }
                
                // Add to overall results if any points were awarded
                if (boardResults.length > 0) {
                    allResults.push({
                        board,
                        results: boardResults
                    });
                }
            }
            
            // Announce the results
            await this.announceArcadeResults(allResults);
            
            console.log('Finished processing arcade boards');
        } catch (error) {
            console.error('Error awarding arcade points:', error);
        }
    }
    
    /**
     * Announce the results of the annual arcade points
     */
    async announceArcadeResults(allResults) {
        if (!this.client || allResults.length === 0) return;
        
        try {
            // Get the announcement channel
            const channel = await this.getChannel();
            if (!channel) {
                console.error('Announcement channel not found');
                return;
            }
            
            // Get the current year
            const currentYear = new Date().getFullYear();
            
            // Create main embed using our utility
            const mainEmbed = createHeaderEmbed(
                `${EMOJIS.ARCADE} ${currentYear} Arcade Results`,
                `The annual arcade leaderboard results are in!\n\n` +
                `The top players in each arcade category have been awarded points:\n` +
                `- 1st Place: 3 points\n` +
                `- 2nd Place: 2 points\n` +
                `- 3rd Place: 1 point\n\n` +
                `Check out the results for each arcade board below.`,
                {
                    color: COLORS.PRIMARY, // Blue color
                    timestamp: true
                }
            );
            
            // Send the main announcement
            await channel.send({ embeds: [mainEmbed] });
            
            // Create separate embeds for each board with results
            for (const { board, results } of allResults) {
                // Use our utilities to create a standardized embed
                const boardEmbed = createHeaderEmbed(
                    board.gameTitle,
                    `*${board.description || 'No description provided'}*\n\n**Top Players:**`,
                    {
                        color: COLORS.PRIMARY, // Blue color for consistency
                        timestamp: false
                    }
                );
                
                // Add results to the embed
                let resultsText = '';
                for (const result of results) {
                    const medalEmoji = result.rank <= 3 ? EMOJIS[`RANK_${result.rank}`] : `#${result.rank}`;
                    resultsText += `${medalEmoji} **${result.username}**: ${result.score} (${result.points} point${result.points !== 1 ? 's' : ''})\n`;
                }
                
                boardEmbed.addFields({ name: 'Results', value: resultsText });
                
                // Add game thumbnail if available
                try {
                    const gameInfo = await RetroAPIUtils.getGameInfo(board.gameId);
                    if (gameInfo?.imageIcon) {
                        boardEmbed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                    }
                } catch (error) {
                    // Continue without the thumbnail
                }
                
                // Send each board's results
                await channel.send({ embeds: [boardEmbed] });
                
                // Add a small delay between messages to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error announcing arcade results:', error);
        }
    }
}

// Create singleton instance
const arcadeService = new ArcadeService();
export default arcadeService;
