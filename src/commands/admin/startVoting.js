import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Poll } from '../../models/Poll.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';
import schedule from 'node-schedule';

export default {
    data: new SlashCommandBuilder()
        .setName('startvoting')
        .setDescription('Start a voting poll for next month\'s challenge')
        .addChannelOption(option =>
            option.setName('channel')
            .setDescription('The channel to create the poll announcement in')
            .setRequired(true))
        .addChannelOption(option =>
            option.setName('results_channel')
            .setDescription('The channel to announce results in (defaults to same channel)')
            .setRequired(false)),

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
            // Check if there's already an active poll
            const existingPoll = await Poll.findActivePoll();
            if (existingPoll) {
                return interaction.editReply('There is already an active voting poll. You must wait for it to end or cancel it first.');
            }

            // Calculate start and end dates
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            // Calculate the last day of the current month
            const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
            
            // Set end date to 24 hours before the end of the month
            const endDate = new Date(lastDayOfMonth);
            endDate.setDate(endDate.getDate() - 1);
            
            // If we're already within 8 days of the end of the month, move to next month
            const startDate = new Date();
            if ((lastDayOfMonth - now) / (1000 * 60 * 60 * 24) < 8) {
                console.log("Less than 8 days left in month, scheduling for next month");
                const nextMonth = (currentMonth + 1) % 12;
                const yearForNextMonth = nextMonth === 0 ? currentYear + 1 : currentYear;
                
                // Set end date to 24 hours before the end of next month
                const lastDayOfNextMonth = new Date(yearForNextMonth, nextMonth + 1, 0);
                endDate.setTime(lastDayOfNextMonth.getTime());
                endDate.setDate(endDate.getDate() - 1);
            }
            
            // Set start date to 8 days before the end date
            startDate.setTime(endDate.getTime());
            startDate.setDate(startDate.getDate() - 7);
            
            // If start date is in the future, inform admin and do not start yet
            if (startDate > now) {
                return interaction.editReply(
                    `Voting should start on ${startDate.toLocaleDateString()} ` +
                    `(8 days before the end of the month) and end on ${endDate.toLocaleDateString()} ` +
                    `(24 hours before the end of the month). Please try again on the start date.`
                );
            }

            // Get all users
            const users = await User.find({});

            // Get all current nominations
            let allNominations = [];
            for (const user of users) {
                const nominations = user.getCurrentNominations();
                allNominations.push(...nominations.map(nom => ({
                    gameId: nom.gameId,
                    title: nom.gameTitle,
                    consoleName: nom.consoleName
                })));
            }

            // Remove duplicates by gameId
            const uniqueNominations = Array.from(
                new Map(allNominations.map(item => [item.gameId, item])).values()
            );

            if (uniqueNominations.length === 0) {
                return interaction.editReply('No games have been nominated for next month.');
            }

            // Randomly select 10 games (or less if there aren't enough nominations)
            const selectedCount = Math.min(10, uniqueNominations.length);
            const selectedGames = [];
            const selectedIndices = new Set();
            
            while (selectedGames.length < selectedCount) {
                const randomIndex = Math.floor(Math.random() * uniqueNominations.length);
                
                if (!selectedIndices.has(randomIndex)) {
                    selectedIndices.add(randomIndex);
                    const game = uniqueNominations[randomIndex];
                    
                    // Get extended game info to get the image icon
                    try {
                        const gameInfo = await retroAPI.getGameInfoExtended(game.gameId);
                        selectedGames.push({
                            gameId: game.gameId,
                            title: game.title,
                            consoleName: game.consoleName,
                            imageIcon: gameInfo.imageIcon || null
                        });
                    } catch (error) {
                        console.error(`Error getting extended game info for ${game.title}:`, error);
                        // Add without the image if we can't get extended info
                        selectedGames.push({
                            gameId: game.gameId,
                            title: game.title,
                            consoleName: game.consoleName,
                            imageIcon: null
                        });
                    }
                }
            }

            // Create embed for the poll announcement
            const embed = new EmbedBuilder()
                .setTitle('🎮 Monthly Challenge Voting Started!')
                .setDescription(
                    `Voting for next month's challenge has begun! The following games have been nominated:\n\n` +
                    selectedGames.map((game, index) => 
                        `**${index + 1}. [${game.title}](https://retroachievements.org/game/${game.gameId})** (${game.consoleName})`
                    ).join('\n\n') +
                    `\n\n**How to vote:**\n` +
                    `Use the \`/vote\` command to cast up to two votes for your favorite games!\n` +
                    `Example: \`/vote first:1 second:3\` to vote for games #1 and #3\n\n` +
                    `Voting ends <t:${Math.floor(endDate.getTime() / 1000)}:R>`
                )
                .setColor('#FF69B4')
                .setFooter({ text: `Voting ends ${endDate.toLocaleDateString()}` });

            // Get the specified channel
            const channel = interaction.options.getChannel('channel');
            const resultsChannel = interaction.options.getChannel('results_channel') || channel;
            const pollMessage = await channel.send({ embeds: [embed] });

            // Create the poll in the database
            const poll = new Poll({
                messageId: pollMessage.id,
                channelId: channel.id,
                resultsChannelId: resultsChannel.id, // Store results channel ID
                selectedGames: selectedGames,
                endDate: endDate
            });

            await poll.save();

            // Schedule the end of voting event
            const jobDate = new Date(endDate.getTime());
            console.log(`Scheduling automatic vote ending for: ${jobDate}`);
            
            // Add a named job that can be identified and canceled if needed
            const jobName = `end-poll-${poll._id}`;
            const job = schedule.scheduleJob(jobName, jobDate, async function() {
                try {
                    // Retrieve fresh data instead of using closure variables
                    await endVotingProcess(poll._id.toString());
                } catch (error) {
                    console.error('Error in scheduled job for ending voting:', error);
                }
            });

            // Store the job name with the poll for potential cancellation
            poll.scheduledJobName = jobName;
            await poll.save();

            return interaction.editReply(
                `Voting poll has been created! The poll will be active until ${endDate.toLocaleDateString()}. ` +
                `Results will be automatically announced in ${resultsChannel} when voting ends.`
            );

        } catch (error) {
            console.error('Error starting voting:', error);
            return interaction.editReply('An error occurred while starting the voting process. Please try again.');
        }
    }
};

