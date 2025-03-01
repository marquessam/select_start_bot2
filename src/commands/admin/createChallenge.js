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
        .addIntegerOption(option =>
            option.setName('goal')
            .setDescription('Number of achievements needed for beaten status')
            .setRequired(true)
            .setMinValue(1)),

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
            const goal = interaction.options.getInteger('goal');

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
            const existingChallenge = await Challenge.findOne({
                date: {
                    $gte: challengeDate,
                    $lt: new Date(year, month, 1)
                }
            });

            if (existingChallenge) {
                return interaction.editReply('A challenge already exists for this month.');
            }

            // Create new challenge
            const challenge = new Challenge({
                date: challengeDate,
                monthly_challange_gameid: gameId,
                monthly_challange_goal: goal,
                monthly_challange_game_total: totalAchievements,
                shadow_challange_revealed: false
            });

            await challenge.save();

            return interaction.editReply({
                content: `Monthly challenge created for ${gameInfo.title} (${month}/${year})\n` +
                    `Goal: ${goal} achievements out of ${totalAchievements} total achievements.`
            });

        } catch (error) {
            console.error('Error creating challenge:', error);
            return interaction.editReply('An error occurred while creating the challenge. Please try again.');
        }
    }
};
