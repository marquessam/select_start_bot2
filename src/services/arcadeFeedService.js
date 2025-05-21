// src/services/arcadeFeedService.js
import { User } from '../models/User.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, createHeaderEmbed, createLeaderboardEmbed, getDiscordTimestamp } from '../utils/FeedUtils.js';
import { EmbedBuilder } from 'discord.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';

class ArcadeFeedService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arcadeFeedChannelId || '1371363491130114098');
        this.headerMessageId = null;
        this.summaryMessageId = null;
    }

    // Override the update method from base class
    async update() {
        await this.updateArcadeFeed();
    }

    async updateArcadeFeed() {
        try {
            const channel = await this.getChannel();
            if (!channel) {
                console.error('Arcade feed channel not found or inaccessible');
                return;
            }
            
            // Update header first
            await this.updateArenaHeader();
            
            // Update active challenge feeds - sort alphabetically by game title
            const activeChallengers = await ArcadeBoard.find({
                status: 'active',
                endDate: { $gt: new Date() }
            }).sort({ gameTitle: 1 }); // Sort alphabetically
            
            for (const challenge of activeChallengers) {
                await this.createOrUpdateArenaFeed(challenge);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Update open challenge feeds too - also sort alphabetically
            const openChallenges = await ArcadeBoard.find({
                status: 'open',
                isOpenChallenge: true
            }).sort({ gameTitle: 1 }); // Sort alphabetically
            
            for (const challenge of openChallenges) {
                await this.createOrUpdateOpenChallengeFeed(challenge);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Update racing board if there is one
            const now = new Date();
            const racingBoard = await ArcadeBoard.findOne({
                boardType: 'racing',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (racingBoard) {
                await this.updateRacingBoardEmbed(channel, racingBoard);
            }
            
            // Update GP leaderboard LAST
            await this.updatePointsSummaryEmbed(channel);
        } catch (error) {
            console.error('Error updating arcade feeds:', error);
        }
    }

    async updateArenaHeader() {
        // Format current time for the header message
        const now = new Date();
        const timestamp = getDiscordTimestamp(now);
        
        // Create header content with cleaner formatting and update frequency note
        const headerContent = 
            `# ${EMOJIS.ARCADE} Arcade Leaderboards\n` + 
            `All active arcade games and the current racing challenge are shown below.\n` +
            `**Last Updated:** ${timestamp} | **Updates:** Every hour\n` +
            `Top 3 finishers in arcade boards earn points (3/2/1) at the end of the year!`;
        
        // Use the base class method to update the header
        this.headerMessageId = await this.updateHeader({ content: headerContent });
    }

    async createOrUpdateArenaFeed(board) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Get leaderboard entries using our utility
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(board.leaderboardId, 1000);
            
            // Filter to only show registered users and parse
            const filteredEntries = [];
            
            for (const entry of rawEntries) {
                const username = entry.User || '';
                if (!username) continue;
                
                const lowerUsername = username.toLowerCase().trim();
                if (registeredUsers.has(lowerUsername)) {
                    filteredEntries.push({
                        apiRank: entry.Rank,
                        username: username,
                        score: entry.FormattedScore || entry.Score?.toString() || '0' 
                    });
                }
            }
            
            // Sort by API rank 
            filteredEntries.sort((a, b) => a.apiRank - b.apiRank);
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${board.leaderboardId}`;
            
            // Get game info for thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await RetroAPIUtils.getGameInfo(board.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error(`Error fetching game info for board ${board.boardId}:`, error);
            }
            
            // Create embed using our utility functions
            const embed = createHeaderEmbed(
                `${EMOJIS.ARCADE} ${board.gameTitle}`,
                `${board.description || 'Arcade Leaderboard'}\n\n*Note: Only users ranked 999 or lower in the global leaderboard are shown.*`,
                {
                    color: COLORS.INFO,
                    thumbnail: thumbnailUrl,
                    url: leaderboardUrl,
                    footer: { 
                        text: `Board ID: ${board.boardId} • Data from RetroAchievements.org` 
                    }
                }
            );
            
            // Get top 3 users for summary tracking
            const topUsers = [];
            
            // Format leaderboard entries
            if (filteredEntries.length > 0) {
                // Display top 10 entries or fewer if not enough
                const displayEntries = filteredEntries.slice(0, 10);
                let leaderboardText = '';
                
                displayEntries.forEach((entry, index) => {
                    const displayRank = index + 1;
                    const medalEmoji = displayRank <= 3 ? EMOJIS[`RANK_${displayRank}`] : `${displayRank}.`;
                    leaderboardText += `${medalEmoji} **${entry.username}**: ${entry.score} (Global Rank: #${entry.apiRank})\n`;
                    
                    // Track top 3 users for the summary
                    if (displayRank <= 3) {
                        topUsers.push({
                            username: entry.username,
                            position: displayRank,
                            score: entry.score,
                            apiRank: entry.apiRank,
                            points: displayRank === 1 ? 3 : (displayRank === 2 ? 2 : 1) // 1st=3pts, 2nd=2pts, 3rd=1pt
                        });
                    }
                });
                
                embed.addFields({ name: `Top ${displayEntries.length} Players`, value: leaderboardText });
                
                // Add total participants count
                embed.addFields({ 
                    name: 'Participants', 
                    value: `${filteredEntries.length} registered members on this leaderboard`
                });
            } else {
                embed.addFields({ name: 'No Players', value: 'No registered users have scores on this leaderboard yet.' });
            }
            
            // Use our base class updateMessage method
            await this.updateMessage(
                `arcade_board_${board.boardId}`, 
                { embeds: [embed] }
            );
            
            return topUsers;
        } catch (error) {
            console.error(`Error creating arcade board embed for ${board.gameTitle}:`, error);
            return [];
        }
    }

    /**
     * Create or update the open challenge feed for a specific challenge
     * @param {Object} challenge - The open challenge data from ArcadeBoard
     * @returns {Promise<void>}
     */
    async createOrUpdateOpenChallengeFeed(challenge) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Get leaderboard entries using our utility
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
            
            // Process participants and their scores
            let participantScores = new Map();
            let challengerScore = {
                exists: false,
                formattedScore: 'No score yet',
                rank: null
            };
            
            // Filter entries to include registered users
            const filteredEntries = [];
            
            for (const entry of rawEntries) {
                const username = entry.User || '';
                if (!username) continue;
                
                const lowerUsername = username.toLowerCase().trim();
                
                // Check if this is the challenger or a participant
                const isChallenger = lowerUsername === challenge.challengerUsername.toLowerCase();
                let isParticipant = false;
                
                if (challenge.participants && challenge.participants.length > 0) {
                    isParticipant = challenge.participants.some(p => 
                        p.username.toLowerCase() === lowerUsername
                    );
                }
                
                // Only include challenger, participants, and other registered users
                if (isChallenger || isParticipant || registeredUsers.has(lowerUsername)) {
                    const scoreInfo = {
                        exists: true,
                        formattedScore: entry.FormattedScore || entry.Score?.toString() || '0',
                        rank: entry.Rank,
                        value: parseFloat(entry.Score) || 0
                    };
                    
                    // Save challenger and participant scores separately
                    if (isChallenger) {
                        challengerScore = scoreInfo;
                    }
                    
                    if (isParticipant) {
                        participantScores.set(lowerUsername, scoreInfo);
                    }
                    
                    // Add to filtered entries for display
                    filteredEntries.push({
                        apiRank: entry.Rank,
                        username: username,
                        score: entry.FormattedScore || entry.Score?.toString() || '0',
                        isChallenger,
                        isParticipant
                    });
                }
            }
            
            // Sort by API rank 
            filteredEntries.sort((a, b) => a.apiRank - b.apiRank);
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
            
            // Get game info for thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await RetroAPIUtils.getGameInfo(challenge.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error(`Error fetching game info for challenge ${challenge.boardId}:`, error);
            }
            
            // Calculate time remaining
            const now = new Date();
            const endDate = new Date(challenge.endDate);
            const timeLeft = this.formatTimeRemaining(endDate);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(challenge.endDate > now ? COLORS.PRIMARY : COLORS.DANGER)
                .setTitle(`${EMOJIS.ARCADE} Open Challenge: ${challenge.gameTitle}`)
                .setDescription(`**Creator:** ${challenge.challengerUsername} | [View Leaderboard](${leaderboardUrl})`)
                .setTimestamp();
            
            if (thumbnailUrl) {
                embed.setThumbnail(thumbnailUrl);
            }
            
            // Add description if available
            if (challenge.description) {
                embed.addFields({ name: 'Challenge', value: challenge.description });
            }
            
            // Add challenge details
            const participantCount = (challenge.participants?.length || 0) + 1; // +1 for creator
            
            embed.addFields({
                name: 'Details', 
                value: `**Status:** Open Challenge\n` +
                       `**Ends:** ${timeLeft}\n` +
                       `**Participants:** ${participantCount} registered`
            });
            
            // Sort participants for display: challenger first, then by rank
            const allParticipants = [];
            
            // Add challenger with rank
            allParticipants.push({
                username: challenge.challengerUsername,
                isCreator: true,
                score: challengerScore.formattedScore,
                rank: challengerScore.rank || 999999,
                exists: challengerScore.exists
            });
            
            // Add each participant
            if (challenge.participants) {
                challenge.participants.forEach(participant => {
                    const scoreInfo = participantScores.get(participant.username.toLowerCase());
                    const score = scoreInfo?.formattedScore || 'No score yet';
                    const rank = scoreInfo?.rank || 999999;
                    
                    allParticipants.push({
                        username: participant.username,
                        isCreator: false,
                        score: score,
                        rank: rank,
                        exists: !!scoreInfo?.exists
                    });
                });
            }
            
            // Sort participants by rank
            allParticipants.sort((a, b) => {
                // Put participants with scores first
                if (a.exists && !b.exists) return -1;
                if (!a.exists && b.exists) return 1;
                
                // If both have scores, sort by rank
                if (a.exists && b.exists) {
                    return a.rank - b.rank; // Lower rank is better
                }
                
                // Default to creator first
                return a.isCreator ? -1 : b.isCreator ? 1 : 0;
            });
            
            // Create standings field
            let participantsText = '';
            
            allParticipants.forEach((participant, index) => {
                if (participant.exists) {
                    // Add crown emoji for the top position
                    const prefixEmoji = index === 0 ? `${EMOJIS.CROWN} ` : '';
                    const creatorTag = participant.isCreator ? ' (Creator)' : '';
                    const rankDisplay = participant.rank < 999999 ? ` (Rank: #${participant.rank})` : '';
                    
                    participantsText += `${prefixEmoji}**${participant.username}${creatorTag}**: ${participant.score}${rankDisplay}\n`;
                } else {
                    const creatorTag = participant.isCreator ? ' (Creator)' : '';
                    participantsText += `• **${participant.username}${creatorTag}**: ${participant.score}\n`;
                }
            });
            
            if (participantsText) {
                embed.addFields({
                    name: 'Current Standings', 
                    value: participantsText
                });
            } else {
                embed.addFields({
                    name: 'Current Standings',
                    value: 'No participants have scores yet.'
                });
            }
            
            // Use our base class updateMessage method
            await this.updateMessage(
                `open_challenge_${challenge.boardId}`, 
                { embeds: [embed] }
            );
        } catch (error) {
            console.error(`Error creating open challenge embed for ${challenge.gameTitle}:`, error);
        }
    }

    async updateRacingBoardEmbed(channel, racingBoard) {
        try {
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Get leaderboard entries using our utility
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(racingBoard.leaderboardId, 1000);
            
            // Filter to only show registered users
            const filteredEntries = [];
            
            for (const entry of rawEntries) {
                const username = entry.User || '';
                if (!username) continue;
                
                const lowerUsername = username.toLowerCase().trim();
                if (registeredUsers.has(lowerUsername)) {
                    filteredEntries.push({
                        apiRank: entry.Rank,
                        username: username,
                        score: entry.FormattedScore || entry.Score?.toString() || '0' 
                    });
                }
            }
            
            // Sort by API rank to ensure correct ordering
            filteredEntries.sort((a, b) => a.apiRank - b.apiRank);
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${racingBoard.leaderboardId}`;
            
            // Get the month name for display
            const raceDate = new Date(racingBoard.startDate);
            const monthName = raceDate.toLocaleString('default', { month: 'long' });
            const year = raceDate.getFullYear();
            
            // Generate full title with track name
            const trackDisplay = racingBoard.trackName 
                ? ` - ${racingBoard.trackName}`
                : '';
                
            const gameDisplay = `${racingBoard.gameTitle}${trackDisplay}`;
            
            // Calculate end date timestamp for Discord formatting
            const endTimestamp = getDiscordTimestamp(racingBoard.endDate, 'F');
            const endRelative = getDiscordTimestamp(racingBoard.endDate, 'R');
            
            // Get game info for thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await RetroAPIUtils.getGameInfo(racingBoard.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error(`Error fetching game info for racing ${racingBoard.gameTitle}:`, error);
            }
            
            // Create embed using our utility
            const embed = createHeaderEmbed(
                `${EMOJIS.RACING} ${monthName} ${year} Racing Challenge`,
                `**${gameDisplay}**\n${racingBoard.description || ''}\n\n` +
                `⏱️ **Active Challenge**\nEnds ${endTimestamp} (${endRelative})\n\n` +
                `Top 3 players at the end of the month will receive award points (3/2/1)!\n\n` +
                `*Note: Only users ranked 999 or lower in the global leaderboard are shown.*`,
                {
                    color: COLORS.DANGER, // Orange color for racing
                    thumbnail: thumbnailUrl,
                    url: leaderboardUrl,
                    footer: { text: `Data from RetroAchievements.org` }
                }
            );
            
            // Create leaderboard field
            if (filteredEntries.length > 0) {
                // Display top 10 entries
                const displayEntries = filteredEntries.slice(0, 10);
                let leaderboardText = '';
                
                displayEntries.forEach((entry, index) => {
                    const displayRank = index + 1;
                    const medalEmoji = displayRank <= 3 ? EMOJIS[`RANK_${displayRank}`] : `${displayRank}.`;
                    leaderboardText += `${medalEmoji} **${entry.username}**: ${entry.score}\n`;
                });
                
                embed.addFields({ name: 'Current Standings', value: leaderboardText });
                
                // Add total participants count
                embed.addFields({ 
                    name: 'Participants', 
                    value: `${filteredEntries.length} registered members participating in this racing challenge`
                });
            } else {
                embed.addFields({ name: 'No Participants', value: 'No registered users have posted times for this racing challenge yet.' });
            }
            
            // Use our base class updateMessage method
            await this.updateMessage(
                `racing_${racingBoard.boardId}`, 
                { embeds: [embed] }
            );
        } catch (error) {
            console.error(`Error creating racing challenge embed for ${racingBoard.gameTitle}:`, error);
        }
    }
    
    async updatePointsSummaryEmbed(channel) {
        try {
            // Get all arcade boards
            const arcadeBoards = await ArcadeBoard.find({ boardType: 'arcade' });
            if (!arcadeBoards || arcadeBoards.length === 0) return;
            
            // Collect data for each board
            const arcadeTopUsersData = [];
            
            for (const board of arcadeBoards) {
                try {
                    const topUsers = await this.getTopUsersForBoard(board);
                    if (topUsers && topUsers.length > 0) {
                        arcadeTopUsersData.push({
                            boardName: board.gameTitle,
                            topUsers: topUsers
                        });
                    }
                } catch (error) {
                    console.error(`Error getting top users for board ${board.gameTitle}:`, error);
                }
            }
            
            // Process the top users data to build point totals
            const userPoints = new Map(); // username -> points
            
            // Collect data from all arcade boards
            arcadeTopUsersData.forEach(boardData => {
                const { topUsers } = boardData;
                
                topUsers.forEach(user => {
                    const { username, points } = user;
                    
                    // Add to user's total points
                    if (!userPoints.has(username)) {
                        userPoints.set(username, 0);
                    }
                    
                    userPoints.set(username, userPoints.get(username) + points);
                });
            });
            
            // Sort users by total points (descending)
            const sortedUsers = Array.from(userPoints.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([username, points]) => ({ username, points }));
            
            // Current timestamp in Discord format
            const timestamp = getDiscordTimestamp(new Date());
            
            // Create the summary embed
            const embed = createHeaderEmbed(
                '🏆 Arcade Points Summary',
                `**Projected year-end arcade points for top-ranked users**\n\n` +
                `*These are theoretical points based on current standings and don't include other point sources. Final arcade points will be awarded in December.*\n\n` +
                `Points scale: ${EMOJIS.RANK_1} 1st Place = 3 points | ${EMOJIS.RANK_2} 2nd Place = 2 points | ${EMOJIS.RANK_3} 3rd Place = 1 point\n\n` +
                `**Last Updated:** ${timestamp} | **Updates:** Every hour\n\n` +
                `*Use the </yearlyboard:1234567890> command to see complete point standings.*`,
                {
                    color: COLORS.GOLD,
                    footer: { 
                        text: 'Points are only for arcade boards and will be awarded at year end. Racing points are awarded monthly and not included here.' 
                    }
                }
            );
            
            // Create the standings field
            if (sortedUsers.length > 0) {
                // Break standings into groups of 15 to avoid embed field size limits
                const maxUsersPerField = 15;
                const numFields = Math.ceil(sortedUsers.length / maxUsersPerField);
                
                for (let fieldIndex = 0; fieldIndex < numFields; fieldIndex++) {
                    const startIndex = fieldIndex * maxUsersPerField;
                    const endIndex = Math.min((fieldIndex + 1) * maxUsersPerField, sortedUsers.length);
                    const usersInThisField = sortedUsers.slice(startIndex, endIndex);
                    
                    let standingsText = '';
                    
                    // Add each user with points (no ranks)
                    usersInThisField.forEach(user => {
                        standingsText += `**${user.username}**: ${user.points} points\n`;
                    });
                    
                    const fieldTitle = numFields > 1 
                        ? `Standings (${startIndex + 1}-${endIndex})`
                        : 'Current Standings';
                    
                    embed.addFields({ 
                        name: fieldTitle, 
                        value: standingsText || 'No users have ranking points yet.' 
                    });
                }
            } else {
                embed.addFields({ 
                    name: 'No Standings', 
                    value: 'No users have ranking points yet.' 
                });
            }
            
            // Update or create the summary message
            this.summaryMessageId = await this.updateMessage(
                'points_summary',
                { embeds: [embed] }
            );
        } catch (error) {
            console.error('Error creating arcade points summary embed:', error);
        }
    }

    // Helper method to get top users for a specific board
    async getTopUsersForBoard(board) {
        try {
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Get leaderboard entries using our utility
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(board.leaderboardId, 500);
            
            // Filter to only show registered users
            const filteredEntries = [];
            
            for (const entry of rawEntries) {
                const username = entry.User || '';
                if (!username) continue;
                
                const lowerUsername = username.toLowerCase().trim();
                if (registeredUsers.has(lowerUsername)) {
                    filteredEntries.push({
                        apiRank: entry.Rank,
                        username: username,
                        score: entry.FormattedScore || entry.Score?.toString() || '0' 
                    });
                }
            }
            
            // Sort by API rank to ensure correct ordering
            filteredEntries.sort((a, b) => a.apiRank - b.apiRank);
            
            // Get top 3 users
            const topUsers = [];
            
            filteredEntries.slice(0, 3).forEach((entry, index) => {
                const displayRank = index + 1;
                topUsers.push({
                    username: entry.username,
                    position: displayRank,
                    score: entry.score,
                    apiRank: entry.apiRank,
                    points: displayRank === 1 ? 3 : (displayRank === 2 ? 2 : 1) // 1st=3pts, 2nd=2pts, 3rd=1pt
                });
            });
            
            return topUsers;
        } catch (error) {
            console.error(`Error getting top users for board ${board.gameTitle}:`, error);
            return [];
        }
    }

    /**
     * Format time remaining in a human-readable format
     * (Added this helper method to avoid dependency on FeedUtils)
     */
    formatTimeRemaining(endDate) {
        if (!endDate) return 'Unknown';
        
        const now = new Date();
        const remainingMs = endDate - now;
        
        if (remainingMs <= 0) {
            return 'Ended';
        }
        
        const seconds = Math.floor(remainingMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 7) {
            const weeks = Math.floor(days / 7);
            const remainingDays = days % 7;
            if (remainingDays === 0) {
                return `${weeks} week${weeks !== 1 ? 's' : ''}`;
            }
            return `${weeks} week${weeks !== 1 ? 's' : ''}, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
        } 
        else if (days > 0) {
            const remainingHours = hours % 24;
            if (remainingHours === 0) {
                return `${days} day${days !== 1 ? 's' : ''}`;
            }
            return `${days} day${days !== 1 ? 's' : ''}, ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
        } 
        else if (hours > 0) {
            const remainingMinutes = minutes % 60;
            if (remainingMinutes === 0) {
                return `${hours} hour${hours !== 1 ? 's' : ''}`;
            }
            return `${hours} hour${hours !== 1 ? 's' : ''}, ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
        } 
        else {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
    }
}

// Create singleton instance
const arcadeFeedService = new ArcadeFeedService();
export default arcadeFeedService;
