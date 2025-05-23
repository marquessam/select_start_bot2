import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get nominations channel ID from .env
const NOMINATIONS_CHANNEL_ID = process.env.NOMINATIONS_CHANNEL;

// Maximum nominations per user
const MAX_NOMINATIONS = 2;

// Ineligible consoles
const INELIGIBLE_CONSOLES = ['PlayStation 2', 'GameCube'];

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

            // Check if game exists in RetroAchievements and get complete info
            let gameInfo;
            let achievementCount;
            
            try {
                console.log(`Fetching game info for gameId: ${gameId}`);
                gameInfo = await retroAPI.getGameInfo(gameId);
                
                if (!gameInfo || !gameInfo.title || !gameInfo.consoleName) {
                    throw new Error('Incomplete game information received from API');
                }
                
                // Also get achievement count
                achievementCount = await retroAPI.getGameAchievementCount(gameId);
                
                console.log(`Successfully fetched: "${gameInfo.title}" (${gameInfo.consoleName}) with ${achievementCount} achievements`);
                
            } catch (error) {
                console.error(`Error fetching game info for gameId ${gameId}:`, error);
                return interaction.editReply(
                    'Game not found or unable to retrieve game information. Please check the Game ID and try again.'
                );
            }

            // Validate that we have all required information
            if (!gameInfo.title || !gameInfo.consoleName) {
                console.error(`Incomplete game data for gameId ${gameId}:`, gameInfo);
                return interaction.editReply(
                    'The game information appears to be incomplete. Please try again or contact an administrator.'
                );
            }

            // Check if the console is eligible
            if (INELIGIBLE_CONSOLES.includes(gameInfo.consoleName)) {
                return interaction.editReply(
                    `Games for ${gameInfo.consoleName} are not eligible for nomination. Please nominate a game from a different console.`
                );
            }

            // Get current nominations for the user
            const currentNominations = user.getCurrentNominations();
            
            // Check if user already nominated this game
            const existingNomination = currentNominations.find(nom => nom.gameId === gameId);
            if (existingNomination) {
                return interaction.editReply(`You've already nominated "${gameInfo.title}" for next month's challenge.`);
            }
            
            // Check if user has reached max nominations
            if (currentNominations.length >= MAX_NOMINATIONS) {
                return interaction.editReply(
                    `You've already used all ${MAX_NOMINATIONS} of your nominations for next month. ` +
                    `Please ask an admin to use the \`/clearnominations\` command if you want to reset your nominations.`
                );
            }
            
            // Create the nomination object with all required fields validated
            const nomination = {
                gameId: gameId,
                gameTitle: gameInfo.title,
                consoleName: gameInfo.consoleName,
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
                console.log(`Successfully saved nomination for ${user.raUsername}: "${gameInfo.title}" (${gameInfo.consoleName})`);
            } catch (saveError) {
                console.error('Error saving nomination:', saveError);
                return interaction.editReply(
                    'An error occurred while saving your nomination. Please try again.'
                );
            }
            
            // Create embed for confirmation - using RA username instead of Discord username
            const embed = new EmbedBuilder()
                .setTitle('Game Nomination')
                .setDescription(`${user.raUsername} has nominated a game for next month's challenge:`)
                .setColor('#00FF00')
                .addFields(
                    { name: 'Game', value: gameInfo.title },
                    { name: 'Console', value: gameInfo.consoleName },
                    { name: 'Achievements', value: achievementCount.toString() },
                    { 
                        name: 'Nominations Remaining', 
                        value: `${MAX_NOMINATIONS - (currentNominations.length + 1)}/${MAX_NOMINATIONS}` 
                    }
                )
                .setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`)
                .setURL(`https://retroachievements.org/game/${gameId}`)
                .setTimestamp();
            
            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error nominating game:', error);
            return interaction.editReply('An unexpected error occurred while processing your nomination. Please try again.');
        }
    }
};
