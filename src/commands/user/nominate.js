import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nominate')
        .setDescription('Nominate a game for the next monthly challenge')
        .addStringOption(option =>
            option.setName('gameid')
            .setDescription('The RetroAchievements Game ID')
            .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const gameId = interaction.options.getString('gameid');

            // Find the user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You are not registered. Please ask an admin to register you first.');
            }

            // Check if the game exists
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }

            // Get current nominations
            const currentNominations = user.getCurrentNominations();
            if (currentNominations.length >= 2) {
                return interaction.editReply('You have already nominated 2 games this month. Please wait for next month to nominate again.');
            }

            // Check if this game was already nominated by this user
            if (currentNominations.some(nom => nom.gameId === gameId)) {
                return interaction.editReply('You have already nominated this game this month.');
            }

            // Add the nomination
            user.nominations.push({
                gameId,
                nominatedAt: new Date()
            });

            await user.save();

            return interaction.editReply({
                content: `Successfully nominated ${gameInfo.title} for next month's challenge!\n` +
                    `You have ${2 - (currentNominations.length + 1)} nominations remaining this month.`
            });

        } catch (error) {
            console.error('Error nominating game:', error);
            return interaction.editReply('An error occurred while nominating the game. Please try again.');
        }
    }
};