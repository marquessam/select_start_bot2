import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { User } from '../models/User.js';
import retroAPI from './retroAPI.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

class ArcadeService {
    constructor() {
        this.client = null;
    }

    setClient(client) {
        this.client = client;
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arcade service');
            return;
        }

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
            
            // Fetch leaderboard entries
            const allEntries = await this.fetchLeaderboardEntries(racingBoard.leaderboardId);
            if (!allEntries || allEntries.length === 0) {
                console.log('No leaderboard entries found');
                return;
            }
            
            // Get all registered users
            const users = await User.find({ isActive: true });
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user);
            }
            
            // Filter entries to only show registered users
            const filteredEntries = allEntries.filter(entry => 
                entry.User && registeredUsers.has(entry.User.toLowerCase())
            );

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
                        time: entry.TrackTime,
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
            
            // Fetch leaderboard entries
            const allEntries = await this.fetchLeaderboardEntries(tiebreaker.leaderboardId);
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
                return a.TrackTime.localeCompare(b.TrackTime);
            });
            
            // Get the winner (first place)
            const winner = filteredEntries[0];
            
            // Mark tiebreaker as completed
            tiebreaker.pointsAwarded = true;
            tiebreaker.results = filteredEntries.map((entry, index) => ({
                username: entry.User,
                rank: index + 1,
                time: entry.TrackTime,
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

    async fetchLeaderboardEntries(leaderboardId) {
        try {
            // First batch of entries (top 500)
            const firstBatch = await retroAPI.getLeaderboardEntries(leaderboardId, 0, 500);
            
            // Second batch of entries (next 500)
            const secondBatch = await retroAPI.getLeaderboardEntries(leaderboardId, 500, 500);
            
            // Combine entries
            return [...firstBatch, ...secondBatch];
        } catch (error) {
            console.error('Error fetching leaderboard entries:', error);
            throw error;
        }
    }

    async announceRacingResults(racingBoard, results) {
        if (!this.client) return;
        
        try {
            // Get the announcement channel
            const channel = await this.getAnnouncementChannel();
            if (!channel) {
                console.error('Announcement channel not found');
                return;
            }
            
            // Create embed
            const monthName = racingBoard.startDate.toLocaleString('default', { month: 'long' });
            const year = racingBoard.startDate.getFullYear();
            
            const embed = new EmbedBuilder()
                .setTitle(`🏎️ ${monthName} ${year} Racing Challenge Results`)
                .setColor('#FF9900')
                .setDescription(`**${racingBoard.gameTitle}**\n*${racingBoard.description}*`)
                .setTimestamp();
            
            // Add game thumbnail if available
            try {
                const gameInfo = await retroAPI.getGameInfo(racingBoard.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info for thumbnail:', error);
                // Continue without the thumbnail
            }
            
            // Add results field
            let resultsText = '';
            
            if (results.length > 0) {
                results.forEach(result => {
                    const medalEmoji = result.rank === 1 ? '🥇' : (result.rank === 2 ? '🥈' : (result.rank === 3 ? '🥉' : `${result.rank}.`));
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
        if (!this.client) return;
        
        try {
            // Get the announcement channel
            const channel = await this.getAnnouncementChannel();
            if (!channel) {
                console.error('Announcement channel not found');
                return;
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`⚔️ Tiebreaker Challenge Results`)
                .setColor('#FF0000')
                .setDescription(`**${tiebreaker.gameTitle}**\n*${tiebreaker.description}*`)
                .setTimestamp();
            
            // Add game thumbnail if available
            try {
                const gameInfo = await retroAPI.getGameInfo(tiebreaker.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info for thumbnail:', error);
                // Continue without the thumbnail
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
                    const medalEmoji = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `${index + 1}.`));
                    resultsText += `${medalEmoji} **${result.User}**: ${result.TrackTime}\n`;
                });
                
                // Announce the winner
                resultsText += `\n🏆 **${results[0].User}** has won the tiebreaker!`;
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

    async getAnnouncementChannel() {
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the announcement channel
            return await guild.channels.fetch(config.discord.announcementChannelId);
        } catch (error) {
            console.error('Error getting announcement channel:', error);
            return null;
        }
    }

    async announceNewRacingChallenge(racingBoard) {
        if (!this.client) return;
        
        try {
            // Get the announcement channel
            const channel = await this.getAnnouncementChannel();
            if (!channel) {
                console.error('Announcement channel not found');
                return;
            }
            
            // Create embed
            const monthName = racingBoard.startDate.toLocaleString('default', { month: 'long' });
            const year = racingBoard.startDate.getFullYear();
            
            const embed = new EmbedBuilder()
                .setTitle(`🏎️ New Racing Challenge for ${monthName} ${year}`)
                .setColor('#FF9900')
                .setDescription(
                    `A new monthly racing challenge has begun!\n\n` +
                    `**Game:** ${racingBoard.gameTitle}\n` +
                    `**Description:** ${racingBoard.description}\n\n` +
                    `Challenge ends: <t:${Math.floor(racingBoard.endDate.getTime() / 1000)}:f>\n\n` +
                    `The top 3 players at the end of the month will receive award points: 3 points for 1st place, 2 points for 2nd place, and 1 point for 3rd place.`
                )
                .setTimestamp();
            
            // Add game thumbnail if available
            try {
                const gameInfo = await retroAPI.getGameInfo(racingBoard.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info for thumbnail:', error);
                // Continue without the thumbnail
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
                
                // Fetch leaderboard entries
                const allEntries = await this.fetchLeaderboardEntries(board.leaderboardId);
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
                            score: entry.TrackTime,
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
            const channel = await this.getAnnouncementChannel();
            if (!channel) {
                console.error('Announcement channel not found');
                return;
            }
            
            // Get the current year
            const currentYear = new Date().getFullYear();
            
            // Create main embed
            const mainEmbed = new EmbedBuilder()
                .setTitle(`🎮 ${currentYear} Arcade Results`)
                .setColor('#0099ff')
                .setDescription(
                    `The annual arcade leaderboard results are in!\n\n` +
                    `The top players in each arcade category have been awarded points:\n` +
                    `- 1st Place: 3 points\n` +
                    `- 2nd Place: 2 points\n` +
                    `- 3rd Place: 1 point\n\n` +
                    `Check out the results for each arcade board below.`
                )
                .setTimestamp();
            
            // Send the main announcement
            await channel.send({ embeds: [mainEmbed] });
            
            // Create separate embeds for each board with results
            for (const { board, results } of allResults) {
                const boardEmbed = new EmbedBuilder()
                    .setTitle(`${board.gameTitle}`)
                    .setColor('#00BFFF')
                    .setDescription(`*${board.description}*\n\n**Top Players:**`);
                
                // Add results to the embed
                let resultsText = '';
                for (const result of results) {
                    const medalEmoji = result.rank === 1 ? '🥇' : (result.rank === 2 ? '🥈' : '🥉');
                    resultsText += `${medalEmoji} **${result.username}**: ${result.score} (${result.points} point${result.points !== 1 ? 's' : ''})\n`;
                }
                
                boardEmbed.addFields({ name: 'Results', value: resultsText });
                
                // Add game thumbnail if available
                try {
                    const gameInfo = await retroAPI.getGameInfo(board.gameId);
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