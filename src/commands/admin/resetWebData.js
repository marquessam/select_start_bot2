// commands/admin/resetWebData.js
import { SlashCommandBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import mongoose from 'mongoose';

export default {
    data: new SlashCommandBuilder()
        .setName('resetwebdata')
        .setDescription('Reset all web app data collections'),

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
            const db = mongoose.connection.db;
            
            // Delete relevant collections
            await db.collection('challenges').deleteMany({});
            await db.collection('userstats').deleteMany({});
            await db.collection('users').deleteMany({});
            
            // Now sync fresh data
            const monthlyTasksService = (await import('../../services/monthlyTasksService.js')).default;
            await monthlyTasksService.syncWebAppData();
            await monthlyTasksService.updateNominationsForWebapp();
            
            return interaction.editReply('Web app data has been completely reset and re-synced!');
        } catch (error) {
            console.error('Error resetting web data:', error);
            return interaction.editReply('An error occurred while resetting web data. Please check the logs.');
        }
    }
};
