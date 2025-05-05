import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ComponentType 
} from 'discord.js';
import { User } from '../../models/User.js';
import { Suggestion } from '../../models/Suggestion.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('suggestions')
        .setDescription('Suggest improvements or new content for the community')
        .addSubcommand(subcommand =>
            subcommand
                .setName('arcade')
                .setDescription('Suggest a new arcade board')
                .addStringOption(option =>
                    option.setName('gameid')
                    .setDescription('The RetroAchievements Game ID (final numbers in the URL)')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                    .setDescription('Why would this game make a good arcade board?')
                    .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('racing')
                .setDescription('Suggest a racing track/game for future racing challenges')
                .addStringOption(option =>
                    option.setName('gameid')
                    .setDescription('The RetroAchievements Game ID (final numbers in the URL)')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                    .setDescription('Why would this make a good racing challenge?')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('trackname')
                    .setDescription('The specific track name (if applicable)')
                    .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bot')
                .setDescription('Suggest an improvement to the bot')
                .addStringOption(option =>
                    option.setName('feature')
                    .setDescription('What feature would you like to suggest?')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                    .setDescription('Describe your suggestion in detail')
                    .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('other')
                .setDescription('Make another type of suggestion')
                .addStringOption(option =>
                    option.setName('title')
                    .setDescription('A short title for your suggestion')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                    .setDescription('Describe your suggestion in detail')
                    .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all current suggestions')
                .addStringOption(option =>
                    option.setName('type')
                    .setDescription('Filter suggestions by type')
                    .setRequired(false)
                    .addChoices(
                        { name: 'All Suggestions', value: 'all' },
                        { name: 'Arcade Boards', value: 'arcade' },
                        { name: 'Racing Tracks', value: 'racing' },
                        { name: 'Bot Improvements', value: 'bot' },
                        { name: 'Other Suggestions', value: 'other' }
                    ))),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();

            // Handle view subcommand separately
            if (subcommand === 'view') {
                return this.handleViewSuggestions(interaction);
            }

            // Handle other subcommands for making suggestions
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You are not registered. Please ask an admin to register you first.');
            }

            // Process the suggestion based on the subcommand
            switch(subcommand) {
                case 'arcade':
                    await this.handleArcadeSuggestion(interaction, user);
                    break;
                case 'racing':
                    await this.handleRacingSuggestion(interaction, user);
                    break;
                case 'bot':
                    await this.handleBotSuggestion(interaction, user);
                    break;
                case 'other':
                    await this.handleOtherSuggestion(interaction, user);
                    break;
                default:
                    return interaction.editReply('Invalid subcommand. Please try again.');
            }

        } catch (error) {
            console.error('Error in suggest command:', error);
            return interaction.editReply('An error occurred while processing your suggestion. Please try again.');
        }
    },

    async handleArcadeSuggestion(interaction, user) {
        try {
            const gameId = interaction.options.getString('gameid');
            const description = interaction.options.getString('description');

            // Validate game exists via RetroAPI
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID (the numbers at the end of the game URL on RetroAchievements.org).');
            }

            // Create new suggestion
            const newSuggestion = new Suggestion({
                type: 'arcade',
                gameId,
                gameTitle: gameInfo.title,
                consoleName: gameInfo.consoleName,
                description,
                suggestedBy: user.raUsername,
                discordId: user.discordId,
                suggestionDate: new Date()
            });

            await newSuggestion.save();

            // Create a response embed
            const embed = new EmbedBuilder()
                .setTitle('Arcade Board Suggestion Submitted')
                .setColor('#00FF00')
                .setThumbnail(gameInfo.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null)
                .setDescription(`Your suggestion for **${gameInfo.title}** has been submitted!`)
                .addFields(
                    { 
                        name: 'Game Details', 
                        value: `**Console:** ${gameInfo.consoleName}\n**Achievements:** ${gameInfo.achievements ? Object.keys(gameInfo.achievements).length : 'Unknown'}\n[View Game Page](https://retroachievements.org/game/${gameId})`
                    },
                    {
                        name: 'Your Reason', 
                        value: description
                    }
                )
                .setFooter({ text: 'Thank you for your suggestion!' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error handling arcade suggestion:', error);
            return interaction.editReply('An error occurred while submitting your arcade board suggestion. Please try again.');
        }
    },

    async handleRacingSuggestion(interaction, user) {
        try {
            const gameId = interaction.options.getString('gameid');
            const trackName = interaction.options.getString('trackname') || '';
            const description = interaction.options.getString('description');

            // Validate game exists via RetroAPI
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID (the numbers at the end of the game URL on RetroAchievements.org).');
            }

            // Create new suggestion
            const newSuggestion = new Suggestion({
                type: 'racing',
                gameId,
                gameTitle: gameInfo.title,
                consoleName: gameInfo.consoleName,
                trackName,
                description,
                suggestedBy: user.raUsername,
                discordId: user.discordId,
                suggestionDate: new Date()
            });

            await newSuggestion.save();

            // Create a response embed
            const embed = new EmbedBuilder()
                .setTitle('Racing Challenge Suggestion Submitted')
                .setColor('#00BFFF')
                .setThumbnail(gameInfo.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null)
                .setDescription(`Your suggestion for **${gameInfo.title}**${trackName ? ` (${trackName})` : ''} has been submitted!`)
                .addFields(
                    { 
                        name: 'Game Details', 
                        value: `**Console:** ${gameInfo.consoleName}\n**Achievements:** ${gameInfo.achievements ? Object.keys(gameInfo.achievements).length : 'Unknown'}\n[View Game Page](https://retroachievements.org/game/${gameId})`
                    },
                    {
                        name: 'Your Reason', 
                        value: description
                    }
                )
                .setFooter({ text: 'Thank you for your suggestion!' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error handling racing suggestion:', error);
            return interaction.editReply('An error occurred while submitting your racing challenge suggestion. Please try again.');
        }
    },

    async handleBotSuggestion(interaction, user) {
        try {
            const feature = interaction.options.getString('feature');
            const description = interaction.options.getString('description');

            // Create new suggestion
            const newSuggestion = new Suggestion({
                type: 'bot',
                title: feature,
                description,
                suggestedBy: user.raUsername,
                discordId: user.discordId,
                suggestionDate: new Date()
            });

            await newSuggestion.save();

            // Create a response embed
            const embed = new EmbedBuilder()
                .setTitle('Bot Improvement Suggestion Submitted')
                .setColor('#FF9900')
                .setDescription(`Your suggestion for a bot improvement has been submitted!`)
                .addFields(
                    { 
                        name: 'Feature', 
                        value: feature
                    },
                    {
                        name: 'Description', 
                        value: description
                    }
                )
                .setFooter({ text: 'Thank you for your suggestion!' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error handling bot suggestion:', error);
            return interaction.editReply('An error occurred while submitting your bot improvement suggestion. Please try again.');
        }
    },

    async handleOtherSuggestion(interaction, user) {
        try {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');

            // Create new suggestion
            const newSuggestion = new Suggestion({
                type: 'other',
                title,
                description,
                suggestedBy: user.raUsername,
                discordId: user.discordId,
                suggestionDate: new Date()
            });

            await newSuggestion.save();

            // Create a response embed
            const embed = new EmbedBuilder()
                .setTitle('Suggestion Submitted')
                .setColor('#9B59B6')
                .setDescription(`Your suggestion has been submitted!`)
                .addFields(
                    { 
                        name: 'Title', 
                        value: title
                    },
                    {
                        name: 'Description', 
                        value: description
                    }
                )
                .setFooter({ text: 'Thank you for your suggestion!' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error handling other suggestion:', error);
            return interaction.editReply('An error occurred while submitting your suggestion. Please try again.');
        }
    },

    async handleViewSuggestions(interaction) {
        try {
            const filterType = interaction.options.getString('type') || 'all';
            
            // Get suggestions based on filter
            const filter = filterType !== 'all' ? { type: filterType } : {};
            const suggestions = await Suggestion.find(filter).sort({ suggestionDate: -1 });
            
            if (suggestions.length === 0) {
                return interaction.editReply(`No ${filterType !== 'all' ? filterType + ' ' : ''}suggestions found.`);
            }

            // Group suggestions by type
            const suggestionsByType = {
                'arcade': [],
                'racing': [],
                'bot': [],
                'other': []
            };
            
            suggestions.forEach(suggestion => {
                if (suggestionsByType[suggestion.type]) {
                    suggestionsByType[suggestion.type].push(suggestion);
                }
            });
            
            // Create initial embed with introduction
            const embed = new EmbedBuilder()
                .setTitle('📋 Community Suggestions')
                .setDescription(`Here are the current community suggestions${filterType !== 'all' ? ' for ' + filterType : ''}:`)
                .setColor('#00BFFF')
                .setTimestamp();
                
            // Add fields for each category that has suggestions
            if (filterType === 'all' || filterType === 'arcade') {
                if (suggestionsByType.arcade.length > 0) {
                    let arcadeText = '';
                    suggestionsByType.arcade.slice(0, 10).forEach(s => {
                        arcadeText += `**${s.gameTitle}** (${s.consoleName})\n` +
                                     `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                     `Reason: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n` +
                                     `[View Game](https://retroachievements.org/game/${s.gameId})\n\n`;
                    });
                    
                    embed.addFields({
                        name: '🎯 Arcade Board Suggestions',
                        value: arcadeText || 'No arcade suggestions yet.'
                    });
                }
            }
            
            if (filterType === 'all' || filterType === 'racing') {
                if (suggestionsByType.racing.length > 0) {
                    let racingText = '';
                    suggestionsByType.racing.slice(0, 10).forEach(s => {
                        racingText += `**${s.gameTitle}**${s.trackName ? ` (${s.trackName})` : ''} (${s.consoleName})\n` +
                                     `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                     `Reason: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n` +
                                     `[View Game](https://retroachievements.org/game/${s.gameId})\n\n`;
                    });
                    
                    embed.addFields({
                        name: '🏎️ Racing Challenge Suggestions',
                        value: racingText || 'No racing suggestions yet.'
                    });
                }
            }
            
            if (filterType === 'all' || filterType === 'bot') {
                if (suggestionsByType.bot.length > 0) {
                    let botText = '';
                    suggestionsByType.bot.slice(0, 10).forEach(s => {
                        botText += `**${s.title}**\n` +
                                  `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                  `Description: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n\n`;
                    });
                    
                    embed.addFields({
                        name: '🤖 Bot Improvement Suggestions',
                        value: botText || 'No bot improvement suggestions yet.'
                    });
                }
            }
            
            if (filterType === 'all' || filterType === 'other') {
                if (suggestionsByType.other.length > 0) {
                    let otherText = '';
                    suggestionsByType.other.slice(0, 10).forEach(s => {
                        otherText += `**${s.title}**\n` +
                                    `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                    `Description: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n\n`;
                    });
                    
                    embed.addFields({
                        name: '💡 Other Suggestions',
                        value: otherText || 'No other suggestions yet.'
                    });
                }
            }
            
            embed.addFields({
                name: 'Want to make a suggestion?',
                value: 'Use `/suggestions arcade`, `/suggestions racing`, `/suggestions bot`, or `/suggestions other` to submit your ideas!'
            });
            
            // Create dropdown for filtering suggestions
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('filter_suggestions')
                .setPlaceholder('Filter suggestions by type')
                .addOptions([
                    { label: 'All Suggestions', value: 'all' },
                    { label: 'Arcade Boards', value: 'arcade' },
                    { label: 'Racing Tracks', value: 'racing' },
                    { label: 'Bot Improvements', value: 'bot' },
                    { label: 'Other Suggestions', value: 'other' }
                ]);
                
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            const response = await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
            
            // Set up collector for dropdown menu
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes
            });
            
            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    const selectedType = i.values[0];
                    
                    await i.deferUpdate();
                    
                    // Get suggestions for the selected type
                    const newFilter = selectedType !== 'all' ? { type: selectedType } : {};
                    const newSuggestions = await Suggestion.find(newFilter).sort({ suggestionDate: -1 });
                    
                    if (newSuggestions.length === 0) {
                        return i.editReply(`No ${selectedType !== 'all' ? selectedType + ' ' : ''}suggestions found.`);
                    }
                    
                    // Re-group suggestions by type
                    const newSuggestionsByType = {
                        'arcade': [],
                        'racing': [],
                        'bot': [],
                        'other': []
                    };
                    
                    newSuggestions.forEach(suggestion => {
                        if (newSuggestionsByType[suggestion.type]) {
                            newSuggestionsByType[suggestion.type].push(suggestion);
                        }
                    });
                    
                    // Create new embed
                    const newEmbed = new EmbedBuilder()
                        .setTitle('📋 Community Suggestions')
                        .setDescription(`Here are the current community suggestions${selectedType !== 'all' ? ' for ' + selectedType : ''}:`)
                        .setColor('#00BFFF')
                        .setTimestamp();
                        
                    // Add fields for each category based on the filter
                    if (selectedType === 'all' || selectedType === 'arcade') {
                        if (newSuggestionsByType.arcade.length > 0) {
                            let arcadeText = '';
                            newSuggestionsByType.arcade.slice(0, 10).forEach(s => {
                                arcadeText += `**${s.gameTitle}** (${s.consoleName})\n` +
                                            `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                            `Reason: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n` +
                                            `[View Game](https://retroachievements.org/game/${s.gameId})\n\n`;
                            });
                            
                            newEmbed.addFields({
                                name: '🎯 Arcade Board Suggestions',
                                value: arcadeText || 'No arcade suggestions yet.'
                            });
                        }
                    }
                    
                    if (selectedType === 'all' || selectedType === 'racing') {
                        if (newSuggestionsByType.racing.length > 0) {
                            let racingText = '';
                            newSuggestionsByType.racing.slice(0, 10).forEach(s => {
                                racingText += `**${s.gameTitle}**${s.trackName ? ` (${s.trackName})` : ''} (${s.consoleName})\n` +
                                            `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                            `Reason: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n` +
                                            `[View Game](https://retroachievements.org/game/${s.gameId})\n\n`;
                            });
                            
                            newEmbed.addFields({
                                name: '🏎️ Racing Challenge Suggestions',
                                value: racingText || 'No racing suggestions yet.'
                            });
                        }
                    }
                    
                    if (selectedType === 'all' || selectedType === 'bot') {
                        if (newSuggestionsByType.bot.length > 0) {
                            let botText = '';
                            newSuggestionsByType.bot.slice(0, 10).forEach(s => {
                                botText += `**${s.title}**\n` +
                                        `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                        `Description: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n\n`;
                            });
                            
                            newEmbed.addFields({
                                name: '🤖 Bot Improvement Suggestions',
                                value: botText || 'No bot improvement suggestions yet.'
                            });
                        }
                    }
                    
                    if (selectedType === 'all' || selectedType === 'other') {
                        if (newSuggestionsByType.other.length > 0) {
                            let otherText = '';
                            newSuggestionsByType.other.slice(0, 10).forEach(s => {
                                otherText += `**${s.title}**\n` +
                                            `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                            `Description: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n\n`;
                            });
                            
                            newEmbed.addFields({
                                name: '💡 Other Suggestions',
                                value: otherText || 'No other suggestions yet.'
                            });
                        }
                    }
                    
                    newEmbed.addFields({
                        name: 'Want to make a suggestion?',
                        value: 'Use `/suggest arcade`, `/suggest racing`, `/suggest bot`, or `/suggest other` to submit your ideas!'
                    });
                    
                    await i.editReply({
                        embeds: [newEmbed],
                        components: [row]
                    });
                } else {
                    await i.reply({ 
                        content: 'This menu is not for you. Please use the `/suggest view` command to see suggestions.',
                        ephemeral: true 
                    });
                }
            });
            
            // When collector expires
            collector.on('end', async () => {
                try {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        StringSelectMenuBuilder.from(selectMenu).setDisabled(true)
                    );
                    
                    await interaction.editReply({
                        embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggest view again to see suggestions.' })],
                        components: [disabledRow]
                    });
                } catch (error) {
                    console.error('Error disabling suggestion view menu:', error);
                }
            });
            
        } catch (error) {
            console.error('Error viewing suggestions:', error);
            return interaction.editReply('An error occurred while retrieving suggestions. Please try again.');
        }
    }
};
