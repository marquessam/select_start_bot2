import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Displays community rules and challenge information')
        .addSubcommand(subcommand =>
            subcommand
                .setName('monthly')
                .setDescription('Display monthly challenge rules and information'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('shadow')
                .setDescription('Display shadow game challenge information'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('points')
                .setDescription('Display point system rules and information'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('community')
                .setDescription('Display community guidelines and Discord rules')),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
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
            await interaction.editReply('An error occurred while displaying rules. Please try again.');
        }
    },

    async displayRuleCategories(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('SELECT START RULES')
            .setDescription('Rules Database - Select a Category')
            .setColor('#00FF00') 
            .addFields(
                {
                    name: 'AVAILABLE CATEGORIES',
                    value: '1. `/rules monthly` - Monthly Challenge Rules & Information\n' +
                          '2. `/rules shadow` - Shadow Game Challenge Information\n' +
                          '3. `/rules points` - Point System Rules & Information\n' +
                          '4. `/rules community` - Community Guidelines & Discord Rules'
                }
            )
            .setFooter({ text: 'Select Start Discord Bot' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayMonthlyChallenge(interaction) {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });
            
            if (!currentChallenge) {
                return interaction.editReply('No active monthly challenge found.');
            }

            // Get game info
            const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);

            // Get current month name
            const monthName = now.toLocaleString('default', { month: 'long' });
            
            const embed = new EmbedBuilder()
                .setTitle(`${monthName.toUpperCase()} CHALLENGE RULES`)
                .setURL(`https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid}`)
                .setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`)
                .setDescription('Current Challenge Information')
                .setColor('#00FF00')
                .addFields(
                    {
                        name: 'ACTIVE CHALLENGE',
                        value: `GAME: ${gameInfo.title}\n` +
                               `DATES: ${currentMonthStart.toLocaleDateString()} - ${new Date(nextMonthStart - 86400000).toLocaleDateString()}`
                    },
                    {
                        name: 'CHALLENGE RULES',
                        value: `> Complete at least ${currentChallenge.monthly_challange_goal} achievements to earn "beaten" status\n` +
                               `> Complete all ${currentChallenge.monthly_challange_game_total} achievements to earn "mastery" status\n` +
                               `> Points are awarded based on completion level`
                    },
                    {
                        name: 'ACHIEVEMENT POINTS',
                        value: `- Participation: 1 point (earning any achievement)\n` +
                               `- Game Beaten: 3 points (completing ${currentChallenge.monthly_challange_goal} achievements)\n` +
                               `- Mastery: 3 points (completing all ${currentChallenge.monthly_challange_game_total} achievements)\n\n` +
                               `*Note: Participation and beaten points must be earned during the active month.*`
                    }
                )
                .setFooter({ text: 'Select Start Discord Bot' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Monthly Rules Error:', error);
            await interaction.editReply('Failed to retrieve monthly challenge rules. Please try again.');
        }
    },

    async displayShadowChallenge(interaction) {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });
            
            const embed = new EmbedBuilder()
                .setTitle('SHADOW GAME RULES')
                .setDescription(
                    'The shadow game is a special monthly bonus challenge ' +
                    'hidden within our community. Once discovered, it becomes available to all members as an ' +
                    'additional way to earn points alongside the main monthly challenge.'
                )
                .setColor('#800080') // Purple color for shadow themes
                .addFields(
                    {
                        name: 'HOW IT WORKS',
                        value: '1. A bonus game challenge is prepared each month\n' +
                               '2. Initially hidden until it\'s revealed by the admins\n' +
                               '3. Once revealed, all members can participate for additional points\n' +
                               '4. Can be completed alongside the main monthly challenge'
                    }
                );

            if (!currentChallenge || !currentChallenge.shadow_challange_gameid) {
                embed.addFields({
                    name: 'STATUS', 
                    value: 'No active shadow game available for this month.'
                });
            } else if (currentChallenge.shadow_challange_revealed) {
                // Get game info if the shadow game is revealed
                const gameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                
                embed.setURL(`https://retroachievements.org/game/${currentChallenge.shadow_challange_gameid}`);
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                
                embed.addFields({
                    name: 'CURRENT SHADOW CHALLENGE',
                    value: `GAME: ${gameInfo.title}\n` +
                           `GOAL: ${currentChallenge.shadow_challange_goal} of ${currentChallenge.shadow_challange_game_total} achievements\n\n` +
                           'AVAILABLE POINTS:\n' +
                           `• Participation: 1 point\n` +
                           `• Beaten: 3 points\n` +
                           `• Mastery: 3 points\n\n` +
                           'This challenge can be completed alongside the monthly challenge.'
                });
            } else {
                embed.addFields({
                    name: 'STATUS',
                    value: 'A shadow game has been prepared for this month...\n' +
                           'But it remains hidden in the darkness.\n\n' +
                           'The admins will reveal it at their discretion.'
                });
            }

            embed.setFooter({ text: 'Select Start Discord Bot' })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Shadow Rules Error:', error);
            await interaction.editReply('Failed to retrieve shadow game rules. Please try again.');
        }
    },

    async displayPointsInfo(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('POINT SYSTEM RULES')
            .setDescription('Point System Information')
            .setColor('#0099FF')
            .addFields(
                {
                    name: 'MONTHLY CHALLENGE POINTS',
                    value: '**Monthly Game Points:**\n' +
                           '- Participation (1 point): Earn any achievement\n' +
                           '- Game Beaten (3 points): Complete required achievements\n' +
                           '- Mastery (3 points): 100% achievement completion\n\n' +
                           '**Shadow Game Points:**\n' +
                           '- Participation (1 point): Earn any achievement\n' +
                           '- Game Beaten (3 points): Complete required achievements\n' +
                           '- Mastery (3 points): 100% achievement completion'
                },
                {
                    name: 'COMMUNITY POINTS',
                    value: '**Community Awards:**\n' +
                           '- Manually awarded by admins for various accomplishments\n' +
                           '- Points vary based on achievement difficulty or contribution value\n' +
                           '- Examples include exceptional challenge completions, community contributions, or special events\n\n' +
                           '**Special Events:**\n' +
                           '- Arcade Challenges: 1st/2nd/3rd place rewards 3/2/1 points\n' +
                           '- Racing Challenges: 1st/2nd/3rd place rewards 3/2/1 points\n' +
                           '- Beta testing participation (1 point)\n' +
                           '- Other community event participation (varies)'
                },
                {
                    name: 'IMPORTANT NOTES',
                    value: '- Participation and beaten points are time-limited\n' +
                           '- Mastery points can be earned anytime during the year\n' +
                           '- Points contribute to yearly rankings\n' +
                           '- Year-end prizes awarded based on total points'
                }
            )
            .setFooter({ text: 'Select Start Discord Bot' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayCommunityRules(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('COMMUNITY GUIDELINES')
            .setDescription('Community Rules & Information')
            .setColor('#FF5733')
            .addFields(
                {
                    name: 'GENERAL CONDUCT',
                    value: '1. Treat all members with respect\n' +
                           '2. No harassment, discrimination, or hate speech\n' +
                           '3. Keep discussions family-friendly\n' +
                           '4. Follow channel topic guidelines\n' +
                           '5. Listen to and respect admin/mod decisions'
                },
                {
                    name: 'CHALLENGE PARTICIPATION',
                    value: '1. No cheating or exploitation of games\n' +
                           '2. Report technical issues to admins\n' +
                           '3. Submit scores/achievements honestly\n' +
                           '4. Help maintain a fair competition\n' +
                           '5. Celebrate others\' achievements'
                },
                {
                    name: 'COMMUNICATION CHANNELS',
                    value: '**#general-chat**\n' +
                           '- General discussion and community chat\n\n' +
                           '**#retroachievements**\n' +
                           '- Share your RA profile for verification\n\n' +
                           '**#submissions**\n' +
                           '- Submit arcade high scores with proof\n\n' +
                           '**#monthly-challenge**\n' +
                           '- Discuss current challenges\n' +
                           '- Share tips and strategies\n\n' +
                           '**#bot-terminal**\n' +
                           '- All bot commands must be used here\n' +
                           '- Keep other channels clear of bot commands'
                }
            )
            .setFooter({ text: 'Select Start Discord Bot' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    }
};
