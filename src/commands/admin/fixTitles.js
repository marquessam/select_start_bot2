// Create: src/commands/admin/fixTitles.js

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import { User } from '../../models/User.js';

// Game title mappings based on your provided data
const GAME_TITLES = {
    '2025-01': {
        monthly: 'Chrono Trigger',
        shadow: 'Mario Tennis'
    },
    '2025-02': {
        monthly: 'Zelda: A Link to the Past',
        shadow: 'UN Squadron'
    },
    '2025-03': {
        monthly: 'Mega Man X5',
        shadow: 'Monster Rancher Advance 2'
    },
    '2025-04': {
        monthly: 'Ape Escape',
        shadow: 'Advance Wars'
    },
    '2025-05': {
        monthly: 'Pokemon Snap',
        shadow: 'Cocoron'
    }
};

export default {
    data: new SlashCommandBuilder()
        .setName('fixtitles')
        .setDescription('Fix game titles for 2025 challenges')
        .addBooleanOption(option =>
            option.setName('dryrun')
                .setDescription('Preview changes without saving')
                .setRequired(false)),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const dryRun = interaction.options.getBoolean('dryrun') || false;

        try {
            const users = await User.find({});
            let processedUsers = 0;
            let updatedTitles = 0;

            for (const user of users) {
                let userUpdated = false;

                // Process monthly challenges
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    if (GAME_TITLES[monthKey] && GAME_TITLES[monthKey].monthly) {
                        const newTitle = GAME_TITLES[monthKey].monthly;
                        if (data.gameTitle !== newTitle) {
                            if (!dryRun) {
                                data.gameTitle = newTitle;
                                user.monthlyChallenges.set(monthKey, data);
                                userUpdated = true;
                            }
                            updatedTitles++;
                            console.log(`${dryRun ? 'WOULD UPDATE' : 'UPDATED'} ${user.raUsername} monthly ${monthKey}: "${newTitle}"`);
                        }
                    }
                }

                // Process shadow challenges
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    if (GAME_TITLES[monthKey] && GAME_TITLES[monthKey].shadow) {
                        const newTitle = GAME_TITLES[monthKey].shadow;
                        if (data.gameTitle !== newTitle) {
                            if (!dryRun) {
                                data.gameTitle = newTitle;
                                user.shadowChallenges.set(monthKey, data);
                                userUpdated = true;
                            }
                            updatedTitles++;
                            console.log(`${dryRun ? 'WOULD UPDATE' : 'UPDATED'} ${user.raUsername} shadow ${monthKey}: "${newTitle}"`);
                        }
                    }
                }

                if (userUpdated && !dryRun) {
                    user.markModified('monthlyChallenges');
                    user.markModified('shadowChallenges');
                    await user.save();
                }

                processedUsers++;
            }

            const embed = new EmbedBuilder()
                .setTitle(dryRun ? '🔍 Title Fix Preview' : '✅ Titles Fixed')
                .setDescription(
                    `**Results:**\n` +
                    `• Users Processed: ${processedUsers}\n` +
                    `• Titles ${dryRun ? 'Would Be ' : ''}Updated: ${updatedTitles}\n\n` +
                    `${dryRun ? 'Run without dryrun to apply changes' : 'All 2025 game titles have been updated!'}`
                )
                .setColor(dryRun ? '#FFA500' : '#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fixing titles:', error);
            await interaction.editReply('❌ An error occurred. Check console for details.');
        }
    }
};
