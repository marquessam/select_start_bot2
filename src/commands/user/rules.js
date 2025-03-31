import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Displays community rules and challenge information')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Rules category to display')
                .setRequired(false)
                .addChoices(
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'Shadow', value: 'shadow' },
                    { name: 'Points', value: 'points' },
                    { name: 'Community', value: 'community' }
                )),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const category = interaction.options.getString('category');

            if (!category) {
                await this.displayRuleCategories(interaction);
                return;
            }

            switch (category) {
                case 'monthly':
                    await this.displayMonthlyChallenge(interaction);
                    break;
                case 'shadow':
                    await this.displayShadowChallenge(interaction);
                    break;
                case 'points':
                    await this.displayPointsInfo(interaction);
                    break;
                case 'community':
                    await this.displayCommunityRules(interaction);
                    break;
                default:
                    await this.displayRuleCategories(interaction);
            }
        } catch (error) {
            console.error('Rules Command Error:', error);
            await interaction.editReply('Failed to display rules. Please try again.');
        }
    },

    async displayRuleCategories(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Select Start Rules')
            .setDescription('Select a category to view specific rules')
            .setColor('#3498DB')
            .addFields({
                name: 'Available Categories',
                value: '• `/rules category:monthly` - Monthly Challenge Rules & Information\n' +
                      '• `/rules category:shadow` - Shadow Game Challenge Information\n' +
                      '• `/rules category:points` - Point System Rules & Information\n' +
                      '• `/rules category:community` - Community Guidelines & Discord Rules'
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayMonthlyChallenge(interaction) {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const lastDayOfMonth = new Date(nextMonthStart - 86400000).toISOString().split('T')[0];

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            if (!currentChallenge || !currentChallenge.monthly_challange_gameid) {
                await interaction.editReply('No active monthly challenge found');
                return;
            }

            // Get game info from RetroAchievements API
            const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
            
            // Get progression and win achievement counts
            const progressionCount = currentChallenge.monthly_challange_progression_achievements.length;
            const winCount = currentChallenge.monthly_challange_win_achievements.length;
            
            // Get month name
            const monthName = now.toLocaleString('default', { month: 'long' });

            const embed = new EmbedBuilder()
                .setTitle(`${monthName} Challenge Rules`)
                .setURL(`https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid}`)
                .setColor('#2ECC71')
                .addFields(
                    {
                        name: 'Active Challenge',
                        value: `**Game:** ${gameInfo.title}\n` +
                               `**Period:** ${currentMonthStart.toISOString().split('T')[0]} to ${lastDayOfMonth}`
                    },
                    {
                        name: 'Challenge Rules',
                        value: `• **To participate:** Earn any achievement\n` +
                               `• **To beat the game:** Complete all ${progressionCount} progression achievements` +
                               (winCount > 0 ? ` and at least one of the ${winCount} win achievements` : '') + '\n' +
                               `• **For mastery:** Complete all ${currentChallenge.monthly_challange_game_total} achievements`
                    },
                    {
                        name: 'Point System',
                        value: `• **Participation:** 1 point (earning any achievement)\n` +
                               `• **Game Beaten:** 3 points (completing the progression/win requirements)\n` +
                               `• **Mastery:** 3 points (100% completion)\n\n` +
                               `*Note: Points must be earned during the active month.*`
                    }
                )
                .setTimestamp();

            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Monthly Rules Error:', error);
            await interaction.editReply('Failed to retrieve monthly challenge rules');
        }
    },

    async displayShadowChallenge(interaction) {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge to check shadow game status
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });
            
            const embed = new EmbedBuilder()
                .setTitle('Shadow Game Challenge')
                .setColor('#9B59B6')
                .setDescription(
                    'The shadow game is a special monthly bonus challenge hidden within our community. ' +
                    'Once discovered, it becomes available to all members as an additional way to earn ' +
                    'points alongside the main monthly challenge.'
                )
                .addFields({
                    name: 'How It Works',
                    value: '1. A shadow game is hidden each month\n' +
                           '2. Members can try to guess it using `/shadowguess`\n' +
                           '3. Once revealed, all members can participate for additional points\n' +
                           '4. Use the `/challenge` command to see if it has been revealed'
                })
                .setTimestamp();

            if (!currentChallenge || !currentChallenge.shadow_challange_gameid) {
                embed.addFields({
                    name: 'Status',
                    value: 'No active shadow game available for this month.'
                });
            } else if (currentChallenge.shadow_challange_revealed) {
                // Shadow game is revealed - get game info
                const shadowGameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                
                // Get progression and win achievement counts for shadow
                const progressionCount = currentChallenge.shadow_challange_progression_achievements.length;
                const winCount = currentChallenge.shadow_challange_win_achievements.length;
                
                embed.addFields({
                    name: 'Current Challenge',
                    value: `**Game:** ${shadowGameInfo.title} (${shadowGameInfo.consoleName})\n\n` +
                           '**Available Points:**\n' +
                           `• **Participation:** 1 point\n` +
                           `• **Beaten:** 3 points (requires all ${progressionCount} progression achievements` +
                           (winCount > 0 ? ` and at least one win achievement` : '') + `)\n` +
                           `• **Mastery:** 3 points (all ${currentChallenge.shadow_challange_game_total} achievements)\n\n` +
                           'This challenge can be completed alongside the monthly challenge.'
                });
                
                embed.setURL(`https://retroachievements.org/game/${currentChallenge.shadow_challange_gameid}`);
                
                if (shadowGameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${shadowGameInfo.imageIcon}`);
                }
            } else {
                embed.addFields({
                    name: 'Status',
                    value: '*A shadow game has been prepared for this month, but it remains hidden.*\n\n' +
                           'Try to identify it by using the `/shadowguess` command followed by your guess for the shadow game.'
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Shadow Rules Error:', error);
            await interaction.editReply('Failed to retrieve shadow game rules');
        }
    },

    async displayPointsInfo(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Point System')
            .setColor('#F1C40F')
            .setDescription('Learn how points are earned in the Select Start Gaming Community')
            .addFields(
                {
                    name: 'Monthly Challenge Points',
                    value: '**Monthly Game Points:**\n' +
                           '• **Participation:** 1 point (earn any achievement)\n' +
                           '• **Game Beaten:** 3 points (complete the game)\n' +
                           '• **Mastery:** 3 points (100% achievement completion)\n\n' +
                           '**Shadow Game Points:**\n' +
                           '• **Participation:** 1 point (earn any achievement)\n' +
                           '• **Game Beaten:** 3 points (complete the game)'
                },
                {
                    name: 'Community Points',
                    value: '**Racing Challenges:**\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           '**Special Events:**\n' +
                           '• Community event participation (varies)\n' +
                           '• Arcade challenge high scores (varies)'
                },
                {
                    name: 'Important Notes',
                    value: '• Challenge points must be earned during the active month\n' +
                           '• Points contribute to yearly rankings\n' +
                           '• Use `/yearlyboard` to see the current standings\n' +
                           '• Year-end prizes may be awarded based on total points'
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayCommunityRules(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Community Guidelines')
            .setColor('#3498DB')
            .setDescription('Rules and information for the Select Start Gaming Community')
            .addFields(
                {
                    name: 'General Conduct',
                    value: '1. Treat all members with respect\n' +
                           '2. No harassment, discrimination, or hate speech\n' +
                           '3. Keep discussions family-friendly\n' +
                           '4. Follow channel topic guidelines\n' +
                           '5. Listen to and respect admin/mod decisions'
                },
                {
                    name: 'Challenge Participation',
                    value: '1. No cheating or exploitation of games\n' +
                           '2. Report technical issues to admins\n' +
                           '3. Submit scores/achievements honestly\n' +
                           '4. Help maintain a fair competition\n' +
                           '5. Celebrate others\' achievements'
                },
                {
                    name: 'Communication Channels',
                    value: '**#general-chat**\n' +
                           '• General discussion and community chat\n\n' +
                           '**#retroachievements**\n' +
                           '• Share your RA profile for verification\n\n' +
                           '**#monthly-challenge**\n' +
                           '• Discuss current challenges\n' +
                           '• Share tips and strategies\n\n' +
                           '**#bot-commands**\n' +
                           '• All bot commands should be used here'
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
