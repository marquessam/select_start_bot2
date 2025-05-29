// Quick manual fix for specific Challenge documents
// src/commands/admin/manualChallengeFix.js

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

// Known game IDs and titles for 2025 (you can add more as needed)
const KNOWN_GAMES = {
    // Add your actual game IDs here - these are examples
    '14402': 'Chrono Trigger',
    '355': 'The Legend of Zelda: A Link to the Past', 
    '11240': 'Mega Man X5',
    '11279': 'Ape Escape',
    '14402': 'Pokémon Snap', // This might be wrong, just example
    // Shadow games
    '10438': 'Mario Tennis',
    '1447': 'U.N. Squadron',
    // Add more as needed
};

export default {
    data: new SlashCommandBuilder()
        .setName('manualchallengefix')
        .setDescription('Manually fix Challenge document metadata')
        .addStringOption(option =>
            option.setName('monthkey')
                .setDescription('Month key (YYYY-MM format, e.g., 2025-04)')
                .setRequired(true))
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

        const monthKey = interaction.options.getString('monthkey');
        const dryRun = interaction.options.getBoolean('dryrun') || false;

        try {
            // Parse month key
            const [year, month] = monthKey.split('-').map(Number);
            if (!year || !month || month < 1 || month > 12) {
                return interaction.editReply('❌ Invalid month key format. Use YYYY-MM (e.g., 2025-04)');
            }

            // Find the challenge
            const challengeDate = new Date(year, month - 1, 1);
            const nextMonthStart = new Date(year, month, 1);

            const challenge = await Challenge.findOne({
                date: {
                    $gte: challengeDate,
                    $lt: nextMonthStart
                }
            });

            if (!challenge) {
                return interaction.editReply(`❌ No challenge found for ${monthKey}`);
            }

            let updates = [];
            let updated = false;

            // Check monthly game metadata
            if (challenge.monthly_challange_gameid && !challenge.monthly_game_title) {
                try {
                    let gameInfo;
                    
                    // Try known games first (faster)
                    if (KNOWN_GAMES[challenge.monthly_challange_gameid]) {
                        gameInfo = {
                            title: KNOWN_GAMES[challenge.monthly_challange_gameid],
                            imageIcon: null, // Will be fetched from API if needed
                            consoleName: null
                        };
                    } else {
                        // Fetch from API
                        gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
                    }
                    
                    if (gameInfo && !dryRun) {
                        challenge.monthly_game_title = gameInfo.title;
                        challenge.monthly_game_icon_url = gameInfo.imageIcon;
                        challenge.monthly_game_console = gameInfo.consoleName;
                        updated = true;
                    }
                    
                    updates.push(`Monthly: ${challenge.monthly_challange_gameid} → "${gameInfo.title}"`);
                } catch (error) {
                    updates.push(`Monthly: ${challenge.monthly_challange_gameid} → ERROR: ${error.message}`);
                }
            } else if (challenge.monthly_game_title) {
                updates.push(`Monthly: Already has title "${challenge.monthly_game_title}"`);
            }

            // Check shadow game metadata
            if (challenge.shadow_challange_gameid && !challenge.shadow_game_title) {
                try {
                    let shadowGameInfo;
                    
                    // Try known games first
                    if (KNOWN_GAMES[challenge.shadow_challange_gameid]) {
                        shadowGameInfo = {
                            title: KNOWN_GAMES[challenge.shadow_challange_gameid],
                            imageIcon: null,
                            consoleName: null
                        };
                    } else {
                        // Fetch from API
                        shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
                    }
                    
                    if (shadowGameInfo && !dryRun) {
                        challenge.shadow_game_title = shadowGameInfo.title;
                        challenge.shadow_game_icon_url = shadowGameInfo.imageIcon;
                        challenge.shadow_game_console = shadowGameInfo.consoleName;
                        updated = true;
                    }
                    
                    updates.push(`Shadow: ${challenge.shadow_challange_gameid} → "${shadowGameInfo.title}"`);
                } catch (error) {
                    updates.push(`Shadow: ${challenge.shadow_challange_gameid} → ERROR: ${error.message}`);
                }
            } else if (challenge.shadow_game_title) {
                updates.push(`Shadow: Already has title "${challenge.shadow_game_title}"`);
            }

            // Save if updated
            if (updated && !dryRun) {
                await challenge.save();
            }

            const embed = new EmbedBuilder()
                .setTitle(dryRun ? `🔍 Preview: ${monthKey}` : `✅ Fixed: ${monthKey}`)
                .setDescription(updates.join('\n') || 'No updates needed')
                .setColor(dryRun ? '#FFA500' : '#00FF00')
                .setTimestamp();

            if (updates.length === 0) {
                embed.setDescription('No metadata missing - Challenge document already complete');
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in manual challenge fix:', error);
            await interaction.editReply('❌ An error occurred. Check console for details.');
        }
    }
};
