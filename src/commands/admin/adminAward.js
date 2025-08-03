import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminaward')
        .setDescription('Manage community awards and points')
        .setDefaultMemberPermissions('0') // Only visible to users with Administrator permission
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Give a community award to a user')
                .addStringOption(option =>
                    option.setName('username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('title')
                    .setDescription('The title of the award')
                    .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('points')
                    .setDescription('Number of points for this award')
                    .setRequired(true)
                    .setMinValue(1))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all community awards for a user')
                .addStringOption(option =>
                    option.setName('username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Remove a specific community award from a user')
                .addStringOption(option =>
                    option.setName('username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('index')
                    .setDescription('The index number of the award to remove (from view command)')
                    .setRequired(true)
                    .setMinValue(1))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('monthly')
                .setDescription('View monthly winner awards for all users')
                .addIntegerOption(option =>
                    option.setName('year')
                    .setDescription('Year to filter by (optional)')
                    .setRequired(false)
                    .setMinValue(2020)
                    .setMaxValue(2030))
                .addIntegerOption(option =>
                    option.setName('month')
                    .setDescription('Month to filter by (1-12, optional)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(12))
        ),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        switch(subcommand) {
            case 'give':
                await this.handleGiveAward(interaction);
                break;
            case 'view':
                await this.handleViewAwards(interaction);
                break;
            case 'clear':
                await this.handleClearAward(interaction);
                break;
            case 'monthly':
                await this.handleViewMonthlyAwards(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Handle giving an award to a user
     */
    async handleGiveAward(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('username');
            const title = interaction.options.getString('title');
            const points = interaction.options.getInteger('points');

            // Find the user
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply('User not found. Please check the username or register the user first.');
            }

            // Check for potential monthly winner award conflicts
            const monthlyWinnerTitles = [
                '1st Place Monthly Challenge Winner',
                '2nd Place Monthly Challenge Winner', 
                '3rd Place Monthly Challenge Winner'
            ];
            
            if (monthlyWinnerTitles.some(winnerTitle => title.includes(winnerTitle) || winnerTitle.includes(title))) {
                const warningMessage = `⚠️ **Warning:** This award title appears to be a monthly winner award.\n\n` +
                    `The automated monthly winner system may conflict with manual awards. ` +
                    `Use \`/adminaward monthly\` to view existing monthly winner awards.\n\n` +
                    `Continue anyway? React ✅ to proceed or ❌ to cancel.`;
                
                const warningReply = await interaction.editReply({ 
                    content: warningMessage
                });
                
                try {
                    await warningReply.react('✅');
                    await warningReply.react('❌');
                    
                    const filter = (reaction, user) => {
                        return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
                    };
                    
                    const collected = await warningReply.awaitReactions({ 
                        filter, 
                        max: 1, 
                        time: 30000, 
                        errors: ['time'] 
                    });
                    
                    const reaction = collected.first();
                    
                    if (reaction.emoji.name === '❌') {
                        return interaction.editReply({ 
                            content: '❌ Award cancelled.',
                            components: [] 
                        });
                    }
                } catch (timeoutError) {
                    return interaction.editReply({ 
                        content: '⏰ Award cancelled due to timeout.',
                        components: [] 
                    });
                }
            }

            // Add the community award
            user.communityAwards.push({
                title,
                points,
                awardedBy: interaction.user.tag,
                awardedAt: new Date()
            });

            await user.save();

            return interaction.editReply({
                content: `✅ Successfully awarded "${title}" (${points} point${points !== 1 ? 's' : ''}) to ${raUsername}!`
            });

        } catch (error) {
            console.error('Error giving community award:', error);
            return interaction.editReply('An error occurred while giving the award. Please try again.');
        }
    },

    /**
     * Handle viewing a user's awards
     */
    async handleViewAwards(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('username');

            // Find the user, case-insensitive search
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply(`User "${raUsername}" not found. Please check the username or register the user first.`);
            }

            // Check if the user has any awards
            if (!user.communityAwards || user.communityAwards.length === 0) {
                return interaction.editReply(`User "${user.raUsername}" has no community awards.`);
            }

            // Separate monthly winner awards from other awards
            const monthlyWinnerTitles = [
                '1st Place Monthly Challenge Winner',
                '2nd Place Monthly Challenge Winner', 
                '3rd Place Monthly Challenge Winner'
            ];
            
            const monthlyAwards = user.communityAwards.filter(award => 
                monthlyWinnerTitles.includes(award.title)
            );
            
            const otherAwards = user.communityAwards.filter(award => 
                !monthlyWinnerTitles.includes(award.title)
            );

            // Format awards for display
            let response = `**Community Awards for ${user.raUsername}:**\n\n`;
            
            if (monthlyAwards.length > 0) {
                response += `**🏆 Monthly Winner Awards:**\n`;
                monthlyAwards.forEach((award, index) => {
                    const awardDate = award.awardedAt ? new Date(award.awardedAt).toLocaleDateString() : 'Unknown date';
                    const awardBy = award.awardedBy === 'Monthly Winner System' ? '🤖 Auto-awarded' : award.awardedBy;
                    response += `• "${award.title}" (${award.points} point${award.points !== 1 ? 's' : ''})\n`;
                    response += `  ${awardBy} on ${awardDate}\n`;
                });
                response += '\n';
            }
            
            if (otherAwards.length > 0) {
                response += `**🎯 Other Community Awards:**\n`;
                otherAwards.forEach((award, index) => {
                    const awardDate = award.awardedAt ? new Date(award.awardedAt).toLocaleDateString() : 'Unknown date';
                    const globalIndex = user.communityAwards.indexOf(award) + 1;
                    response += `**${globalIndex}.** "${award.title}" (${award.points} point${award.points !== 1 ? 's' : ''})\n`;
                    response += `   Awarded by: ${award.awardedBy || 'System'} on ${awardDate}\n\n`;
                });
            }
            
            // Add total points
            const totalPoints = user.communityAwards.reduce((sum, award) => sum + award.points, 0);
            response += `**Total Community Points:** ${totalPoints}`;
            
            // Add instruction for deleting awards
            if (otherAwards.length > 0) {
                response += `\n\n💡 To remove an award, use \`/adminaward clear username:${user.raUsername} index:<number>\``;
                response += `\n⚠️ Monthly winner awards are managed by the automated system.`;
            }

            return interaction.editReply(response);

        } catch (error) {
            console.error('Error viewing user awards:', error);
            return interaction.editReply('An error occurred while retrieving user awards. Please try again.');
        }
    },

    /**
     * Handle clearing a specific award
     */
    async handleClearAward(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('username');
            const awardIndex = interaction.options.getInteger('index') - 1; // Convert to 0-based index

            // Find the user, case-insensitive search
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply(`User "${raUsername}" not found. Please check the username or register the user first.`);
            }

            // Check if the user has any awards
            if (!user.communityAwards || user.communityAwards.length === 0) {
                return interaction.editReply(`User "${user.raUsername}" has no community awards to remove.`);
            }

            // Check if the index is valid
            if (awardIndex < 0 || awardIndex >= user.communityAwards.length) {
                return interaction.editReply(`Invalid award index. Use \`/adminaward view username:${user.raUsername}\` to see available awards.`);
            }

            // Store the award details for confirmation
            const award = user.communityAwards[awardIndex];
            const awardTitle = award.title;
            const awardPoints = award.points;

            // Check if this is a monthly winner award
            const monthlyWinnerTitles = [
                '1st Place Monthly Challenge Winner',
                '2nd Place Monthly Challenge Winner', 
                '3rd Place Monthly Challenge Winner'
            ];
            
            if (monthlyWinnerTitles.includes(award.title)) {
                return interaction.editReply(
                    `⚠️ Cannot remove "${awardTitle}" as it's a monthly winner award managed by the automated system.\n\n` +
                    `If you need to remove this award, please contact a developer or manually edit the database.`
                );
            }

            // Remove the award from the array
            user.communityAwards.splice(awardIndex, 1);
            await user.save();

            return interaction.editReply(`✅ Successfully removed award "${awardTitle}" (${awardPoints} points) from ${user.raUsername}.`);

        } catch (error) {
            console.error('Error clearing user award:', error);
            return interaction.editReply('An error occurred while removing the award. Please try again.');
        }
    },

    /**
     * Handle viewing monthly winner awards across all users
     */
    async handleViewMonthlyAwards(interaction) {
        await interaction.deferReply();

        try {
            const year = interaction.options.getInteger('year');
            const month = interaction.options.getInteger('month');

            // Build query for monthly winner awards
            const monthlyWinnerTitles = [
                '1st Place Monthly Challenge Winner',
                '2nd Place Monthly Challenge Winner', 
                '3rd Place Monthly Challenge Winner'
            ];

            const users = await User.find({
                'communityAwards.title': { $in: monthlyWinnerTitles }
            });

            if (users.length === 0) {
                return interaction.editReply('No monthly winner awards found in the database.');
            }

            // Collect and filter monthly winner awards
            let allMonthlyAwards = [];
            
            for (const user of users) {
                for (const award of user.communityAwards) {
                    if (monthlyWinnerTitles.includes(award.title)) {
                        const awardDate = new Date(award.awardedAt);
                        
                        // Apply date filters if provided
                        if (year && awardDate.getFullYear() !== year) continue;
                        if (month && (awardDate.getMonth() + 1) !== month) continue;
                        
                        allMonthlyAwards.push({
                            username: user.raUsername,
                            title: award.title,
                            points: award.points,
                            awardedAt: awardDate,
                            awardedBy: award.awardedBy
                        });
                    }
                }
            }

            if (allMonthlyAwards.length === 0) {
                const filterText = year && month ? ` for ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}` :
                                 year ? ` for ${year}` : 
                                 month ? ` for month ${month}` : '';
                return interaction.editReply(`No monthly winner awards found${filterText}.`);
            }

            // Sort by date (most recent first)
            allMonthlyAwards.sort((a, b) => b.awardedAt - a.awardedAt);

            // Group by month for better display
            const groupedByMonth = new Map();
            for (const award of allMonthlyAwards) {
                const monthKey = `${award.awardedAt.getFullYear()}-${String(award.awardedAt.getMonth() + 1).padStart(2, '0')}`;
                if (!groupedByMonth.has(monthKey)) {
                    groupedByMonth.set(monthKey, []);
                }
                groupedByMonth.get(monthKey).push(award);
            }

            // Format response
            const filterText = year && month ? ` for ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}` :
                              year ? ` for ${year}` : 
                              month ? ` for month ${month}` : '';
            
            let response = `**🏆 Monthly Winner Awards${filterText}:**\n\n`;

            for (const [monthKey, awards] of groupedByMonth) {
                const [yearStr, monthStr] = monthKey.split('-');
                const monthName = new Date(parseInt(yearStr), parseInt(monthStr) - 1).toLocaleString('default', { month: 'long' });
                
                response += `**${monthName} ${yearStr}:**\n`;
                
                // Sort within month by place (1st, 2nd, 3rd)
                awards.sort((a, b) => {
                    const getPlace = (title) => {
                        if (title.includes('1st')) return 1;
                        if (title.includes('2nd')) return 2;
                        if (title.includes('3rd')) return 3;
                        return 4;
                    };
                    return getPlace(a.title) - getPlace(b.title);
                });
                
                for (const award of awards) {
                    const place = award.title.includes('1st') ? '🥇' :
                                 award.title.includes('2nd') ? '🥈' :
                                 award.title.includes('3rd') ? '🥉' : '🏆';
                    
                    const awardedBy = award.awardedBy === 'Monthly Winner System' ? '🤖' : '👤';
                    response += `${place} **${award.username}** (${award.points} pts) ${awardedBy}\n`;
                }
                response += '\n';
            }

            response += `**Total Awards:** ${allMonthlyAwards.length}\n`;
            response += `🤖 = Auto-awarded by system | 👤 = Manually awarded`;

            // Split response if too long
            if (response.length > 2000) {
                response = response.substring(0, 1950) + '\n\n*...truncated. Use specific year/month filters for full results.*';
            }

            return interaction.editReply(response);

        } catch (error) {
            console.error('Error viewing monthly winner awards:', error);
            return interaction.editReply('An error occurred while retrieving monthly winner awards. Please try again.');
        }
    }
};
