import { SlashCommandBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('toggleshadow')
        .setDescription('Toggle the visibility of the current shadow challenge'),

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

            // Toggle the visibility
            currentChallenge.shadow_challange_revealed = !currentChallenge.shadow_challange_revealed;
            await currentChallenge.save();

            // Get game info for the response
            const gameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);

            if (currentChallenge.shadow_challange_revealed) {
                return interaction.editReply({
                    content: `Shadow challenge is now REVEALED!\n` +
                        `Game: ${gameInfo.title}\n` +
                        `Goal: ${currentChallenge.shadow_challange_goal} achievements out of ${currentChallenge.shadow_challange_game_total} total achievements.`
                });
            } else {
                return interaction.editReply({
                    content: `Shadow challenge is now HIDDEN.`
                });
            }

        } catch (error) {
            console.error('Error toggling shadow challenge visibility:', error);
            return interaction.editReply('An error occurred while toggling the shadow challenge visibility. Please try again.');
        }
    }
};
