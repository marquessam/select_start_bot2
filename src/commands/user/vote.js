import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { User } from '../../models/User.js';
import { Poll } from '../../models/Poll.js';

// Admin channel ID for vote logging
const ADMIN_CHANNEL_ID = '1304814893857374270';

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

            // Get any active poll (including tiebreakers)
            let activePoll;
            try {
                activePoll = await Poll.findAnyActivePoll();
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
                    const pollTypeText = activePoll.isTiebreaker ? 'Tiebreaker' : 'Monthly Challenge';
                    
                    const voteResultsEmbed = new EmbedBuilder()
                        .setTitle(`🗳️ You Have Already Voted! (${pollTypeText})`)
                        .setDescription('Thanks for voting! Here are the current results.\n\n⚠️ **Please keep these results private until voting ends!**')
                        .setColor(activePoll.isTiebreaker ? '#FF4500' : '#FF69B4')
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

            // Determine poll type and styling
            const pollTypeText = activePoll.isTiebreaker ? 'TIEBREAKER VOTE' : 'Monthly Challenge Vote';
            const pollColor = activePoll.isTiebreaker ? '#FF4500' : '#00FF00';
            const pollEmoji = activePoll.isTiebreaker ? '🔥' : '🗳️';

            // Create the voting interface
            const votingEmbed = new EmbedBuilder()
                .setTitle(`${pollEmoji} Cast Your ${pollTypeText}!`)
                .setDescription(
                    (activePoll.isTiebreaker ? 
                        `🔥 **TIEBREAKER ROUND** - These games tied in the main vote!\n\n` +
                        `Select **1 game** to break the tie!\n\n` :
                        `Select up to **2 games** you'd like to see as next month's challenge.\n\n`
                    ) +
                    `**Available Games:**\n` +
                    activePoll.selectedGames.map((game, index) => 
                        `**${index + 1}.** ${game.title} *(${game.consoleName})*`
                    ).join('\n') +
                    `\n\n✅ Use the dropdown menu${activePoll.isTiebreaker ? '' : 's'} below to make your selection${activePoll.isTiebreaker ? '' : 's'}!\n` +
                    (activePoll.isTiebreaker ? '' : '🔄 You can change your selections before submitting.\n') +
                    `⏰ Voting ends <t:${Math.floor(activePoll.endDate.getTime() / 1000)}:R>` +
                    (activePoll.isTiebreaker ? 
                        '\n\n🎯 **This is the final round!** If there\'s still a tie, a winner will be randomly selected.' :
                        '\n\n🔥 **New:** If there\'s a tie, an automatic 24-hour tiebreaker vote will start!'
                    )
                )
                .setColor(pollColor)
                .setFooter({ 
                    text: activePoll.isTiebreaker ? 
                        'Tiebreaker Vote - Select ONE game below!' :
                        'Select your choices below, then click Submit Vote!' 
                });

            // Create select menu options from the games
            const gameOptions = activePoll.selectedGames.map((game, index) => ({
                label: `${index + 1}. ${game.title}`,
                description: `${game.consoleName}`,
                value: `${index}`,
                emoji: activePoll.isTiebreaker ? '🔥' : '🎮'
            }));

            // For tiebreakers, only show one choice menu
            if (activePoll.isTiebreaker) {
                // Single choice select menu for tiebreakers
                const choiceMenu = new StringSelectMenuBuilder()
                    .setCustomId('vote_tiebreaker_choice')
                    .setPlaceholder('🔥 Select your choice to break the tie')
                    .addOptions(gameOptions)
                    .setMinValues(1)
                    .setMaxValues(1);

                // Submit and cancel buttons
                const submitButton = new ButtonBuilder()
                    .setCustomId('vote_submit')
                    .setLabel('Submit Tiebreaker Vote')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('✅');

                const cancelButton = new ButtonBuilder()
                    .setCustomId('vote_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❌');

                // Action rows for tiebreaker
                const choiceRow = new ActionRowBuilder().addComponents(choiceMenu);
                const buttonRow = new ActionRowBuilder().addComponents(submitButton, cancelButton);

                // Update the embed to show current selections
                votingEmbed.setFields({
                    name: 'Vote Status',
                    value: 'Please make your selection above',
                    inline: false
                });

                await interaction.editReply({
                    embeds: [votingEmbed],
                    components: [choiceRow, buttonRow]
                });

            } else {
                // Regular voting with two choice menus
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

                // Action rows for regular voting
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
            }

        } catch (error) {
            console.error('Error processing vote:', error);
            return interaction.editReply('An error occurred while setting up voting. Please try again later.');
        }
    },

    // Handle select menu interactions with improved visual feedback
    async handleSelectMenuInteraction(interaction) {
        await interaction.deferUpdate();

        try {
            const embed = interaction.message.embeds[0];
            if (!embed) return;

            // Get the active poll
            const activePoll = await Poll.findAnyActivePoll();
            if (!activePoll) {
                return interaction.editReply({
                    content: 'This voting poll is no longer active.',
                    embeds: [],
                    components: []
                });
            }

            const selectedValue = interaction.values[0];

            // Handle tiebreaker voting (single choice)
            if (interaction.customId === 'vote_tiebreaker_choice') {
                const gameIndex = parseInt(selectedValue);
                const selectedChoice = activePoll.selectedGames[gameIndex]?.title || null;
                
                console.log(`User ${interaction.user.id} selected tiebreaker choice: ${selectedChoice} (index: ${gameIndex})`);

                // Create updated dropdown component
                const gameOptions = activePoll.selectedGames.map((game, index) => ({
                    label: `${index + 1}. ${game.title}`,
                    description: `${game.consoleName}`,
                    value: `${index}`,
                    emoji: '🔥'
                }));

                const choiceMenu = new StringSelectMenuBuilder()
                    .setCustomId('vote_tiebreaker_choice')
                    .setPlaceholder(selectedChoice ? `Selected: ${selectedChoice}` : '🔥 Select your choice to break the tie')
                    .addOptions(gameOptions)
                    .setMinValues(1)
                    .setMaxValues(1);

                const submitButton = new ButtonBuilder()
                    .setCustomId('vote_submit')
                    .setLabel('Submit Tiebreaker Vote')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('✅');

                const cancelButton = new ButtonBuilder()
                    .setCustomId('vote_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❌');

                const choiceRow = new ActionRowBuilder().addComponents(choiceMenu);
                const buttonRow = new ActionRowBuilder().addComponents(submitButton, cancelButton);

                // Update the embed to show current selection
                const updatedEmbed = EmbedBuilder.from(embed);
                updatedEmbed.setFields({
                    name: 'Vote Status',
                    value: `**Your choice:** ${selectedChoice || 'None'}`,
                    inline: false
                });

                await interaction.editReply({
                    embeds: [updatedEmbed],
                    components: [choiceRow, buttonRow]
                });

                return;
            }

            // Handle regular voting (two choices) - existing logic
            let firstChoice = null;
            let secondChoice = null;
            let firstChoiceIndex = null;
            let secondChoiceIndex = null;

            // Extract current selections from embed fields if they exist
            const statusField = embed.fields?.find(f => f.name === 'Vote Status');
            if (statusField && statusField.value !== 'Please make your selections above') {
                const matches = statusField.value.match(/\*\*First choice:\*\* (.+)\n\*\*Second choice:\*\* (.+)/);
                if (matches) {
                    firstChoice = matches[1] !== 'None' ? matches[1] : null;
                    secondChoice = matches[2] !== 'None' ? matches[2] : null;
                }
            }

            // Update selection based on which dropdown was used
            if (interaction.customId === 'vote_first_choice') {
                firstChoiceIndex = selectedValue;
                const gameIndex = parseInt(selectedValue);
                firstChoice = activePoll.selectedGames[gameIndex]?.title || null;
                
                console.log(`User ${interaction.user.id} selected first choice: ${firstChoice} (index: ${gameIndex})`);
            } else if (interaction.customId === 'vote_second_choice') {
                if (selectedValue === 'none') {
                    secondChoice = null;
                    secondChoiceIndex = 'none';
                    console.log(`User ${interaction.user.id} cleared second choice`);
                } else {
                    secondChoiceIndex = selectedValue;
                    const gameIndex = parseInt(selectedValue);
                    secondChoice = activePoll.selectedGames[gameIndex]?.title || null;
                    console.log(`User ${interaction.user.id} selected second choice: ${secondChoice} (index: ${gameIndex})`);
                }
            }

            // Validate that first and second choice are different
            let duplicateWarning = false;
            if (firstChoice && secondChoice && firstChoice === secondChoice) {
                secondChoice = null;
                secondChoiceIndex = 'none';
                duplicateWarning = true;
                console.log(`User ${interaction.user.id} had duplicate selections - cleared second choice`);
            }

            // Create new dropdown components with selected values
            const gameOptions = activePoll.selectedGames.map((game, index) => ({
                label: `${index + 1}. ${game.title}`,
                description: `${game.consoleName}`,
                value: `${index}`,
                emoji: '🎮'
            }));

            // First choice menu with updated placeholder showing selection
            const firstChoiceMenu = new StringSelectMenuBuilder()
                .setCustomId('vote_first_choice')
                .setPlaceholder(firstChoice ? `Selected: ${firstChoice}` : '🥇 Select your FIRST choice')
                .addOptions(gameOptions)
                .setMinValues(1)
                .setMaxValues(1);

            // Second choice menu options with "none" option first
            const secondChoiceOptions = [
                {
                    label: 'No second choice',
                    description: 'Vote for only one game',
                    value: 'none',
                    emoji: '❌'
                },
                ...gameOptions
            ];

            // Second choice menu with updated placeholder showing selection
            const secondChoiceMenu = new StringSelectMenuBuilder()
                .setCustomId('vote_second_choice')
                .setPlaceholder(secondChoice ? `Selected: ${secondChoice}` : secondChoiceIndex === 'none' ? 'No second choice selected' : '🥈 Select your SECOND choice (optional)')
                .addOptions(secondChoiceOptions)
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
                embeds: [updatedEmbed],
                components: [firstRow, secondRow, buttonRow]
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

    // Handle button interactions with admin logging  
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
                // Get the active poll
                const activePoll = await Poll.findAnyActivePoll();
                if (!activePoll) {
                    return interaction.editReply({
                        content: 'This voting poll is no longer active.',
                        embeds: [],
                        components: []
                    });
                }

                let selectedChoices = [];

                // Parse current vote state from the message
                const statusField = embed.fields?.find(f => f.name === 'Vote Status');
                
                if (activePoll.isTiebreaker) {
                    // For tiebreakers, extract single choice
                    if (statusField && statusField.value !== 'Please make your selection above') {
                        const match = statusField.value.match(/\*\*Your choice:\*\* (.+)/);
                        if (match && match[1] !== 'None') {
                            selectedChoices.push(match[1]);
                        }
                    }
                } else {
                    // For regular voting, extract both choices
                    if (statusField && statusField.value !== 'Please make your selections above') {
                        const matches = statusField.value.match(/\*\*First choice:\*\* (.+)\n\*\*Second choice:\*\* (.+)/);
                        if (matches) {
                            if (matches[1] !== 'None') selectedChoices.push(matches[1]);
                            if (matches[2] !== 'None') selectedChoices.push(matches[2]);
                        }
                    }
                }

                if (selectedChoices.length === 0) {
                    const errorEmbed = EmbedBuilder.from(embed);
                    errorEmbed.addFields({
                        name: '❌ Error',
                        value: activePoll.isTiebreaker ? 
                            'Please select your choice before submitting.' :
                            'Please select at least your first choice before submitting.',
                        inline: false
                    });

                    return interaction.editReply({
                        embeds: [errorEmbed]
                    });
                }

                // Convert game titles back to game IDs for storage
                const votes = [];
                
                for (const choiceTitle of selectedChoices) {
                    const game = activePoll.selectedGames.find(g => g.title === choiceTitle);
                    if (game) votes.push(game.gameId);
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

                // Get user information
                const user = await User.findOne({ discordId: interaction.user.id });
                const raUsername = user ? user.raUsername : 'Unknown';

                // Record the vote
                try {
                    activePoll.addVote(interaction.user.id, votes);
                    await activePoll.save();
                    
                    // Log successful vote
                    const pollTypeText = activePoll.isTiebreaker ? 'tiebreaker' : 'regular';
                    console.log(`User ${interaction.user.id} (${raUsername}) successfully voted in ${pollTypeText} poll: ${votes.join(', ')}`);
                    
                    // Send log to admin channel
                    try {
                        const adminChannel = await interaction.client.channels.fetch(ADMIN_CHANNEL_ID);
                        if (adminChannel) {
                            const voteLogEmbed = new EmbedBuilder()
                                .setTitle(activePoll.isTiebreaker ? '🔥 Tiebreaker Vote Recorded' : '🗳️ Vote Recorded')
                                .setDescription(`A user has submitted their ${activePoll.isTiebreaker ? 'tiebreaker ' : ''}vote for the monthly challenge.`)
                                .setColor(activePoll.isTiebreaker ? '#FF4500' : '#00AAFF')
                                .addFields(
                                    { name: 'Discord User', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                                    { name: 'RA Username', value: raUsername, inline: true },
                                    { name: 'Vote Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                                    { name: 'Poll Type', value: activePoll.isTiebreaker ? 'Tiebreaker' : 'Regular', inline: true },
                                    { name: 'Vote Details', value: activePoll.isTiebreaker ? 
                                        `🔥 **${selectedChoices[0]}**` :
                                        (selectedChoices.length === 1 ? 
                                            `🥇 **${selectedChoices[0]}**` :
                                            `🥇 **${selectedChoices[0]}**\n🥈 **${selectedChoices[1]}**`), 
                                        inline: false
                                    }
                                )
                                .setFooter({ text: `User ID: ${interaction.user.id}` })
                                .setTimestamp();
                                
                            await adminChannel.send({ embeds: [voteLogEmbed] });
                            console.log(`Vote log sent to admin channel for user ${interaction.user.id}`);
                        } else {
                            console.warn(`Admin channel with ID ${ADMIN_CHANNEL_ID} not found`);
                        }
                    } catch (logError) {
                        console.error('Error sending vote log to admin channel:', logError);
                        // Continue even if admin logging fails
                    }
                    
                } catch (error) {
                    console.error('Error saving vote:', error);
                    return interaction.editReply({
                        content: 'An error occurred when recording your vote. Please try again later.',
                        embeds: [],
                        components: []
                    });
                }

                // Create success embed
                const pollTypeText = activePoll.isTiebreaker ? 'Tiebreaker' : '';
                const successEmbed = new EmbedBuilder()
                    .setTitle(`✅ ${pollTypeText} Vote Recorded!`)
                    .setDescription(`Thank you for voting${activePoll.isTiebreaker ? ' in the tiebreaker' : ''}! Your vote has been recorded.`)
                    .setColor(activePoll.isTiebreaker ? '#FF4500' : '#00FF00')
                    .addFields({
                        name: activePoll.isTiebreaker ? 'Your Choice' : 'Your Votes',
                        value: activePoll.isTiebreaker ? 
                            `🔥 **${selectedChoices[0]}**` :
                            (selectedChoices.length === 1 ? 
                                `🥇 **${selectedChoices[0]}**` :
                                `🥇 **${selectedChoices[0]}**\n🥈 **${selectedChoices[1]}**`),
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
                        .setTitle(activePoll.isTiebreaker ? '📊 Current Tiebreaker Results' : '📊 Current Results')
                        .setDescription('Here are the current voting results.\n\n⚠️ **Please keep these private until voting ends!**')
                        .setColor(activePoll.isTiebreaker ? '#FF4500' : '#FF69B4')
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
