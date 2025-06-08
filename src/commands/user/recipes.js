// src/commands/user/recipes.js - Community Recipe Book Command
import { SlashCommandBuilder } from 'discord.js';
import combinationService from '../../services/combinationService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('recipes')
        .setDescription('View the community recipe book of discovered combinations'),

    async execute(interaction) {
        await combinationService.showRecipeBook(interaction, 0);
    },

    // Handle button interactions for the recipe book
    async handleButtonInteraction(interaction) {
        if (interaction.customId.startsWith('recipes_')) {
            return await combinationService.handleRecipeBookInteraction(interaction);
        }
        return false;
    }
};
