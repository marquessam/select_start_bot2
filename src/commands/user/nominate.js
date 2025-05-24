// src/commands/user/nominate.js

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { NominationSettings } from '../../models/NominationSettings.js';
import enhancedRetroAPI from '../../services/enhancedRetroAPI.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get nominations channel ID from .env
const NOMINATIONS_CHANNEL_ID = process.env.NOMINATIONS_CHANNEL;

// Maximum nominations per user
const MAX_NOMINATIONS = 2;

export default {
    data: new SlashCommandBuilder()
        .setName('nominate')
        .setDescription('Nominate a game for the next monthly challenge')
        .addIntegerOption(option =>
            option.setName('gameid')
            .setDescription('RetroAchievements Game ID (found in the URL)')
            .setRequired(true)),

    async execute(interaction) {
        // Check if command is used in the correct channel
        if (interaction.channelId !== NOMINATIONS_CHANNEL_ID) {
            // Return ephemeral message if in wrong channel
            await interaction.reply({ 
                content: `This command can only be used in <#${NOMINATIONS_CHANNEL_ID}>. Please use it there instead.`, 
                ephemeral: true 
            });
            return;
        }

        await interaction.deferReply({ ephemeral: false });

        try {
            // Get current nomination settings
            const settings = await NominationSettings.getSettings();
            const now = new Date();

            // Check if nominations are currently open
            if (!settings.areNominationsOpen(now)) {
                const nextOpening = settings.getNextOpeningDate(now);
                const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
                
                // Get the reason for closure
                let reasonText = '';
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                const override = settings.overrides.find(o => o.month === currentMonth && o.year === currentYear);
                
                if (override && !override.enabled) {
                    reasonText = `\n📝 **Reason:** ${override.reason}`;
                } else {
                    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                    const closeDaysStart = daysInMonth - settings.nominationCloseDays + 1;
                    reasonText = `\n📅 Nominations are closed during the **last ${settings.nominationCloseDays} days** of each month (days ${closeDaysStart}-${daysInMonth}).`;
                }
                
                return interaction.editReply(
                    `🚫 **Nominations are currently closed!**${reasonText}\n\n` +
                    `Next nominations period opens: <t:${nextOpeningTimestamp}:F>\n` +
                    `*(That's <t:${nextOpeningTimestamp}:R>)*`
                );
            }

            const gameId = interaction.options.getInteger('gameid');
            const discordId = interaction.user.id;

            // Validate gameId
            if (!gameId || gameId <= 0) {
                return interaction.editReply('Please provide a valid Game ID (positive number).');
            }

            // Get the user
            const user = await User.findOne({ discordId });
            if (!user) {
                return interaction.editReply({
                    content: 'You need to be registered to nominate games. Please use the `/register` command first.',
                    ephemeral: true
                });
            }

            // Check if game exists in RetroAchievements and get complete info using enhanced API
            let gameData;
            let achievementCount;
            
            try {
                console.log(`Fetching enhanced game info for gameId: ${gameId}`);
                
                // Get detailed game information
                gameData = await enhancedRetroAPI.getGameDetails(gameId);
                
                // Get achievement count
                achievementCount = await enhancedRetroAPI.getGameAchievementCount(gameId);
                
                console.log(`Successfully fetched: "${gameData.title}" (${gameData.consoleName})`);
                console.log(`Publisher: ${gameData.publisher}, Developer: ${gameData.developer}, Genre: ${gameData.genre}`);
                console.log(`Achievement count: ${achievementCount}`);
                
            } catch (error) {
                console.error(`Error fetching game info for gameId ${gameId}:`, error);
                return interaction.editReply(
                    'Game not found or unable to retrieve game information. Please check the Game ID and try again.'
                );
            }

            // Validate that we have essential information
            if (!gameData.title || !gameData.consoleName) {
                console.error(`Incomplete game data for gameId ${gameId}:`, gameData);
                return interaction.editReply(
                    'The game information appears to be incomplete. Please try again or contact an administrator.'
                );
            }

            // Check game eligibility using enhanced restriction system
            if (!settings.isGameAllowed(gameData, now)) {
                return interaction.editReply(
                    settings.getRestrictionMessage(gameData, now)
                );
            }

            // Get current nominations for the user
            const currentNominations = user.getCurrentNominations();
            
            // Check if user already nominated this game
            const existingNomination = currentNominations.find(nom => nom.gameId === gameId);
            if (existingNomination) {
                return interaction.editReply(`You've already nominated "${gameData.title}" for next month's challenge.`);
            }
            
            // Check if user has reached max nominations
            if (currentNominations.length >= MAX_NOMINATIONS) {
                return interaction.editReply(
                    `You've already used all ${MAX_NOMINATIONS} of your nominations for next month. ` +
                    `Please ask an admin to use the \`/clearnominations\` command if you want to reset your nominations.`
                );
            }
            
            // Create the nomination object with enhanced information
            const nomination = {
                gameId: gameId,
                gameTitle: gameData.title,
                consoleName: gameData.consoleName,
                publisher: gameData.publisher,
                developer: gameData.developer,
                genre: gameData.genre,
                released: gameData.released,
                nominatedAt: new Date()
            };

            // Validate the nomination object before saving
            if (!nomination.gameId || !nomination.gameTitle || !nomination.consoleName) {
                console.error('Nomination validation failed:', nomination);
                return interaction.editReply(
                    'Failed to create nomination due to missing required information. Please try again.'
                );
            }
            
            // Initialize nominations array if it doesn't exist
            if (!user.nominations) {
                user.nominations = [];
            }
            
            // Add the new nomination
            user.nominations.push(nomination);
            
            try {
                await user.save();
                console.log(`Successfully saved nomination for ${user.raUsername}: "${gameData.title}" (${gameData.consoleName})`);
            } catch (saveError) {
                console.error('Error saving nomination:', saveError);
                return interaction.editReply(
                    'An error occurred while saving your nomination. Please try again.'
                );
            }
            
            // Get current month restriction for styling and description
            const currentRestriction = settings.getCurrentMonthRestriction(now);
            
            // Create enhanced embed for confirmation
            const embed = new EmbedBuilder()
                .setTitle('Game Nomination')
                .setColor(currentRestriction?.restrictionRule?.color || '#00FF00')
                .setThumbnail(`https://retroachievements.org${gameData.imageIcon}`)
                .setURL(`https://retroachievements.org/game/${gameId}`)
                .setTimestamp();

            // Basic game information
            embed.addFields(
                { name: '🎮 Game', value: gameData.title, inline: true },
                { name: '🎯 Console', value: gameData.consoleName, inline: true },
                { name: '🏆 Achievements', value: achievementCount.toString(), inline: true }
            );

            // Enhanced information (if available)
            if (gameData.publisher) {
                embed.addFields({ name: '🏢 Publisher', value: gameData.publisher, inline: true });
            }
            if (gameData.developer) {
                embed.addFields({ name: '👨‍💻 Developer', value: gameData.developer, inline: true });
            }
            if (gameData.genre) {
                embed.addFields({ name: '🎭 Genre', value: gameData.genre, inline: true });
            }
            if (gameData.released) {
                try {
                    const releaseDate = new Date(gameData.released);
                    const year = releaseDate.getFullYear();
                    if (year && year > 1900) {
                        embed.addFields({ name: '📅 Released', value: year.toString(), inline: true });
                    }
                } catch (error) {
                    // Ignore date parsing errors
                }
            }

            // Nomination status
            embed.addFields({
                name: '📊 Your Nominations',
                value: `${MAX_NOMINATIONS - (currentNominations.length + 1)}/${MAX_NOMINATIONS} remaining`,
                inline: true
            });

            // Add special description for themed months
            if (currentRestriction && currentRestriction.enabled) {
                embed.setDescription(
                    `${user.raUsername} has nominated a game for **${currentRestriction.restrictionRule.name}**! ${currentRestriction.restrictionRule.emoji}`
                );
            } else {
                embed.setDescription(`${user.raUsername} has nominated a game for next month's challenge:`);
            }

            // Add nomination period info in footer
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
            const closeDaysStart = daysInMonth - settings.nominationCloseDays + 1;
            const nextClosing = new Date(currentYear, currentMonth, closeDaysStart);
            const nextClosingTimestamp = Math.floor(nextClosing.getTime() / 1000);
            
            embed.setFooter({ 
                text: `Nominations close <t:${nextClosingTimestamp}:R> (last ${settings.nominationCloseDays} days)` 
            });
            
            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error nominating game:', error);
            return interaction.editReply('An unexpected error occurred while processing your nomination. Please try again.');
        }
    }
};
