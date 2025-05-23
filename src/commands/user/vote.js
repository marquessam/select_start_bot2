import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { User } from '../../models/User.js';
import { Poll } from '../../models/Poll.js';

export default {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for next month\'s challenge games'),

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
                        .setTitle('🗳️ You Have Already Voted!')
                        .setDescription('Thanks for voting! Here are the current results.\n\n⚠️ **Please keep these results private until voting ends!**')
                        .setColor('#FF69B4')
                        .setFooter({ text: `Voting ends on ${activePoll.endDate.toDateString()}` });
                    
                    // Add results fields, handling potential missing values safely
                    if (results && Array.isArray(results) && results.length > 0) {
                        const resultsText = results.map((result, index) => 
                            `**${index + 1}. ${result.title || `Game ${index+1}`}** ${result.consoleName ? `(${result.consoleName})` : ''}\n` +
                            `${result.votes || 0} vote${result.votes !== 1 ? 's' : ''}`
                        ).join('\n\n');
                        
                        voteResultsEmbed.setDescription(
                            voteResultsEmbed.data.description + '\n\n' + resultsText
                        );
                    } else {
                        voteResultsEmbed.addFields({ 
                            name: 'No other votes yet', 
                            value: 'You are the first to vote!' 
                        });
                    }
                    
                    return interaction.editReply({ embeds: [voteResultsEmbed] });
                } catch (error) {
                    console.error('Error showing vote results:', error);
                    return interaction.editReply('You have already voted in this poll. Unable to show current results due to an error.');
                }
            }

            // Create the voting interface
            const votingEmbed = new EmbedBuilder()
                .setTitle('🗳️ Cast Your Vote!')
                .setDescription(
                    `Select up to **2 games** you'd like to see as next month's challenge.\n\n` +
                    `**Available Games:**\n` +
                    activePoll.selectedGames.map((game, index) => 
                        `**${index + 1}.** ${game.title} *(${game.consoleName})*`
                    ).join('\n') +
                    `\n\n✅ Use the dropdown menus below to make your selections!\n` +
                    `🔄 You can change your selections before submitting.\n` +
                    `⏰ Voting ends <t:${Math.floor(activePoll.endDate.getTime() / 1000)}:R>`
                )
                .setColor('#00FF00')
                .setFooter({ text: 'Select your choices below, then click Submit Vote!' });

            // Create select menu options from the games
            const gameOptions = activePoll.selectedGames.map((game, index) => ({
                label: `${index + 1}. ${game.title}`,
                description: `${game.consoleName}`,
                value: `${index}`,
                emoji: '🎮'
            }));

            // First choice select menu
            const firstChoiceMenu = new StringSelectMenuBuilder()
                .setCustomId('vote_first_choice')
                .setPlaceholder('🥇 Select your FIRST choice')
                .addOptions(gameOptions)
                .setMinValues(1)
                .setMaxValues(1);

            // Second choice select menu
            const secondChoiceMenu = new StringSelectMenuBuilder()
                .setCustomId('vote_second_choice')
                .setPlaceholder('🥈 Select your SECOND choice (optional)')
                .addOptions([
                    {
                        label: 'No second choice',
                        description: 'Vote for only one game',
                        value: 'none',
                        emoji: '❌'
                    },
                    ...gameOptions
                ])
                .setMinValues(1)
                .setMaxValues(1);

            // Submit and cancel buttons
            const submitButton = new ButtonBuilder()
                .setCustomId('vote_submit')
                .setLabel('Submit Vote')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅');

            const cancelButton = new ButtonBuilder()
                .setCustomId('vote_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌');

            // Action rows
            const firstRow = new ActionRowBuilder().addComponents(firstChoiceMenu);
            const secondRow = new ActionRowBuilder().addComponents(secondChoiceMenu);
            const buttonRow = new ActionRowBuilder().addComponents(submitButton, cancelButton);

            // Update the embed to show current selections
            votingEmbed.setFields({
                name: 'Vote Status',
                value: 'Please make your selections above',
                inline: false
            });

            await interaction.editReply({
                embeds: [votingEmbed],
                components: [firstRow, secondRow, buttonRow]
            });

        } catch (error) {
            console.error('Error processing vote:', error);
            return interaction.editReply('An error occurred while setting up voting. Please try again later.');
        }
    },

    // Handle select menu interactions
    async handleSelectMenuInteraction(interaction) {
        await interaction.deferUpdate();

        try {
            const embed = interaction.message.embeds[0];
            if (!embed) return;

            // Parse current vote state from the message
            let firstChoice = null;
            let secondChoice = null;

            // Extract current selections from embed fields if they exist
            const statusField = embed.fields?.find(f => f.name === 'Vote Status');
            if (statusField && statusField.value !== 'Please make your selections above') {
                const matches = statusField.value.match(/\*\*First choice:\*\* (.+)\n\*\*Second choice:\*\* (.+)/);
                if (matches) {
                    firstChoice = matches[1] !== 'None' ? matches[1] : null;
                    secondChoice = matches[2] !== 'None' ? matches[2] : null;
                }
            }

            // Get the active poll
            const activePoll = await Poll.findActivePoll();
            if (!activePoll) {
                return interaction.editReply({
                    content: 'This voting poll is no longer active.',
                    embeds: [],
                    components: []
                });
            }

            const selectedValue = interaction.values[0];
            
            if (interaction.customId === 'vote_first_choice') {
                const gameIndex = parseInt(selectedValue);
                firstChoice = activePoll.selectedGames[gameIndex]?.title || null;
            } else if (interaction.customId === 'vote_second_choice') {
                if (selectedValue === 'none') {
                    secondChoice = null;
                } else {
                    const gameIndex = parseInt(selectedValue);
                    secondChoice = activePoll.selectedGames[gameIndex]?.title || null;
                }
            }

            // Validate that first and second choice are different
            let duplicateWarning = false;
            if (firstChoice && secondChoice && firstChoice === secondChoice) {
                secondChoice = null;
                duplicateWarning = true;
            }

            // Update the embed to show current selections
            const updatedEmbed = EmbedBuilder.from(embed);
            
            // Clear existing fields and add updated vote status
            updatedEmbed.setFields({
                name: 'Vote Status',
                value: `**First choice:** ${firstChoice || 'None'}\n**Second choice:** ${secondChoice || 'None'}`,
                inline: false
            });

            if (duplicateWarning) {
                updatedEmbed.addFields({
                    name: '⚠️ Note',
                    value: 'You cannot vote for the same game twice. Second choice was cleared.',
                    inline: false
                });
            }

            await interaction.editReply({
                embeds: [updatedEmbed]
            });

        } catch (error) {
            console.error('Error handling select menu interaction:', error);
            await interaction.editReply({
                content: 'An error occurred while processing your selection. Please try `/vote` again.',
                embeds: [],
                components: []
            });
        }
    },

    // Handle button interactions  
    async handleButtonInteraction(interaction) {
        await interaction.deferUpdate();

        try {
            const embed = interaction.message.embeds[0];
            if (!embed) return;

            if (interaction.customId === 'vote_cancel') {
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Vote Cancelled')
                    .setDescription('Your vote was cancelled. You can use `/vote` again anytime before voting ends.')
                    .setColor('#FF0000');

                return interaction.editReply({
                    embeds: [cancelEmbed],
                    components: []
                });

            } else if (interaction.customId === 'vote_submit') {
                // Parse current vote state from the message
                let firstChoice = null;
                let secondChoice = null;

                const statusField = embed.fields?.find(f => f.name === 'Vote Status');
                if (statusField && statusField.value !== 'Please make your selections above') {
                    const matches = statusField.value.match(/\*\*First choice:\*\* (.+)\n\*\*Second choice:\*\* (.+)/);
                    if (matches) {
                        firstChoice = matches[1] !== 'None' ? matches[1] : null;
                        secondChoice = matches[2] !== 'None' ? matches[2] : null;
                    }
                }

                if (!firstChoice) {
                    const errorEmbed = EmbedBuilder.from(embed);
                    errorEmbed.addFields({
                        name: '❌ Error',
                        value: 'Please select at least your first choice before submitting.',
                        inline: false
                    });

                    return interaction.editReply({
                        embeds: [errorEmbed]
                    });
                }

                // Get the active poll
                const activePoll = await Poll.findActivePoll();
                if (!activePoll) {
                    return interaction.editReply({
                        content: 'This voting poll is no longer active.',
                        embeds: [],
                        components: []
                    });
                }

                // Convert game titles back to game IDs for storage
                const votes = [];
                
                // Find first choice game ID
                const firstGame = activePoll.selectedGames.find(g => g.title === firstChoice);
                if (firstGame) votes.push(firstGame.gameId);

                // Find second choice game ID
                if (secondChoice) {
                    const secondGame = activePoll.selectedGames.find(g => g.title === secondChoice);
                    if (secondGame) votes.push(secondGame.gameId);
                }

                if (votes.length === 0) {
                    return interaction.editReply({
                        content: 'Error processing your vote. Please try again.',
                        embeds: [],
                        components: []
                    });
                }

                // Check if user has already voted
                const hasVoted = activePoll.hasUserVoted(interaction.user.id);
                if (hasVoted) {
                    const alreadyVotedEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Already Voted')
                        .setDescription('You have already voted in this poll. Each user can only vote once.')
                        .setColor('#FFA500');

                    return interaction.editReply({
                        embeds: [alreadyVotedEmbed],
                        components: []
                    });
                }

                // Record the vote
                try {
                    activePoll.addVote(interaction.user.id, votes);
                    await activePoll.save();
                } catch (error) {
                    console.error('Error saving vote:', error);
                    return interaction.editReply({
                        content: 'An error occurred when recording your vote. Please try again later.',
                        embeds: [],
                        components: []
                    });
                }

                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Vote Recorded!')
                    .setDescription('Thank you for voting! Your vote has been recorded.')
                    .setColor('#00FF00')
                    .addFields({
                        name: 'Your Votes',
                        value: votes.length === 1 ? 
                            `🥇 **${firstChoice}**` :
                            `🥇 **${firstChoice}**\n🥈 **${secondChoice}**`,
                        inline: false
                    })
                    .setFooter({ text: 'Your vote is final and cannot be changed.' });

                await interaction.editReply({
                    embeds: [successEmbed],
                    components: []
                });

                // Show results in a follow-up
                try {
                    const results = activePoll.getVoteCounts();
                    
                    const resultsEmbed = new EmbedBuilder()
                        .setTitle('📊 Current Results')
                        .setDescription('Here are the current voting results.\n\n⚠️ **Please keep these private until voting ends!**')
                        .setColor('#FF69B4')
                        .setFooter({ text: `Voting ends on ${activePoll.endDate.toDateString()}` });
                    
                    if (results && results.length > 0) {
                        const resultsText = results.map((result, index) => 
                            `**${index + 1}. ${result.title}** *(${result.consoleName})*\n` +
                            `📊 ${result.votes} vote${result.votes !== 1 ? 's' : ''}`
                        ).join('\n\n');
                        
                        resultsEmbed.setDescription(resultsEmbed.data.description + '\n\n' + resultsText);
                    }
                    
                    await interaction.followUp({ 
                        embeds: [resultsEmbed], 
                        ephemeral: true 
                    });
                } catch (error) {
                    console.error('Error showing results after voting:', error);
                }
            }

        } catch (error) {
            console.error('Error handling button interaction:', error);
            await interaction.editReply({
                content: 'An error occurred while processing your interaction. Please try `/vote` again.',
                embeds: [],
                components: []
            });
        }
    }
};
