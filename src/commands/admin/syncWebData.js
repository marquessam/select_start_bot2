// commands/admin/syncWebData.js
import { SlashCommandBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import statsUpdateService from '../../services/statsUpdateService.js';
import monthlyTasksService from '../../services/monthlyTasksService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('syncwebdata')
        .setDescription('Force synchronization of data with the web app'),

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
            await statsUpdateService.syncWebAppData();
            await monthlyTasksService.updateNominationsForWebapp();
            
            return interaction.editReply('Web app data synchronized successfully!');
        } catch (error) {
            console.error('Error syncing web data:', error);
            return interaction.editReply('An error occurred while syncing web data. Please check the logs.');
        }
    }
};
