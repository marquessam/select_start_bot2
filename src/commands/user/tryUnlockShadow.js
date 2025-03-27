import { SlashCommandBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shadowguess')
        .setDescription('Guess the shadow challenge')
        .addStringOption(option =>
            option.setName('shadow_guess')
            .setDescription('Your Guess')
            .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const shadowGuess = interaction.options.getString('shadow_guess');
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
                return interaction.editReply('No challenge exists for the current month.');
            }

            if (!currentChallenge.shadow_challange_gameid) {
                return interaction.editReply('No shadow challenge has been set for this month.');
            }

            const gameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);

            if (currentChallenge.shadow_challange_revealed) {
                return interaction.editReply(`The shadow challenge has already been revealed: ${gameInfo.title}`);
            }

            // The importatn part
            if (shadowGuess != gameInfo.title) {
                return interaction.editReply(`Wrong Guess: ${shadowGuess}`);
            }

            // Toggle the visibility
            currentChallenge.shadow_challange_revealed = true;
            await currentChallenge.save();

            return interaction.editReply({
                content: `Shadow challenge is now REVEALED!\n` +
                    `Game: ${gameInfo.title}`
            });

        } catch (error) {
            console.error('Error doing shadow challenge guess:', error);
            return interaction.editReply('An error occurred while triyng to process the shadow challenge guess.');
        }
    }
};
