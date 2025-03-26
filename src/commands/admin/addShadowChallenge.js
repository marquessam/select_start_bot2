import { SlashCommandBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('addshadow')
        .setDescription('Add a shadow challenge to the current month')
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
            
            // Parse progression and win achievements
            const progressionAchievements = progressionAchievementsInput.split(',').map(id => id.trim()).filter(id => id);
            const winAchievements = winAchievementsInput ? winAchievementsInput.split(',').map(id => id.trim()).filter(id => id) : [];
            
            if (progressionAchievements.length === 0) {
                return interaction.editReply('Please provide at least one progression achievement ID.');
            }

            // Get current date and find current month's challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            if (!currentChallenge) {
                return interaction.editReply('No challenge exists for the current month. Create a monthly challenge first.');
            }

            if (currentChallenge.shadow_challange_gameid) {
                return interaction.editReply('A shadow challenge already exists for this month.');
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

            // Update the current challenge with shadow game information
            currentChallenge.shadow_challange_gameid = gameId;
            currentChallenge.shadow_challange_progression_achievements = progressionAchievements;
            currentChallenge.shadow_challange_win_achievements = winAchievements;
            currentChallenge.shadow_challange_game_total = totalAchievements;
            currentChallenge.shadow_challange_revealed = false;

            await currentChallenge.save();

            return interaction.editReply({
                content: `Something stirs in the deep...\n` +
                    `The shadow challenge will remain hidden until revealed.\n`
            });

        } catch (error) {
            console.error('Error adding shadow challenge:', error);
            return interaction.editReply('An error occurred while adding the shadow challenge. Please try again.');
        }
    }
};