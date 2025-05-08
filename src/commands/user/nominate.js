import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get nominations channel ID from .env
const NOMINATIONS_CHANNEL_ID = process.env.NOMINATIONS_CHANNEL;

export default {
    data: new SlashCommandBuilder()
        .setName('nominations')
        .setDescription('Show all current nominations for the next monthly challenge'),

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

        // Command used in correct channel - defer reply without ephemeral flag
        await interaction.deferReply({ ephemeral: false });

        try {
            // Get all users
            const users = await User.find({});

            // Get all current nominations
            let allNominations = [];
            for (const user of users) {
                const nominations = user.getCurrentNominations();
                allNominations.push(...nominations.map(nom => ({
                    gameId: nom.gameId,
                    nominatedBy: user.raUsername,
                    nominatedAt: nom.nominatedAt
                })));
            }

            if (allNominations.length === 0) {
                return interaction.editReply('No games have been nominated for next month yet.');
            }

            // Count nominations per game
            const nominationCounts = {};
            allNominations.forEach(nom => {
                if (!nominationCounts[nom.gameId]) {
                    nominationCounts[nom.gameId] = {
                        count: 0,
                        nominatedBy: []
                    };
                }
                nominationCounts[nom.gameId].count++;
                nominationCounts[nom.gameId].nominatedBy.push(nom.nominatedBy);
            });

            // Get unique game IDs
            const uniqueGameIds = [...new Set(allNominations.map(nom => nom.gameId))];

            // Get game info for all nominated games
            const gameDetailsPromises = uniqueGameIds.map(async (gameId) => {
                const gameInfo = await retroAPI.getGameInfo(gameId);
                const gameAchievementCount = await retroAPI.getGameAchievementCount(gameId);
                return {
                    id: gameId,
                    title: gameInfo.title,
                    console: gameInfo.consoleName,
                    achievements: gameAchievementCount,
                    nominations: nominationCounts[gameId]
                };
            });

            const gameDetails = await Promise.all(gameDetailsPromises);

            // Group games by console
            const gamesByConsole = {};
            gameDetails.forEach(game => {
                if (!gamesByConsole[game.console]) {
                    gamesByConsole[game.console] = [];
                }
                gamesByConsole[game.console].push(game);
            });

            // Sort consoles alphabetically
            const sortedConsoles = Object.keys(gamesByConsole).sort();

            // Sort games alphabetically within each console
            sortedConsoles.forEach(console => {
                gamesByConsole[console].sort((a, b) => a.title.localeCompare(b.title));
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🎮 Current Nominations')
                .setDescription(`Games nominated for next month's challenge:`)
                .setColor('#00BFFF')
                .setTimestamp();

            // Add fields for each console and its games
            for (const console of sortedConsoles) {
                const consoleGames = gamesByConsole[console];
                let gamesText = '';
                
                for (const game of consoleGames) {
                    const nominationInfo = game.nominations;
                    gamesText += `**${game.title}** (${nominationInfo.count} nomination${nominationInfo.count > 1 ? 's' : ''})\n` +
                                `Achievements: ${game.achievements}\n` +
                                `Nominated by: ${nominationInfo.nominatedBy.join(', ')}\n` +
                                `[View Game](https://retroachievements.org/game/${game.id})\n\n`;
                }
                
                embed.addFields({
                    name: `▫️ ${console}`,
                    value: gamesText
                });
            }

            // Add footer with total count
            embed.setFooter({ 
                text: `Total nominations: ${allNominations.length} | Unique games: ${uniqueGameIds.length}`
            });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error displaying nominations:', error);
            return interaction.editReply('An error occurred while fetching nominations. Please try again.');
        }
    }
};
