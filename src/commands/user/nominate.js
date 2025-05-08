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

            // Get the user
            const user = await User.findOne({ discordId });
            if (!user) {
                return interaction.editReply({
                    content: 'You need to be registered to nominate games. Please use the `/register` command first.',
                    ephemeral: true
                });
            }

            // Check if game exists in RetroAchievements
            let gameInfo;
            try {
                gameInfo = await retroAPI.getGameInfo(gameId);
                if (!gameInfo || !gameInfo.title) {
                    throw new Error('Invalid game info');
                }
            } catch (error) {
                return interaction.editReply('Game not found. Please check the Game ID and try again.');
            }

            // Check if the console is eligible
            if (INELIGIBLE_CONSOLES.includes(gameInfo.consoleName)) {
                return interaction.editReply(`Games for ${gameInfo.consoleName} are not eligible for nomination. Please nominate a game from a different console.`);
            }

            // Helper function to get current month's nominations since we can't use the method
            function getCurrentNominations(user) {
                if (!user.nominations || !Array.isArray(user.nominations)) {
                    return [];
                }
                
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                
                return user.nominations.filter(nom => {
                    const nomDate = new Date(nom.nominatedAt);
                    return nomDate.getMonth() === currentMonth && nomDate.getFullYear() === currentYear;
                });
            }
            
            // Get current nominations for the user
            const currentNominations = getCurrentNominations(user);
            
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
            
            // Get achievement count for the game
            const achievementCount = await retroAPI.getGameAchievementCount(gameId);
            
            // Add the nomination
            // Since user.nominate() doesn't exist, we'll implement the nomination logic here
            const now = new Date();
            
            // Check if nominations array exists, if not, initialize it
            if (!user.nominations) {
                user.nominations = [];
            }
            
            // Add new nomination with current date
            user.nominations.push({
                gameId: gameId,
                nominatedAt: now
            });
            
            await user.save();
            
            // Create embed for confirmation
            const embed = new EmbedBuilder()
                .setTitle('Game Nomination')
                .setDescription(`${interaction.user.username} has nominated a game for next month's challenge:`)
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
            return interaction.editReply('An error occurred while processing your nomination. Please try again.');
        }
    }
};