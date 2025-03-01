import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('startvoting')
        .setDescription('Start a voting poll for next month\'s challenge')
        .addChannelOption(option =>
            option.setName('channel')
            .setDescription('The channel to create the poll in')
            .setRequired(true)),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            // Get all users
            const users = await User.find({});

            // Get all current nominations
            let allNominations = [];
            for (const user of users) {
                const nominations = user.getCurrentNominations();
                allNominations.push(...nominations.map(nom => nom.gameId));
            }

            // Remove duplicates
            allNominations = [...new Set(allNominations)];

            if (allNominations.length === 0) {
                return interaction.editReply('No games have been nominated for next month.');
            }

            // Randomly select 10 games (or less if there aren't enough nominations)
            const selectedCount = Math.min(10, allNominations.length);
            const selectedGames = [];
            while (selectedGames.length < selectedCount) {
                const randomIndex = Math.floor(Math.random() * allNominations.length);
                const gameId = allNominations[randomIndex];
                if (!selectedGames.includes(gameId)) {
                    selectedGames.push(gameId);
                }
            }

            // Get game info for all selected games
            const gameInfoPromises = selectedGames.map(gameId => retroAPI.getGameInfoExtended(gameId));
            const games = await Promise.all(gameInfoPromises);

            // Create embed for the poll
            const embed = new EmbedBuilder()
                .setTitle('🎮 Vote for Next Month\'s Challenge!')
                .setDescription('React with the corresponding number to vote for a game. You can vote for up to two games!\n\n' +
                    games.map((game, index) => 
                        `${index + 1} **[${game.title}](https://retroachievements.org/game/${game.id})**`
                    ).join('\n\n'))
                .setColor('#FF69B4')
                .setFooter({ text: 'Voting ends in 7 days' });

            // Get the specified channel
            const channel = interaction.options.getChannel('channel');
            const pollMessage = await channel.send({ embeds: [embed] });

            // Add number reactions
            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            for (let i = 0; i < selectedGames.length; i++) {
                await pollMessage.react(numberEmojis[i]);
            }

            // Clear all nominations for the current month
            // for (const user of users) {
            //     user.clearCurrentNominations();
            //     await user.save();
            // }

            return interaction.editReply('Voting poll has been created! The poll will be active for 7 days.');

        } catch (error) {
            console.error('Error starting voting:', error);
            return interaction.editReply('An error occurred while starting the voting process. Please try again.');
        }
    }
};