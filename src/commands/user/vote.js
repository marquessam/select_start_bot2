import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Poll } from '../../models/Poll.js'; // Import the Poll model

export default {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for next month\'s challenge game')
        .addStringOption(option =>
            option.setName('first')
            .setDescription('Your first choice game (1-10)')
            .setRequired(true)
            .setChoices(
                { name: '1', value: '1' },
                { name: '2', value: '2' },
                { name: '3', value: '3' },
                { name: '4', value: '4' },
                { name: '5', value: '5' },
                { name: '6', value: '6' },
                { name: '7', value: '7' },
                { name: '8', value: '8' },
                { name: '9', value: '9' },
                { name: '10', value: '10' }
            ))
        .addStringOption(option =>
            option.setName('second')
            .setDescription('Your second choice game (1-10, different from first)')
            .setRequired(false) // Optional second vote
            .setChoices(
                { name: '1', value: '1' },
                { name: '2', value: '2' },
                { name: '3', value: '3' },
                { name: '4', value: '4' },
                { name: '5', value: '5' },
                { name: '6', value: '6' },
                { name: '7', value: '7' },
                { name: '8', value: '8' },
                { name: '9', value: '9' },
                { name: '10', value: '10' }
            )),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Find the user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You are not registered. Please ask an admin to register you first.');
            }

            // Get the active poll
            const activePoll = await Poll.findActivePoll();
            if (!activePoll) {
                return interaction.editReply('There is no active voting poll right now. Check back later!');
            }

            // Check if user has already voted
            if (activePoll.hasUserVoted(interaction.user.id)) {
                // Show results since they already voted
                const results = activePoll.getVoteCounts();
                
                const voteResultsEmbed = new EmbedBuilder()
                    .setTitle('Current Voting Results')
                    .setDescription('You have already voted. Here are the current results.\n\n⚠️ **Please do not share these results with others who haven\'t voted yet!**')
                    .setColor('#FF69B4')
                    .addFields(
                        results.map(result => ({
                            name: `${result.title} (${result.consoleName})`,
                            value: `${result.votes} vote${result.votes !== 1 ? 's' : ''}`
                        }))
                    )
                    .setFooter({ text: `Voting ends on ${activePoll.endDate.toDateString()}` });
                
                return interaction.editReply({ embeds: [voteResultsEmbed] });
            }

            // Get their votes
            const firstChoice = interaction.options.getString('first');
            const secondChoice = interaction.options.getString('second');

            // Validate votes
            if (firstChoice === secondChoice && secondChoice) {
                return interaction.editReply('You cannot vote for the same game twice. Please choose different games for your votes.');
            }

            // Convert choices to gameIds (index in the array is choice-1)
            const votes = [];
            
            if (firstChoice && firstChoice > 0 && firstChoice <= activePoll.selectedGames.length) {
                const firstGameIndex = parseInt(firstChoice) - 1;
                votes.push(activePoll.selectedGames[firstGameIndex].gameId);
            }
            
            if (secondChoice && secondChoice > 0 && secondChoice <= activePoll.selectedGames.length) {
                const secondGameIndex = parseInt(secondChoice) - 1;
                votes.push(activePoll.selectedGames[secondGameIndex].gameId);
            }

            if (votes.length === 0) {
                return interaction.editReply('Invalid vote choices. Please select valid games from the list.');
            }

            // Record the vote
            activePoll.addVote(interaction.user.id, votes);
            await activePoll.save();

            // Prepare confirmation message
            const selectedGames = votes.map(gameId => {
                const game = activePoll.selectedGames.find(g => g.gameId === gameId);
                return `${game.title} (${game.consoleName})`;
            });

            const confirmationEmbed = new EmbedBuilder()
                .setTitle('Vote Recorded!')
                .setDescription('Your vote for next month\'s challenge has been recorded.')
                .setColor('#00FF00')
                .addFields(
                    { 
                        name: 'Your Votes', 
                        value: selectedGames.join('\n') 
                    }
                )
                .setFooter({ text: 'Use /vote again to see current results' });

            await interaction.editReply({ embeds: [confirmationEmbed] });

            // Now show them the results in a follow-up message
            const results = activePoll.getVoteCounts();
            
            const voteResultsEmbed = new EmbedBuilder()
                .setTitle('Current Voting Results')
                .setDescription('Thank you for voting! Here are the current results.\n\n⚠️ **Please do not share these results with others who haven\'t voted yet!**')
                .setColor('#FF69B4')
                .addFields(
                    results.map(result => ({
                        name: `${result.title} (${result.consoleName})`,
                        value: `${result.votes} vote${result.votes !== 1 ? 's' : ''}`
                    }))
                )
                .setFooter({ text: `Voting ends on ${activePoll.endDate.toDateString()}` });
            
            return interaction.followUp({ embeds: [voteResultsEmbed], ephemeral: true });

        } catch (error) {
            console.error('Error processing vote:', error);
            return interaction.editReply('An error occurred while processing your vote. Please try again later.');
        }
    }
};
