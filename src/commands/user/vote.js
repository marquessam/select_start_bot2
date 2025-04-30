import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Poll } from '../../models/Poll.js';

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
            let activePoll;
            try {
                activePoll = await Poll.findActivePoll();
            } catch (error) {
                console.error('Error finding active poll:', error);
                return interaction.editReply('An error occurred when looking for an active poll. Please try again later.');
            }
            
            if (!activePoll) {
                return interaction.editReply('There is no active voting poll right now. Check back later!');
            }

            // Check if user has already voted
            let hasVoted = false;
            try {
                hasVoted = activePoll.hasUserVoted(interaction.user.id);
            } catch (error) {
                console.error('Error checking if user has voted:', error);
                return interaction.editReply('An error occurred when checking your vote status. Please try again later.');
            }
            
            if (hasVoted) {
                try {
                    // Show results since they already voted
                    const results = activePoll.getVoteCounts();
                    
                    const voteResultsEmbed = new EmbedBuilder()
                        .setTitle('Current Voting Results')
                        .setDescription('You have already voted. Here are the current results.\n\n⚠️ **Please do not share these results with others who haven\'t voted yet!**')
                        .setColor('#FF69B4')
                        .setFooter({ text: `Voting ends on ${activePoll.endDate.toDateString()}` });
                    
                    // Add results fields, handling potential missing values safely
                    if (results && Array.isArray(results) && results.length > 0) {
                        const resultsFields = results.map((result, index) => ({
                            name: `${result.title || `Game ${index+1}`} ${result.consoleName ? `(${result.consoleName})` : ''}`,
                            value: `${result.votes || 0} vote${result.votes !== 1 ? 's' : ''}`
                        }));
                        
                        voteResultsEmbed.addFields(resultsFields);
                    } else {
                        voteResultsEmbed.addFields({ 
                            name: 'No votes yet', 
                            value: 'No one has voted yet!' 
                        });
                    }
                    
                    return interaction.editReply({ embeds: [voteResultsEmbed] });
                } catch (error) {
                    console.error('Error showing vote results:', error);
                    return interaction.editReply('You have already voted in this poll. Unable to show current results due to an error.');
                }
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
            
            try {
                if (firstChoice && parseInt(firstChoice) > 0 && parseInt(firstChoice) <= activePoll.selectedGames.length) {
                    const firstGameIndex = parseInt(firstChoice) - 1;
                    if (activePoll.selectedGames[firstGameIndex] && activePoll.selectedGames[firstGameIndex].gameId) {
                        votes.push(activePoll.selectedGames[firstGameIndex].gameId);
                    }
                }
                
                if (secondChoice && parseInt(secondChoice) > 0 && parseInt(secondChoice) <= activePoll.selectedGames.length) {
                    const secondGameIndex = parseInt(secondChoice) - 1;
                    if (activePoll.selectedGames[secondGameIndex] && activePoll.selectedGames[secondGameIndex].gameId) {
                        votes.push(activePoll.selectedGames[secondGameIndex].gameId);
                    }
                }
            } catch (error) {
                console.error('Error processing vote choices:', error);
                return interaction.editReply('An error occurred when processing your vote. Please try again.');
            }

            if (votes.length === 0) {
                return interaction.editReply('Invalid vote choices. Please select valid games from the list.');
            }

            // Record the vote
            try {
                activePoll.addVote(interaction.user.id, votes);
                await activePoll.save();
            } catch (error) {
                console.error('Error saving vote:', error);
                return interaction.editReply('An error occurred when recording your vote. Please try again later.');
            }

            // Prepare confirmation message
            const selectedGames = votes.map(gameId => {
                const game = activePoll.selectedGames.find(g => g.gameId === gameId);
                return game ? `${game.title} ${game.consoleName ? `(${game.consoleName})` : ''}` : 'Unknown game';
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
            try {
                const results = activePoll.getVoteCounts();
                
                const voteResultsEmbed = new EmbedBuilder()
                    .setTitle('Current Voting Results')
                    .setDescription('Thank you for voting! Here are the current results.\n\n⚠️ **Please do not share these results with others who haven\'t voted yet!**')
                    .setColor('#FF69B4')
                    .setFooter({ text: `Voting ends on ${activePoll.endDate.toDateString()}` });
                
                // Add results fields, handling potential missing values safely
                if (results && Array.isArray(results) && results.length > 0) {
                    const resultsFields = results.map((result, index) => ({
                        name: `${result.title || `Game ${index+1}`} ${result.consoleName ? `(${result.consoleName})` : ''}`,
                        value: `${result.votes || 0} vote${result.votes !== 1 ? 's' : ''}`
                    }));
                    
                    voteResultsEmbed.addFields(resultsFields);
                } else {
                    voteResultsEmbed.addFields({ 
                        name: 'No other votes yet', 
                        value: 'You are the first to vote!' 
                    });
                }
                
                return interaction.followUp({ embeds: [voteResultsEmbed], ephemeral: true });
            } catch (error) {
                console.error('Error showing results after voting:', error);
                // Don't fail if just the results display fails
                return interaction.followUp({ 
                    content: 'Your vote was recorded, but there was an error displaying the current results.', 
                    ephemeral: true 
                });
            }

        } catch (error) {
            console.error('Error processing vote:', error);
            return interaction.editReply('An error occurred while processing your vote. Please try again later.');
        }
    }
};
