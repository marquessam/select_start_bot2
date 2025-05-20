// src/commands/user/profile.js
import { 
    SlashCommandBuilder, 
    EmbedBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';

// Award points constants - matching yearlyLeaderboard.js exactly
const POINTS = {
    MASTERY: 7,          // Mastery (3+3+1)
    BEATEN: 4,           // Beaten (3+1)
    PARTICIPATION: 1     // Participation
};

// Shadow games are limited to beaten status maximum (4 points)
const SHADOW_MAX_POINTS = POINTS.BEATEN;

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Display user profile summary')
        .addStringOption(option =>
            option.setName('username')
            .setDescription('RetroAchievements username (optional)')
            .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            let raUsername = interaction.options.getString('username');
            let user;

            if (!raUsername) {
                // Look up user by Discord ID
                user = await User.findOne({ discordId: interaction.user.id });
                if (!user) {
                    return interaction.editReply('You are not registered. Please ask an admin to register you first.');
                }
                raUsername = user.raUsername;
            } else {
                // Look up user by RA username
                user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
                });
                if (!user) {
                    return interaction.editReply('User not found. Please check the username or ask an admin to register this user.');
                }
            }

            // Get user's RA info
            const raUserInfo = await retroAPI.getUserInfo(raUsername);
            
            // Calculate points using the same method as yearlyLeaderboard
            const pointsData = this.calculateTotalPoints(user);
            
            // Get current year community awards
            const currentYear = new Date().getFullYear();
            const communityAwards = user.getCommunityAwardsForYear(currentYear);
            
            // Create and send the profile embed
            const profileEmbed = this.createProfileEmbed(user, raUserInfo, pointsData, communityAwards);
            return interaction.editReply({ embeds: [profileEmbed] });

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    },
    
    calculateTotalPoints(user) {
        // Calculate totals for each category exactly like yearlyLeaderboard.js
        let challengePoints = 0;
        let masteryCount = 0;
        let beatenCount = 0;
        let participationCount = 0;
        let shadowBeatenCount = 0;
        let shadowParticipationCount = 0;
        
        // Process monthly challenges
        for (const [dateStr, data] of user.monthlyChallenges.entries()) {
            if (data.progress === 3) {
                // Mastery (7 points)
                masteryCount++;
                challengePoints += POINTS.MASTERY;
            } else if (data.progress === 2) {
                // Beaten (4 points)
                beatenCount++;
                challengePoints += POINTS.BEATEN;
            } else if (data.progress === 1) {
                // Participation (1 point)
                participationCount++;
                challengePoints += POINTS.PARTICIPATION;
            }
        }

        // Process shadow challenges
        for (const [dateStr, data] of user.shadowChallenges.entries()) {
            if (data.progress === 2) {
                // Beaten for shadow (4 points max)
                shadowBeatenCount++;
                challengePoints += SHADOW_MAX_POINTS;
            } else if (data.progress === 1) {
                // Participation (1 point)
                shadowParticipationCount++;
                challengePoints += POINTS.PARTICIPATION;
            }
        }

        // Get community awards points for current year
        const currentYear = new Date().getFullYear();
        const communityPoints = user.getCommunityPointsForYear(currentYear);

        return {
            totalPoints: challengePoints + communityPoints,
            challengePoints,
            communityPoints,
            stats: {
                mastery: masteryCount,
                beaten: beatenCount,
                participation: participationCount,
                shadowBeaten: shadowBeatenCount,
                shadowParticipation: shadowParticipationCount
            }
        };
    },
    
    createProfileEmbed(user, raUserInfo, pointsData, communityAwards) {
        const embed = new EmbedBuilder()
            .setTitle(`Profile: ${user.raUsername}`)
            .setURL(`https://retroachievements.org/user/${user.raUsername}`)
            .setColor('#0099ff');
            
        // Add RA profile image if available
        if (raUserInfo && raUserInfo.profileImageUrl) {
            embed.setThumbnail(raUserInfo.profileImageUrl);
        }
        
        // RetroAchievements Site Info
        let rankInfo = 'Not ranked';
        if (raUserInfo && raUserInfo.rank) {
            rankInfo = `#${raUserInfo.rank}`;
            
            // Add percentage if available
            if (raUserInfo.totalRanked) {
                const percentage = (raUserInfo.rank / raUserInfo.totalRanked * 100).toFixed(2);
                rankInfo += ` (Top ${percentage}%)`;
            }
        }
        
        embed.addFields({
            name: 'RetroAchievements',
            value: `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})\n` +
                   `**Rank:** ${rankInfo}`
        });
        
        // Community Stats with detailed point breakdown
        embed.addFields({
            name: 'Community Stats',
            value: `**Total Points:** ${pointsData.totalPoints}\n` + 
                   `• Challenge Points: ${pointsData.challengePoints}\n` +
                   `• Community Points: ${pointsData.communityPoints}\n` +
                   `**GP Balance:** ${(user.gp || 0).toLocaleString()} GP`
        });
        
        // Point Breakdown
        const stats = pointsData.stats;
        embed.addFields({
            name: 'Point Details',
            value: `✨ Mastery: ${stats.mastery} (${stats.mastery * POINTS.MASTERY} pts)\n` +
                   `⭐ Beaten: ${stats.beaten} (${stats.beaten * POINTS.BEATEN} pts)\n` +
                   `🏁 Participation: ${stats.participation} (${stats.participation * POINTS.PARTICIPATION} pts)\n` +
                   `👥 Shadow Beaten: ${stats.shadowBeaten} (${stats.shadowBeaten * SHADOW_MAX_POINTS} pts)\n` +
                   `👥 Shadow Participation: ${stats.shadowParticipation} (${stats.shadowParticipation * POINTS.PARTICIPATION} pts)`
        });
        
        // Arena Stats (if available)
        if (user.arenaStats) {
            const arenaStats = user.arenaStats;
            const challengesIssued = arenaStats.challengesIssued || 0;
            const challengesAccepted = arenaStats.challengesAccepted || 0;
            const challengesWon = arenaStats.challengesWon || 0;
            const betsPlaced = arenaStats.betsPlaced || 0;
            const betsWon = arenaStats.betsWon || 0;
            
            embed.addFields({
                name: 'Arena Stats',
                value: `**Challenges:** ${challengesIssued + challengesAccepted} (${challengesWon} wins)\n` +
                       `**Bets:** ${betsPlaced} (${betsWon} wins)`
            });
        }
        
        // Community Awards
        if (communityAwards && communityAwards.length > 0) {
            // Format awards neatly with emojis
            let awardsText = '';
            
            // Show up to 5 most recent awards to keep it manageable
            const recentAwards = communityAwards.slice(0, 5);
            
            recentAwards.forEach(award => {
                // Format date in a concise way
                const awardDate = new Date(award.awardedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
                
                awardsText += `🏆 **${award.title}** (${award.points} pts) - ${awardDate}\n`;
            });
            
            // If there are more awards, show a count
            if (communityAwards.length > 5) {
                awardsText += `\n...and ${communityAwards.length - 5} more awards`;
            }
            
            embed.addFields({
                name: `Community Awards (${communityAwards.length})`,
                value: awardsText || 'No awards yet'
            });
        } else {
            embed.addFields({
                name: 'Community Awards',
                value: 'No awards yet'
            });
        }
        
        embed.setFooter({ text: 'Use /yearlyboard to see the full leaderboard' })
             .setTimestamp();
        
        return embed;
    }
};