// Function to handle the end of voting process - separated for cleaner code
async function endVotingProcess(pollId) {
    try {
        console.log(`Processing end of voting for poll ${pollId}`);
        
        // Get the poll with fresh data
        const poll = await Poll.findById(pollId);
        if (!poll || poll.isProcessed) {
            console.log('Poll not found or already processed');
            return;
        }

        // Process the results
        const winner = poll.processResults();
        if (!winner) {
            console.log('No votes were recorded for this poll');
            return;
        }

        // Save the processed poll
        poll.isProcessed = true;
        await poll.save();

        // Import required Discord.js components
        const { Client, GatewayIntentBits, EmbedBuilder } = await import('discord.js');
        
        // Create a temporary client just for this announcement
        const client = new Client({ 
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ] 
        });

        // Login with bot token
        await client.login(process.env.DISCORD_TOKEN);
        
        // Wait for client to be ready
        await new Promise(resolve => {
            if (client.isReady()) resolve();
            else client.once('ready', resolve);
        });

        // Get vote counts for display
        const results = poll.getVoteCounts();
        
        // Get the channels
        const pollChannel = await client.channels.fetch(poll.channelId);
        const resultsChannel = await client.channels.fetch(poll.resultsChannelId || poll.channelId);
        
        if (!pollChannel || !resultsChannel) {
            console.error('Could not find poll or results channel');
            await client.destroy();
            return;
        }

        // Create a results announcement
        const resultsEmbed = new EmbedBuilder()
            .setTitle('🏆 Monthly Challenge Voting Results!')
            .setDescription(
                `The voting for next month's challenge has ended!\n\n` +
                `**🎉 The winner is: [${winner.title}](https://retroachievements.org/game/${winner.gameId})!**\n\n` +
                `This game will be our next monthly challenge. Get ready to play!`
            )
            .setColor('#FFD700')
            .setThumbnail(winner.imageIcon ? `https://retroachievements.org${winner.imageIcon}` : null)
            .addFields([
                {
                    name: 'Final Vote Tally',
                    value: results.map((result, index) => 
                        `${index + 1}. **${result.title}**: ${result.votes} vote${result.votes !== 1 ? 's' : ''}`
                    ).join('\n')
                }
            ])
            .setFooter({ text: 'Thank you to everyone who voted!' })
            .setTimestamp();

        // Send the results
        await resultsChannel.send({ embeds: [resultsEmbed] });

        // Update the original poll message
        try {
            const pollMessage = await pollChannel.messages.fetch(poll.messageId);
            
            if (pollMessage) {
                const updatedEmbed = new EmbedBuilder()
                    .setTitle('🎮 Monthly Challenge Voting (CLOSED)')
                    .setDescription(
                        `Voting for next month's challenge has ended!\n\n` +
                        `The winner is: **[${winner.title}](https://retroachievements.org/game/${winner.gameId})**\n\n` +
                        `See the full results in ${resultsChannel}.`
                    )
                    .setColor('#808080') // Gray to indicate it's closed
                    .setFooter({ text: 'Voting has ended' });
                
                await pollMessage.edit({ embeds: [updatedEmbed] });
            }
        } catch (error) {
            console.error('Error updating original poll message:', error);
        }

        // Clear all nominations
        try {
            // Process in smaller batches to avoid timeouts
            const batchSize = 10;
            const users = await User.find({});
            
            for (let i = 0; i < users.length; i += batchSize) {
                const batch = users.slice(i, i + batchSize);
                await Promise.all(batch.map(async (user) => {
                    user.clearCurrentNominations();
                    await user.save();
                }));
            }
            
            console.log('All nominations cleared successfully');
        } catch (error) {
            console.error('Error clearing nominations:', error);
        }
        
        console.log('Voting ended automatically, results announced, and nominations cleared');
        
        // Clean up the client
        await client.destroy();
        
    } catch (error) {
        console.error('Error in endVotingProcess:', error);
    }
}
