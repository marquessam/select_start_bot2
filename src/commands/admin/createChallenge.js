import { SlashCommandBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('createchallenge')
        .setDescription('Create a new monthly challenge')
        .addStringOption(option =>
            option.setName('gameid')
            .setDescription('The RetroAchievements Game ID')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('month')
            .setDescription('Month (1-12)')
            .setMinValue(1)
            .setMaxValue(12)
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('year')
            .setDescription('Year')
            .setMinValue(2000)
            .setMaxValue(2100)
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
            const month = interaction.options.getInteger('month');
            const year = interaction.options.getInteger('year');
            const progressionAchievementsInput = interaction.options.getString('progression_achievements');
            const winAchievementsInput = interaction.options.getString('win_achievements');
            
            // Parse progression and win achievements
            const progressionAchievements = progressionAchievementsInput.split(',').map(id => id.trim()).filter(id => id);
            const winAchievements = winAchievementsInput ? winAchievementsInput.split(',').map(id => id.trim()).filter(id => id) : [];
            
            if (progressionAchievements.length === 0) {
                return interaction.editReply('Please provide at least one progression achievement ID.');
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

            // Create date for the first of the specified month
            const challengeDate = new Date(year, month - 1, 1);

            // Check if a challenge already exists for this month
            const existingChallenge = await Challenge.findOneAndDelete({
                date: {
                    $gte: challengeDate,
                    $lt: new Date(year, month, 1)
                }
            });

            // Create new challenge
            const challenge = new Challenge({
                date: challengeDate,
                monthly_challange_gameid: gameId,
                monthly_challange_progression_achievements: progressionAchievements,
                monthly_challange_win_achievements: winAchievements,
                monthly_challange_game_total: totalAchievements,
                shadow_challange_revealed: false
            });

            await challenge.save();

            if (existingChallenge) {
                return interaction.editReply({
                    content: `Monthly challenge replaced for ${gameInfo.title} (${month}/${year})\n` +
                        `(No longer ${existingChallenge.monthly_challange_gameid})\n` +
                        `Required progression achievements: ${progressionAchievements.length}\n` +
                        `Required win achievements: ${winAchievements.length}\n` +
                        `Mastery: ${totalAchievements} total achievements.\n`
                });
            } else {
                return interaction.editReply({
                    content: `Monthly challenge created for ${gameInfo.title} (${month}/${year})\n` +
                        `Required progression achievements: ${progressionAchievements.length}\n` +
                        `Required win achievements: ${winAchievements.length}\n` +
                        `Mastery: ${totalAchievements} total achievements.\n`
                });
            }

        } catch (error) {
            console.error('Error creating challenge:', error);
            return interaction.editReply('An error occurred while creating the challenge. Please try again.');
        }
    }
};