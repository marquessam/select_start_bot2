import { SlashCommandBuilder } from '@discordjs/builders';
import { Game } from '../../models/index.js';
import { retroAPI } from '../../services/index.js';
import { createErrorEmbed, createSuccessEmbed, isValidGameId } from '../../utils/index.js';
import { canManageGames } from '../../utils/permissions.js';
import { getCurrentPeriod, formatPeriod } from '../../utils/dateUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('add-game')
        .setDescription('Add a new monthly or shadow game')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Game type')
                .setRequired(true)
                .addChoices(
                    { name: 'Monthly Challenge', value: 'MONTHLY' },
                    { name: 'Shadow Game', value: 'SHADOW' }
                ))
        .addStringOption(option =>
            option.setName('game_id')
                .setDescription('RetroAchievements game ID')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('progression')
                .setDescription('Comma-separated list of progression achievement IDs')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('win_condition')
                .setDescription('Comma-separated list of win condition achievement IDs')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('require_progression')
                .setDescription('Require all progression achievements')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('require_all_wins')
                .setDescription('Require all win conditions')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('mastery_check')
                .setDescription('Enable mastery points (Monthly only)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            // Check permissions
            if (!canManageGames(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed(
                        'Permission Denied',
                        'You do not have permission to manage games.'
                    )],
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const gameId = interaction.options.getString('game_id');
            const type = interaction.options.getString('type');
            const progression = interaction.options.getString('progression')?.split(',').map(id => id.trim()) || [];
            const winCondition = interaction.options.getString('win_condition')?.split(',').map(id => id.trim()) || [];
            const requireProgression = interaction.options.getBoolean('require_progression') ?? false;
            const requireAllWinConditions = interaction.options.getBoolean('require_all_wins') ?? false;
            const masteryCheck = interaction.options.getBoolean('mastery_check') ?? false;

            // Validate game ID
            if (!isValidGameId(gameId)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Invalid Game ID',
                        'Please provide a valid RetroAchievements game ID.'
                    )]
                });
            }

            // Get current period
            const { month, year } = getCurrentPeriod();

            // Check if a game of this type already exists for the current month
            const existingGame = await Game.findOne({
                type,
                month,
                year,
                active: true
            });

            if (existingGame) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Game Already Exists',
                        `A ${type.toLowerCase()} game already exists for ${formatPeriod(month, year)}: ${existingGame.title}`
                    )]
                });
            }

            // Fetch game info from RetroAchievements
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Game Not Found',
                        'This game ID was not found on RetroAchievements.'
                    )]
                });
            }

            // Validate achievement IDs if provided
            const achievements = await retroAPI.getGameAchievements(gameId);
            const achievementIds = new Set(Object.keys(achievements));

            const invalidProgressionIds = progression.filter(id => !achievementIds.has(id));
            const invalidWinConditionIds = winCondition.filter(id => !achievementIds.has(id));

            if (invalidProgressionIds.length > 0 || invalidWinConditionIds.length > 0) {
                const invalid = [...invalidProgressionIds, ...invalidWinConditionIds].join(', ');
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Invalid Achievement IDs',
                        `The following achievement IDs are not valid for this game: ${invalid}`
                    )]
                });
            }

            // Create new game
            const game = new Game({
                gameId,
                title: gameInfo.title,
                type,
                month,
                year,
                progression,
                winCondition,
                requireProgression,
                requireAllWinConditions,
                masteryCheck: type === 'MONTHLY' ? masteryCheck : false,
                active: true
            });

            await game.save();

            // Create success embed
            const embed = createSuccessEmbed(
                'Game Added',
                `Successfully added ${type.toLowerCase()} game for ${formatPeriod(month, year)}`
            );

            embed.addFields(
                { name: 'Game', value: gameInfo.title, inline: true },
                { name: 'Type', value: type, inline: true },
                { name: 'Console', value: gameInfo.consoleName, inline: true }
            );

            if (progression.length > 0) {
                embed.addFields({
                    name: 'Progression Requirements',
                    value: `${progression.length} achievement${progression.length === 1 ? '' : 's'} (${requireProgression ? 'All required' : 'Any counts'})`
                });
            }

            if (winCondition.length > 0) {
                embed.addFields({
                    name: 'Win Conditions',
                    value: `${winCondition.length} achievement${winCondition.length === 1 ? '' : 's'} (${requireAllWinConditions ? 'All required' : 'Any counts'})`
                });
            }

            if (type === 'MONTHLY' && masteryCheck) {
                embed.addFields({
                    name: 'Mastery',
                    value: '🌟 Mastery points enabled for this game'
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error executing add-game command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while adding the game. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
