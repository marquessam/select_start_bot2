// src/commands/admin/backfillTitles.js - DEBUG VERSION
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('backfilltitles')
        .setDescription('Backfill missing game titles in user challenge records')
        .addBooleanOption(option =>
            option.setName('dryrun')
                .setDescription('Preview changes without saving')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Specific user to backfill (optional)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('debug')
                .setDescription('Show debug information')
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
        const targetUsername = interaction.options.getString('username');
        const debug = interaction.options.getBoolean('debug') || false;

        try {
            if (dryRun) {
                await this.runAnalysis(interaction, targetUsername, debug);
            } else {
                await this.runBackfill(interaction, targetUsername, debug);
            }
        } catch (error) {
            console.error('Error in backfill command:', error);
            await interaction.editReply('❌ An error occurred. Check console for details.');
        }
    },

    async runAnalysis(interaction, targetUsername, debug) {
        await interaction.editReply('🔍 **Analyzing missing game titles...**');

        // Get users to check
        let users;
        if (targetUsername) {
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${targetUsername}$`, 'i') }
            });
            if (!user) {
                return interaction.editReply(`❌ User "${targetUsername}" not found.`);
            }
            users = [user];
        } else {
            users = await User.find({}).limit(3); // Limit for debug
        }

        let totalMissing = 0;
        let analysisText = '';

        for (const user of users) {
            let userMissing = 0;
            let userDebugInfo = '';
            
            // Check monthly challenges
            for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                if (debug) {
                    userDebugInfo += `\n  Monthly ${monthKey}: gameTitle="${data.gameTitle || 'MISSING'}"`;
                }
                if (!data.gameTitle) {
                    userMissing++;
                    totalMissing++;
                }
            }
            
            // Check shadow challenges  
            for (const [monthKey, data] of user.shadowChallenges.entries()) {
                if (debug) {
                    userDebugInfo += `\n  Shadow ${monthKey}: gameTitle="${data.gameTitle || 'MISSING'}"`;
                }
                if (!data.gameTitle) {
                    userMissing++;
                    totalMissing++;
                }
            }
            
            if (userMissing > 0 || debug) {
                analysisText += `\n• **${user.raUsername}**: ${userMissing} missing titles`;
                if (debug) {
                    analysisText += userDebugInfo;
                }
                analysisText += '\n';
            }
        }

        if (totalMissing === 0) {
            analysisText = '✅ No missing game titles found!';
        } else {
            analysisText += `\n📊 **Total missing titles**: ${totalMissing}`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔍 Game Title Analysis')
            .setDescription(analysisText.length > 4000 ? analysisText.substring(0, 4000) + '...' : analysisText)
            .setColor('#FFA500')
            .setFooter({ text: 'Run without dryrun to fix missing titles' });

        await interaction.editReply({ embeds: [embed] });
    },

    async runBackfill(interaction, targetUsername, debug) {
        await interaction.editReply('🔄 **Backfilling game titles...**');

        // Get users to update
        let users;
        if (targetUsername) {
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${targetUsername}$`, 'i') }
            });
            if (!user) {
                return interaction.editReply(`❌ User "${targetUsername}" not found.`);
            }
            users = [user];
        } else {
            users = await User.find({}).limit(debug ? 2 : 999); // Limit for debug
        }

        let processedUsers = 0;
        let updatedTitles = 0;
        let errors = 0;
        let debugLog = '';

        for (const user of users) {
            try {
                let userUpdated = false;
                let userDebugInfo = `\n**${user.raUsername}:**`;

                // Process monthly challenges
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    if (debug) {
                        userDebugInfo += `\n  Monthly ${monthKey}: current="${data.gameTitle || 'MISSING'}"`;
                    }
                    
                    if (!data.gameTitle) {
                        const gameTitle = await this.getGameTitleForMonth(monthKey, 'monthly', debug);
                        if (gameTitle) {
                            // IMPORTANT: Update the actual data object
                            const updatedData = { ...data, gameTitle: gameTitle };
                            user.monthlyChallenges.set(monthKey, updatedData);
                            userUpdated = true;
                            updatedTitles++;
                            
                            if (debug) {
                                userDebugInfo += ` → SET TO "${gameTitle}"`;
                            }
                            console.log(`✅ Updated ${user.raUsername} monthly ${monthKey}: ${gameTitle}`);
                        } else {
                            if (debug) {
                                userDebugInfo += ` → FAILED TO GET TITLE`;
                            }
                        }
                    } else {
                        if (debug) {
                            userDebugInfo += ` → ALREADY HAS TITLE`;
                        }
                    }
                }

                // Process shadow challenges
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    if (debug) {
                        userDebugInfo += `\n  Shadow ${monthKey}: current="${data.gameTitle || 'MISSING'}"`;
                    }
                    
                    if (!data.gameTitle) {
                        const gameTitle = await this.getGameTitleForMonth(monthKey, 'shadow', debug);
                        if (gameTitle) {
                            // IMPORTANT: Update the actual data object
                            const updatedData = { ...data, gameTitle: gameTitle };
                            user.shadowChallenges.set(monthKey, updatedData);
                            userUpdated = true;
                            updatedTitles++;
                            
                            if (debug) {
                                userDebugInfo += ` → SET TO "${gameTitle}"`;
                            }
                            console.log(`✅ Updated ${user.raUsername} shadow ${monthKey}: ${gameTitle}`);
                        } else {
                            if (debug) {
                                userDebugInfo += ` → FAILED TO GET TITLE`;
                            }
                        }
                    } else {
                        if (debug) {
                            userDebugInfo += ` → ALREADY HAS TITLE`;
                        }
                    }
                }

                if (userUpdated) {
                    await user.save();
                    console.log(`💾 Saved user ${user.raUsername} with ${userUpdated} updates`);
                }

                if (debug) {
                    debugLog += userDebugInfo + '\n';
                }

                processedUsers++;

            } catch (error) {
                console.error(`Error processing user ${user.raUsername}:`, error);
                errors++;
            }
        }

        let resultText = `**Results:**\n` +
            `• Users Processed: ${processedUsers}\n` +
            `• Titles Updated: ${updatedTitles}\n` +
            `• Errors: ${errors}\n\n` +
            `${updatedTitles > 0 ? 'Game titles have been populated!' : 'No titles needed updating.'}`;

        if (debug && debugLog) {
            resultText += `\n\n**Debug Log:**${debugLog}`;
        }

        const embed = new EmbedBuilder()
            .setTitle('✅ Game Title Backfill Complete')
            .setDescription(resultText.length > 4000 ? resultText.substring(0, 4000) + '...' : resultText)
            .setColor(updatedTitles > 0 ? '#00FF00' : '#FFA500')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async getGameTitleForMonth(monthKey, challengeType, debug = false) {
        try {
            // Parse monthKey (YYYY-MM format)
            const [year, month] = monthKey.split('-').map(Number);
            const challengeDate = new Date(year, month - 1, 1);
            const nextMonthStart = new Date(year, month, 1);

            if (debug) {
                console.log(`🔍 Looking for ${challengeType} challenge for ${monthKey} (${challengeDate.toISOString()} to ${nextMonthStart.toISOString()})`);
            }

            // Find the challenge record
            const challenge = await Challenge.findOne({
                date: {
                    $gte: challengeDate,
                    $lt: nextMonthStart
                }
            });

            if (!challenge) {
                console.log(`❌ No challenge found for ${monthKey}`);
                return null;
            }

            if (debug) {
                console.log(`✅ Found challenge for ${monthKey}:`, {
                    monthly_gameid: challenge.monthly_challange_gameid,
                    shadow_gameid: challenge.shadow_challange_gameid,
                    monthly_title: challenge.monthly_challange_game_title,
                    shadow_title: challenge.shadow_challange_game_title
                });
            }

            // Get the appropriate game ID
            let gameId;
            if (challengeType === 'monthly') {
                gameId = challenge.monthly_challange_gameid;
            } else if (challengeType === 'shadow') {
                gameId = challenge.shadow_challange_gameid;
            }

            if (!gameId) {
                console.log(`❌ No ${challengeType} game ID found for ${monthKey}`);
                return null;
            }

            // Get game info from RetroAchievements API
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (gameInfo && gameInfo.title) {
                console.log(`✅ Found title for ${monthKey} ${challengeType}: ${gameInfo.title}`);
                return gameInfo.title;
            }

            console.log(`❌ Could not get game info for ID ${gameId}`);
            return null;

        } catch (error) {
            console.error(`Error getting game title for ${monthKey} ${challengeType}:`, error);
            return null;
        }
    }
};
