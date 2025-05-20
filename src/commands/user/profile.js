// src/commands/user/profile.js
import { 
    SlashCommandBuilder, 
    EmbedBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';

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
            
            // Get total community points
            const totalPoints = this.calculateTotalPoints(user);
            
            // Get total community awards
            const totalAwards = this.countTotalAwards(user);
            
            // Create and send the profile embed
            const profileEmbed = this.createProfileEmbed(user, raUserInfo, totalPoints, totalAwards);
            return interaction.editReply({ embeds: [profileEmbed] });

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    },
    
    calculateTotalPoints(user) {
        // Calculate total points (simplified from original)
        let totalPoints = 0;
        
        // Add points from monthly challenges
        for (const [key, challenge] of user.monthlyChallenges.entries()) {
            totalPoints += challenge.progress || 0;
        }
        
        // Add points from shadow challenges
        for (const [key, shadow] of user.shadowChallenges.entries()) {
            totalPoints += shadow.progress || 0;
        }
        
        // Add points from community awards
        const currentYear = new Date().getFullYear();
        totalPoints += user.getCommunityPointsForYear(currentYear);
        
        return totalPoints;
    },
    
    countTotalAwards(user) {
        // Count all community awards
        let totalAwards = 0;
        
        // Only count for current year
        const currentYear = new Date().getFullYear();
        const communityAwards = user.getCommunityAwardsForYear(currentYear);
        totalAwards = communityAwards.length;
        
        return totalAwards;
    },
    
    createProfileEmbed(user, raUserInfo, totalPoints, totalAwards) {
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
        
        // Community Stats
        embed.addFields({
            name: 'Community Stats',
            value: `**Points:** ${totalPoints}\n` +
                   `**Awards:** ${totalAwards}\n` +
                   `**GP Balance:** ${(user.gp || 0).toLocaleString()} GP`
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
        
        embed.setFooter({ text: 'Use /help for more information' })
             .setTimestamp();
        
        return embed;
    }
};
