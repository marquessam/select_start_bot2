import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nominations')
        .setDescription('Show all current nominations for the next monthly challenge'),

    async execute(interaction) {
        await interaction.deferReply();

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
            //const gameInfoPromises = uniqueGameIds.map(gameId => retroAPI.getGameInfo(gameId));
            //const gamesInfo = await Promise.all(gameInfoPromises);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🎮 Current Nominations')
                .setDescription(`Games nominated for next month's challenge:`)
                .setColor('#00BFFF')
                .setTimestamp();

            // Sort games by nomination count (descending)
            const sortedGames = uniqueGameIds.sort((a, b) => 
                nominationCounts[b].count - nominationCounts[a].count
            );

            // Add fields for each game
            for (const gameId of sortedGames) {
                const gameInfo = await retroAPI.getGameInfo(gameId);
                const gameAchievementCount = await retroAPI.getGameAchievementCount(gameId);
                const nominations = nominationCounts[gameId];
                if (nominations && nominations.count > 0) {
                    embed.addFields({
                        name: `${gameInfo.title} (${nominations.count} nomination${nominations.count > 1 ? 's' : ''})`,
                        value: `Achievements: ${gameAchievementCount}\n` +
                               `Nominated by: ${nominations.nominatedBy.join(', ')}\n` +
                               `[View Game](https://retroachievements.org/game/${gameId})`
                    });
                }
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
