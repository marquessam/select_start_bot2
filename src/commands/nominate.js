// File: src/commands/nominate.js
const { MessageCollector, EmbedBuilder } = require('discord.js');
const Nomination = require('../models/Nomination');

// Maximum nominations allowed for the current month per user
const MAX_NOMINATIONS_PER_MONTH = 3;

function getCurrentMonth() {
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
}

module.exports = {
    name: 'nominate',
    description: 'Nominate a game for the monthly vote',
    async execute(message, args) {
        try {
            const currentMonth = getCurrentMonth();
            const userId = message.author.id;

            // If no args, show current nominations
            if (!args.length) {
                const nominations = await Nomination.find({ userId, voteMonth: currentMonth });
                if (nominations.length === 0) {
                    return message.reply('You have not nominated any games for this month yet. Use `!nominate <game name>` to nominate a game.');
                }
                
                let output = `**Your Nominations for ${currentMonth}:**\n\n`;
                nominations.forEach((nom, index) => {
                    output += `${index + 1}. ${nom.gameTitle}`;
                    if (nom.platform) output += ` (${nom.platform})`;
                    output += `\n`;
                });
                return message.channel.send(output);
            }

            // Check nomination limit
            const existingNominations = await Nomination.find({ userId, voteMonth: currentMonth });
            if (existingNominations.length >= MAX_NOMINATIONS_PER_MONTH) {
                return message.reply(`You have already nominated ${MAX_NOMINATIONS_PER_MONTH} game(s) this month. You cannot nominate more until next month.`);
            }

            const searchQuery = args.join(' ');
            const loadingMsg = await message.channel.send('Searching for games...');

            // Search RetroAchievements
            const searchResults = await message.client.raAPI('API_GetGameList.php', {
                f: searchQuery,
                h: 1
            });

            await loadingMsg.delete();

            if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
                return message.reply('No games found matching your query. Please try a different game name.');
            }

            // Take top 5 candidates
            const candidates = searchResults.slice(0, 5);

            const embed = new EmbedBuilder()
                .setTitle('Nomination Candidates')
                .setDescription(
                    'Please choose the correct game by typing the corresponding number (1-' + 
                    candidates.length + '):\n\n' +
                    candidates.map((game, index) => 
                        `**${index + 1}.** ${game.Title} (${game.ConsoleName})`
                    ).join('\n')
                )
                .setFooter({ text: 'Enter your choice within 60 seconds.' })
                .setColor('#0099ff');

            await message.channel.send({ embeds: [embed] });

            // Wait for response
            const filter = m => m.author.id === message.author.id;
            const collector = new MessageCollector(message.channel, { 
                filter, 
                time: 60000,
                max: 1
            });

            collector.on('collect', async collected => {
                const choice = parseInt(collected.content, 10);
                if (isNaN(choice) || choice < 1 || choice > candidates.length) {
                    return message.reply('Invalid selection. Nomination cancelled.');
                }

                const selectedGame = candidates[choice - 1];

                const nomination = new Nomination({
                    userId,
                    gameTitle: selectedGame.Title,
                    gameId: selectedGame.ID,
                    platform: selectedGame.ConsoleName,
                    nominatedBy: message.author.username,
                    voteMonth: currentMonth
                });

                await nomination.save();
                message.reply(`Your nomination for **${selectedGame.Title}** has been recorded for ${currentMonth}. Thank you!`);
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    message.reply('No response received. Nomination cancelled.');
                }
            });

        } catch (error) {
            console.error('Nomination error:', error);
            message.reply('There was an error processing your nomination. Please try again later.');
        }
    }
};
