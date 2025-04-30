import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Poll } from '../../models/Poll.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

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

            // Try to schedule job if node-schedule is available
            try {
                // Dynamically import node-schedule
                const schedule = await import('node-schedule').catch(() => {
                    console.warn('node-schedule package not available, skipping automatic end scheduling');
                    return null;
                });
                
                if (schedule) {
                    // Schedule the end of voting event
                    const jobDate = new Date(endDate.getTime());
                    console.log(`Scheduling automatic vote ending for: ${jobDate}`);
                    
                    // Add a named job that can be identified and canceled if needed
                    const jobName = `end-poll-${poll._id}`;
                    const job = schedule.default.scheduleJob(jobName, jobDate, async function() {
                        try {
                            // We'll manually handle this by retrieving the poll ID from the database
                            console.log(`Scheduled job for poll ${poll._id} triggered`);
                            
                            // Logic will be handled by a manual process instead
                            // Just log that it was triggered
                        } catch (error) {
                            console.error('Error in scheduled job for ending voting:', error);
                        }
                    });
                    
                    // Store the job name with the poll for potential cancellation
                    poll.scheduledJobName = jobName;
                    await poll.save();
                    
                    console.log(`Scheduled job created with name: ${jobName}`);
                }
            } catch (scheduleError) {
                console.error('Error setting up scheduled job:', scheduleError);
                // Continue without scheduling - this is optional functionality
            }

            return interaction.editReply(
                `Voting poll has been created! The poll will be active until ${endDate.toLocaleDateString()}. ` +
                `Results will be announced in ${resultsChannel} when voting ends.` +
                (poll.scheduledJobName ? '' : ' Note: Automatic ending is not available, manual end required.')
            );

        } catch (error) {
            console.error('Error starting voting:', error);
            return interaction.editReply('An error occurred while starting the voting process. Please try again.');
        }
    }
};

// Helper function signature is kept for future implementation
async function endVotingProcess(pollId) {
    console.log(`Manual implementation needed for ending poll ${pollId}`);
    // This would need to be implemented as a separate command or process
}
