// Simple command to check what's actually in the database
// src/commands/admin/checkdb.js

import { SlashCommandBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import { Challenge } from '../../models/Challenge.js';
import { User } from '../../models/User.js';

export default {
    data: new SlashCommandBuilder()
        .setName('checkdb')
        .setDescription('Quick database check')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Username to check')
                .setRequired(true)),

    async execute(interaction) {
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({ content: 'No permission.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const username = interaction.options.getString('username');

        try {
            // Get user
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply(`❌ User "${username}" not found`);
            }

            // Get challenges
            const challenges = await Challenge.find({}).sort({ date: 1 });

            let output = `**Quick Database Check for ${username}:**\n\n`;

            // Show Challenge documents
            output += `**Challenge Documents (${challenges.length}):**\n`;
            challenges.forEach(challenge => {
                const monthKey = this.getMonthKey(challenge.date);
                output += `• ${monthKey}: Monthly="${challenge.monthly_game_title || 'NULL'}" Shadow="${challenge.shadow_game_title || 'NULL'}"\n`;
            });

            // Show user monthly data
            output += `\n**User Monthly Data (${user.monthlyChallenges.size}):**\n`;
            for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                if (data.progress > 0) {
                    output += `• ${monthKey}: Title="${data.gameTitle || 'NULL'}" Progress=${data.progress}\n`;
                }
            }

            // Show user shadow data
            output += `\n**User Shadow Data (${user.shadowChallenges.size}):**\n`;
            for (const [monthKey, data] of user.shadowChallenges.entries()) {
                if (data.progress > 0) {
                    output += `• ${monthKey}: Title="${data.gameTitle || 'NULL'}" Progress=${data.progress}\n`;
                }
            }

            // Split message if too long
            if (output.length > 1900) {
                const part1 = output.substring(0, 1900);
                const part2 = output.substring(1900);
                await interaction.editReply(part1);
                if (part2) {
                    await interaction.followUp({ content: part2, ephemeral: true });
                }
            } else {
                await interaction.editReply(output);
            }

        } catch (error) {
            console.error('Error in checkdb:', error);
            await interaction.editReply('❌ An error occurred. Check console for details.');
        }
    },

    getMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }
};
