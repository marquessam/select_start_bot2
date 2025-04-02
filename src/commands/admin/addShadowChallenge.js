import { SlashCommandBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('addshadow')
        .setDescription('Add a shadow challenge to a specific month')
        .addStringOption(option =>
            option.setName('gameid')
            .setDescription('The RetroAchievements Game ID for the shadow game')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('progression_achievements')
            .setDescription('Comma-separated list of progression achievement IDs')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('win_achievements')
            .setDescription('Comma-separated list of win achievement IDs')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('month')
            .setDescription('Month (1-12, defaults to current month)')
            .setMinValue(1)
            .setMaxValue(12)
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('year')
            .setDescription('Year (defaults to current year)')
            .setMinValue(2000)
            .setMaxValue(2100)
            .setRequired(false)),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const gameId = interaction.options.getString('gameid');
            const progressionAchievementsInput = interaction.options.getString('progression_achievements');
            const winAchievementsInput = interaction.options.getString('win_achievements');
            
            // Get month and year parameters (optional)
            const now = new Date();
            const month = interaction.options.getInteger('month') || (now.getMonth() + 1); // Month is 0-indexed in JS
            const year = interaction.options.getInteger('year') || now.getFullYear();
            
            // Parse progression and win achievements
            const progressionAchievements = progressionAchievementsInput.split(',').map(id => id.trim()).filter(id => id);
            const winAchievements = winAchievementsInput ? winAchievementsInput.split(',').map(id => id.trim()).filter(id => id) : [];
            
            if (progressionAchievements.length === 0) {
                return interaction.editReply('Please provide at least one progression achievement ID.');
            }

            // Get date range for the specified month
            const monthStart = new Date(year, month - 1, 1);
            const nextMonthStart = new Date(year, month, 1);

            const targetChallenge = await Challenge.findOne({
                date: {
                    $gte: monthStart,
                    $lt: nextMonthStart
                }
            });

            if (!targetChallenge) {
                return interaction.editReply(`No challenge exists for ${month}/${year}. Create a monthly challenge first using /createchallenge.`);
            }

            let replacedShadowGame = null;
            if (targetChallenge.shadow_challange_gameid) {
                // Save existing shadow game info for the response message
                try {
                    const oldGameInfo = await retroAPI.getGameInfo(targetChallenge.shadow_challange_gameid);
                    replacedShadowGame = oldGameInfo.title;
                } catch (error) {
                    console.error('Error fetching old shadow game info:', error);
                    replacedShadowGame = targetChallenge.shadow_challange_gameid;
                }
            }

            // Get game info to validate game exists
            const gameInfo = await retroAPI.getGameInfoExtended(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }
            
            // Get game achievements to get the total count
            const achievements = gameInfo.achievements;
            if (!achievements) {
                return interaction.editReply('Could not retrieve achievements for this game. Please try again.');
            }
            
            const totalAchievements = Object.keys(achievements).length;

            // Update the challenge with shadow game information
            targetChallenge.shadow_challange_gameid = gameId;
            targetChallenge.shadow_challange_progression_achievements = progressionAchievements;
            targetChallenge.shadow_challange_win_achievements = winAchievements;
            targetChallenge.shadow_challange_game_total = totalAchievements;
            // Keep the current revealed status if replacing an existing shadow challenge
            if (!targetChallenge.shadow_challange_revealed) {
                targetChallenge.shadow_challange_revealed = false;
            }

            await targetChallenge.save();

            // Get month name for display
            const monthNames = ["January", "February", "March", "April", "May", "June",
                               "July", "August", "September", "October", "November", "December"];
            const monthName = monthNames[month - 1];

            if (replacedShadowGame) {
                return interaction.editReply({
                    content: `Shadow challenge for ${monthName} ${year} replaced with ${gameInfo.title}\n` +
                        `(No longer ${replacedShadowGame})\n` +
                        `Required progression achievements: ${progressionAchievements.length}\n` +
                        `Required win achievements: ${winAchievements.length}\n` +
                        `Mastery: ${totalAchievements} total achievements.\n` +
                        `Visibility: ${targetChallenge.shadow_challange_revealed ? 'Revealed' : 'Hidden'}`
                });
            } else {
                return interaction.editReply({
                    content: `Something stirs in the deep...\n` +
                        `Shadow challenge for ${monthName} ${year} created: ${gameInfo.title}\n` +
                        `Required progression achievements: ${progressionAchievements.length}\n` +
                        `Required win achievements: ${winAchievements.length}\n` +
                        `Mastery: ${totalAchievements} total achievements.\n` +
                        `The shadow challenge will remain hidden until revealed.`
                });
            }

        } catch (error) {
            console.error('Error adding shadow challenge:', error);
            return interaction.editReply('An error occurred while adding the shadow challenge. Please try again.');
        }
    }
};
