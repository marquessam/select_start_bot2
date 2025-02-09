// File: src/commands/help.js
const { EmbedBuilder } = require('discord.js');

const commands = [
    {
        name: 'profile',
        syntax: '!profile [username]',
        description: 'Shows your achievement progress, points, and awards. Optionally view another user\'s profile by providing their username.',
        category: 'Stats'
    },
    {
        name: 'leaderboard',
        syntax: '!leaderboard [month/m | year/y]',
        description: 'View the monthly or yearly leaderboards. Shows points, achievements, and rankings.',
        category: 'Stats'
    },
    {
        name: 'challenge',
        syntax: '!challenge [monthly | shadow]',
        description: 'Displays information about the current monthly or shadow game challenge, including requirements and point values.',
        category: 'Challenges'
    },
    {
        name: 'rules',
        syntax: '!rules [category]',
        description: 'Shows community rules and challenge information. Categories: monthly, shadow, points, community',
        category: 'Info'
    },
    {
        name: 'arcade',
        syntax: '!arcade [number]',
        description: 'View high scores for various arcade-style challenges. Shows top scores from registered users.',
        category: 'Arcade'
    },
    {
        name: 'search',
        syntax: '!search <game name/id>',
        description: 'Search for a game on RetroAchievements and view its information.',
        category: 'Info'
    },
    {
        name: 'nominate',
        syntax: '!nominate <game name>',
        description: 'Nominate a game for future monthly challenges. Limited to 3 nominations per month.',
        category: 'Challenges'
    },
    {
        name: 'nominations',
        syntax: '!nominations',
        description: 'View all current game nominations for future challenges.',
        category: 'Challenges'
    }
];

// Mapping of category names to their corresponding emojis
const categoryEmojis = {
    'Stats': '📊',
    'Challenges': '⚔️',
    'Info': 'ℹ️',
    'Arcade': '🕹️'
};

module.exports = {
    name: 'help',
    description: 'Shows all available commands and their usage',
    async execute(message, args) {
        try {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Available Commands')
                .setDescription('Here are all the commands you can use:')
                .setFooter({ text: 'Tip: Use !help to see this message again' });

            // Group commands by category.
            const categories = {};
            commands.forEach(cmd => {
                if (!categories[cmd.category]) {
                    categories[cmd.category] = [];
                }
                categories[cmd.category].push(cmd);
            });

            // Add each category as a field using our emoji mapping.
            for (const [category, categoryCommands] of Object.entries(categories)) {
                let fieldText = '';
                categoryCommands.forEach(cmd => {
                    fieldText += `**${cmd.syntax}**\n`;
                    fieldText += `   ${cmd.description}\n\n`;
                });
                // Use the mapped emoji (or empty string if not found) with the category name.
                const emoji = categoryEmojis[category] || '';
                embed.addFields({ name: `${emoji} ${category}`, value: fieldText });
            }

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in help command:', error);
            await message.reply('There was an error displaying the help information.');
        }
    }
};
