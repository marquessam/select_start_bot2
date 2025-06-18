import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';

const FIELD_CHARACTER_LIMIT = 1024;
const MAX_EMBED_FIELDS = 25;
const GAMES_PER_PAGE = 15; // Reduced to ensure we don't hit field limits

export default {
    data: new SlashCommandBuilder()
        .setName('nominations')
        .setDescription('Show all current nominations for the next monthly challenge'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

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

            // Create paginated embeds
            const pages = this.createPaginatedEmbeds(gamesByConsole, sortedConsoles, allNominations.length, uniqueGameIds.length);

            if (pages.length === 1) {
                // Single page, no pagination needed
                return interaction.editReply({ embeds: [pages[0]] });
            } else {
                // Multiple pages, add pagination
                const components = this.createPaginationButtons(0, pages.length);
                
                // Store pages in interaction for pagination
                interaction.nominationPages = pages;
                interaction.currentPage = 0;
                
                return interaction.editReply({ 
                    embeds: [pages[0]], 
                    components: components 
                });
            }

        } catch (error) {
            console.error('Error displaying nominations:', error);
            return interaction.editReply('An error occurred while fetching nominations. Please try again.');
        }
    },

    /**
     * Create paginated embeds to handle large numbers of nominations
     */
    createPaginatedEmbeds(gamesByConsole, sortedConsoles, totalNominations, uniqueGames) {
        const pages = [];
        let currentEmbed = this.createBaseEmbed(totalNominations, uniqueGames, 1, 1);
        let currentFieldCount = 0;
        let currentPageConsoles = [];

        for (const console of sortedConsoles) {
            const consoleGames = gamesByConsole[console];
            const consoleFields = this.createConsoleFields(console, consoleGames);

            // Check if adding this console's fields would exceed limits
            if (currentFieldCount + consoleFields.length > MAX_EMBED_FIELDS - 1 || // -1 for footer space
                currentFieldCount > 0 && currentFieldCount + consoleFields.length > 20) { // Leave some buffer
                
                // Finalize current page
                pages.push(currentEmbed);
                
                // Start new page
                currentEmbed = this.createBaseEmbed(totalNominations, uniqueGames, pages.length + 1, 0); // Will update total later
                currentFieldCount = 0;
                currentPageConsoles = [];
            }

            // Add console fields to current embed
            consoleFields.forEach(field => {
                currentEmbed.addFields(field);
                currentFieldCount++;
            });
            
            currentPageConsoles.push(console);
        }

        // Add the last page
        if (currentFieldCount > 0) {
            pages.push(currentEmbed);
        }

        // Update page numbers in embeds
        pages.forEach((embed, index) => {
            const footerText = `Total nominations: ${totalNominations} | Unique games: ${uniqueGames} | Page ${index + 1}/${pages.length}`;
            embed.setFooter({ text: footerText });
        });

        return pages;
    },

    /**
     * Create base embed structure
     */
    createBaseEmbed(totalNominations, uniqueGames, pageNum, totalPages) {
        return new EmbedBuilder()
            .setTitle('🎮 Current Nominations')
            .setDescription(`Games nominated for next month's challenge:`)
            .setColor('#00BFFF')
            .setTimestamp();
    },

    /**
     * Create fields for a console, splitting if necessary to stay under character limits
     */
    createConsoleFields(console, consoleGames) {
        const fields = [];
        let currentFieldText = '';
        let fieldIndex = 1;

        for (const game of consoleGames) {
            const nominationInfo = game.nominations;
            const gameText = `**${game.title}** (${nominationInfo.count} nomination${nominationInfo.count > 1 ? 's' : ''})\n` +
                           `Achievements: ${game.achievements}\n` +
                           `Nominated by: ${nominationInfo.nominatedBy.join(', ')}\n` +
                           `[View Game](https://retroachievements.org/game/${game.id})\n\n`;

            // Check if adding this game would exceed the character limit
            if (currentFieldText.length + gameText.length > FIELD_CHARACTER_LIMIT) {
                // Add current field and start a new one
                if (currentFieldText.length > 0) {
                    const fieldName = fieldIndex === 1 ? 
                        `▫️ ${console}` : 
                        `▫️ ${console} (continued ${fieldIndex})`;
                    
                    fields.push({
                        name: fieldName,
                        value: currentFieldText.trim()
                    });
                    
                    fieldIndex++;
                    currentFieldText = '';
                }
            }

            currentFieldText += gameText;
        }

        // Add the final field for this console
        if (currentFieldText.length > 0) {
            const fieldName = fieldIndex === 1 ? 
                `▫️ ${console}` : 
                `▫️ ${console} (continued ${fieldIndex})`;
            
            fields.push({
                name: fieldName,
                value: currentFieldText.trim()
            });
        }

        return fields;
    },

    /**
     * Create pagination buttons
     */
    createPaginationButtons(currentPage, totalPages) {
        const row = new ActionRowBuilder();

        // Previous button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('nominations_prev')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
                .setDisabled(currentPage === 0)
        );

        // Page indicator
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('nominations_page_info')
                .setLabel(`${currentPage + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        // Next button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('nominations_next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('➡️')
                .setDisabled(currentPage === totalPages - 1)
        );

        return [row];
    },

    /**
     * Handle pagination button interactions
     */
    async handlePaginationInteraction(interaction) {
        if (!interaction.nominationPages) {
            return interaction.reply({
                content: 'Pagination data not found. Please run the command again.',
                ephemeral: true
            });
        }

        const { customId } = interaction;
        let newPage = interaction.currentPage;

        if (customId === 'nominations_prev' && newPage > 0) {
            newPage--;
        } else if (customId === 'nominations_next' && newPage < interaction.nominationPages.length - 1) {
            newPage++;
        } else {
            return interaction.deferUpdate();
        }

        interaction.currentPage = newPage;
        const components = this.createPaginationButtons(newPage, interaction.nominationPages.length);

        await interaction.update({
            embeds: [interaction.nominationPages[newPage]],
            components: components
        });
    }
};
