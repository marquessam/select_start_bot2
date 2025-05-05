import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Suggestion } from '../../models/Suggestion.js';
import { User } from '../../models/User.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import { config } from '../../config/config.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('suggestadmin')
        .setDescription('Manage community suggestions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all pending suggestions')
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
                    ))
                .addStringOption(option =>
                    option.setName('status')
                    .setDescription('Filter suggestions by status')
                    .setRequired(false)
                    .addChoices(
                        { name: 'All Statuses', value: 'all' },
                        { name: 'Pending', value: 'pending' },
                        { name: 'Approved', value: 'approved' },
                        { name: 'Rejected', value: 'rejected' },
                        { name: 'Implemented', value: 'implemented' }
                    )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View a specific suggestion')
                .addStringOption(option =>
                    option.setName('id')
                    .setDescription('The suggestion ID to view')
                    .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update the status of a suggestion')
                .addStringOption(option =>
                    option.setName('id')
                    .setDescription('The suggestion ID to update')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('status')
                    .setDescription('The new status for the suggestion')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Pending', value: 'pending' },
                        { name: 'Approved', value: 'approved' },
                        { name: 'Rejected', value: 'rejected' },
                        { name: 'Implemented', value: 'implemented' }
                    ))
                .addStringOption(option =>
                    option.setName('response')
                    .setDescription('Optional response to the suggestion')
                    .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('implement')
                .setDescription('Implement an arcade or racing suggestion')
                .addStringOption(option =>
                    option.setName('id')
                    .setDescription('The suggestion ID to implement')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('board_id')
                    .setDescription('Custom board ID for the new board')
                    .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('leaderboard_id')
                    .setDescription('RetroAchievements leaderboard ID')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                    .setDescription('Description for the board (defaults to suggestion description)')
                    .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a suggestion')
                .addStringOption(option =>
                    option.setName('id')
                    .setDescription('The suggestion ID to delete')
                    .setRequired(true))),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();
            
            switch(subcommand) {
                case 'list':
                    await this.listSuggestions(interaction);
                    break;
                case 'view':
                    await this.viewSuggestion(interaction);
                    break;
                case 'update':
                    await this.updateSuggestion(interaction);
                    break;
                case 'implement':
                    await this.implementSuggestion(interaction);
                    break;
                case 'delete':
                    await this.deleteSuggestion(interaction);
                    break;
                default:
                    await interaction.editReply('Invalid subcommand');
            }
        } catch (error) {
            console.error('Error executing suggestadmin command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async listSuggestions(interaction) {
        try {
            const typeFilter = interaction.options.getString('type') || 'all';
            const statusFilter = interaction.options.getString('status') || 'all';
            
            // Build query based on filters
            const query = {};
            if (typeFilter !== 'all') {
                query.type = typeFilter;
            }
            if (statusFilter !== 'all') {
                query.status = statusFilter;
            }
            
            // Get suggestions
            const suggestions = await Suggestion.find(query).sort({ suggestionDate: -1 });
            
            if (suggestions.length === 0) {
                return interaction.editReply(`No ${typeFilter !== 'all' ? typeFilter + ' ' : ''}suggestions found${statusFilter !== 'all' ? ' with status ' + statusFilter : ''}.`);
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setTitle('📋 Suggestion Management')
                .setDescription(`Found ${suggestions.length} suggestion(s)${typeFilter !== 'all' ? ' of type ' + typeFilter : ''}${statusFilter !== 'all' ? ' with status ' + statusFilter : ''}.`)
                .setColor('#FF9900')
                .setTimestamp();
                
            // Add suggestions (limit to 10 for readability)
            const displaySuggestions = suggestions.slice(0, 10);
            
            for (const suggestion of displaySuggestions) {
                let fieldValue = '';
                
                // Format field value based on suggestion type
                switch (suggestion.type) {
                    case 'arcade':
                    case 'racing':
                        fieldValue = `**Game:** ${suggestion.gameTitle} (${suggestion.consoleName})\n`;
                        if (suggestion.type === 'racing' && suggestion.trackName) {
                            fieldValue += `**Track:** ${suggestion.trackName}\n`;
                        }
                        fieldValue += `**Description:** ${suggestion.description.substring(0, 100)}${suggestion.description.length > 100 ? '...' : ''}\n`;
                        break;
                        
                    case 'bot':
                    case 'other':
                        fieldValue = `**Description:** ${suggestion.description.substring(0, 100)}${suggestion.description.length > 100 ? '...' : ''}\n`;
                        break;
                }
                
                fieldValue += `**By:** ${suggestion.suggestedBy} on ${new Date(suggestion.suggestionDate).toLocaleDateString()}\n`;
                fieldValue += `**Status:** ${suggestion.status}\n`;
                
                if (suggestion.adminResponse) {
                    fieldValue += `**Admin Response:** ${suggestion.adminResponse.substring(0, 100)}${suggestion.adminResponse.length > 100 ? '...' : ''}\n`;
                }
                
                fieldValue += `**ID:** \`${suggestion._id}\``;
                
                // Add icon based on type
                let icon = '';
                switch (suggestion.type) {
                    case 'arcade': icon = '🎯 '; break;
                    case 'racing': icon = '🏎️ '; break;
                    case 'bot': icon = '🤖 '; break;
                    case 'other': icon = '💡 '; break;
                }
                
                // Add icon based on status
                let statusIcon = '';
                switch (suggestion.status) {
                    case 'pending': statusIcon = '⏳ '; break;
                    case 'approved': statusIcon = '✅ '; break;
                    case 'rejected': statusIcon = '❌ '; break;
                    case 'implemented': statusIcon = '🚀 '; break;
                }
                
                const title = suggestion.title || suggestion.gameTitle;
                embed.addFields({
                    name: `${icon}${statusIcon}${title}`,
                    value: fieldValue
                });
            }
            
            // Add note if there are more suggestions
            if (suggestions.length > 10) {
                embed.addFields({
                    name: 'More Results',
                    value: `Showing 10 out of ${suggestions.length} suggestions. Use filters to narrow down results.`
                });
            }
            
            // Add usage instructions
            embed.addFields({
                name: 'Commands',
                value: '• Use `/suggestadmin view id:<suggestion_id>` to view a specific suggestion in detail.\n' +
                       '• Use `/suggestadmin update id:<suggestion_id> status:<status>` to update a suggestion status.\n' +
                       '• Use `/suggestadmin implement id:<suggestion_id>` to implement an arcade or racing suggestion.'
            });
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error listing suggestions:', error);
            return interaction.editReply('An error occurred while listing suggestions. Please try again.');
        }
    },

    async viewSuggestion(interaction) {
        try {
            const suggestionId = interaction.options.getString('id');
            
            // Get the suggestion
            const suggestion = await Suggestion.findById(suggestionId);
            
            if (!suggestion) {
                return interaction.editReply(`Suggestion with ID "${suggestionId}" not found.`);
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setTitle(`Suggestion: ${suggestion.title || suggestion.gameTitle}`)
                .setColor('#FF9900')
                .setTimestamp();
                
            // Add main content based on suggestion type
            let description = '';
            
            switch (suggestion.type) {
                case 'arcade':
                    description = `**Type:** Arcade Board Suggestion\n` +
                                 `**Game:** ${suggestion.gameTitle} (${suggestion.consoleName})\n` +
                                 `**Game ID:** ${suggestion.gameId}\n` +
                                 `**Description:** ${suggestion.description}\n\n` +
                                 `[View Game on RetroAchievements](https://retroachievements.org/game/${suggestion.gameId})`;
                    break;
                    
                case 'racing':
                    description = `**Type:** Racing Challenge Suggestion\n` +
                                 `**Game:** ${suggestion.gameTitle} (${suggestion.consoleName})\n` +
                                 `**Game ID:** ${suggestion.gameId}\n` +
                                 `**Track Name:** ${suggestion.trackName || 'N/A'}\n` +
                                 `**Description:** ${suggestion.description}\n\n` +
                                 `[View Game on RetroAchievements](https://retroachievements.org/game/${suggestion.gameId})`;
                    break;
                    
                case 'bot':
                    description = `**Type:** Bot Improvement Suggestion\n` +
                                 `**Feature:** ${suggestion.title}\n` +
                                 `**Description:** ${suggestion.description}`;
                    break;
                    
                case 'other':
                    description = `**Type:** Other Suggestion\n` +
                                 `**Title:** ${suggestion.title}\n` +
                                 `**Description:** ${suggestion.description}`;
                    break;
            }
            
            embed.setDescription(description);
            
            // Add metadata fields
            embed.addFields(
                {
                    name: 'Suggestion Info',
                    value: `**Suggested By:** ${suggestion.suggestedBy}\n` +
                           `**Date:** ${new Date(suggestion.suggestionDate).toLocaleString()}\n` +
                           `**Status:** ${suggestion.status}\n` +
                           `**ID:** \`${suggestion._id}\``
                }
            );
            
            // Add admin response if it exists
            if (suggestion.adminResponse) {
                embed.addFields(
                    {
                        name: 'Admin Response',
                        value: `**Response:** ${suggestion.adminResponse}\n` +
                               `**By:** ${suggestion.adminRespondedBy || 'Unknown'}\n` +
                               `**Date:** ${suggestion.adminResponseDate ? new Date(suggestion.adminResponseDate).toLocaleString() : 'N/A'}`
                    }
                );
            }
            
            // Add command options
            embed.addFields(
                {
                    name: 'Available Actions',
                    value: `• Update status: \`/suggestadmin update id:${suggestion._id} status:<status> [response:<text>]\`\n` +
                           (suggestion.type === 'arcade' || suggestion.type === 'racing' 
                               ? `• Implement: \`/suggestadmin implement id:${suggestion._id} board_id:<id> leaderboard_id:<id>\`\n` 
                               : '') +
                           `• Delete: \`/suggestadmin delete id:${suggestion._id}\``
                }
            );
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error viewing suggestion:', error);
            return interaction.editReply('An error occurred while viewing the suggestion. Please try again.');
        }
    },

    async updateSuggestion(interaction) {
        try {
            const suggestionId = interaction.options.getString('id');
            const newStatus = interaction.options.getString('status');
            const response = interaction.options.getString('response') || '';
            
            // Get the suggestion
            const suggestion = await Suggestion.findById(suggestionId);
            
            if (!suggestion) {
                return interaction.editReply(`Suggestion with ID "${suggestionId}" not found.`);
            }
            
            // Update the suggestion
            suggestion.status = newStatus;
            if (response) {
                suggestion.adminResponse = response;
                suggestion.adminResponseDate = new Date();
                suggestion.adminRespondedBy = interaction.user.tag;
            }
            
            await suggestion.save();
            
            // Get suggester's user object to notify them if enabled in config
            const notifyOnStatusChange = config.suggestions?.notifyOnStatusChange || false;
            if (notifyOnStatusChange) {
                try {
                    const user = await User.findOne({ discordId: suggestion.discordId });
                    if (user) {
                        // Try to DM the user
                        const member = await interaction.guild.members.fetch(suggestion.discordId);
                        if (member) {
                            try {
                                // Create a notification embed
                                const notifyEmbed = new EmbedBuilder()
                                    .setTitle('Suggestion Update')
                                    .setColor(
                                        newStatus === 'approved' ? '#00FF00' : 
                                        newStatus === 'rejected' ? '#FF0000' : 
                                        newStatus === 'implemented' ? '#0099FF' : '#FFCC00'
                                    )
                                    .setDescription(`Your suggestion has been ${newStatus}!`)
                                    .addFields(
                                        {
                                            name: 'Suggestion',
                                            value: suggestion.title || suggestion.gameTitle
                                        }
                                    );
                                    
                                if (response) {
                                    notifyEmbed.addFields(
                                        {
                                            name: 'Admin Response',
                                            value: response
                                        }
                                    );
                                }
                                
                                await member.send({ embeds: [notifyEmbed] });
                                console.log(`Sent suggestion update notification to ${user.raUsername}`);
                            } catch (dmError) {
                                console.error('Error sending DM to user:', dmError);
                                // Continue even if DM fails
                            }
                        }
                    }
                } catch (userError) {
                    console.error('Error finding/notifying user:', userError);
                    // Continue even if user notification fails
                }
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setTitle('Suggestion Updated')
                .setDescription(`Successfully updated suggestion status to **${newStatus}**.`)
                .setColor('#00FF00')
                .setTimestamp();
                
            embed.addFields(
                {
                    name: 'Suggestion',
                    value: `**ID:** \`${suggestion._id}\`\n` +
                           `**Title:** ${suggestion.title || suggestion.gameTitle}\n` +
                           `**By:** ${suggestion.suggestedBy}`
                }
            );
            
            if (response) {
                embed.addFields(
                    {
                        name: 'Response',
                        value: response
                    }
                );
            }
            
            // Add next steps based on type and status
            if (newStatus === 'approved' && (suggestion.type === 'arcade' || suggestion.type === 'racing')) {
                embed.addFields(
                    {
                        name: 'Next Steps',
                        value: `You can now implement this suggestion with:\n` +
                               `\`/suggestadmin implement id:${suggestion._id} board_id:<id> leaderboard_id:<id>\``
                    }
                );
            }
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error updating suggestion:', error);
            return interaction.editReply('An error occurred while updating the suggestion. Please try again.');
        }
    },

    async implementSuggestion(interaction) {
        try {
            const suggestionId = interaction.options.getString('id');
            const boardId = interaction.options.getString('board_id');
            const leaderboardId = interaction.options.getInteger('leaderboard_id');
            const customDescription = interaction.options.getString('description');
            
            // Get the suggestion
            const suggestion = await Suggestion.findById(suggestionId);
            
            if (!suggestion) {
                return interaction.editReply(`Suggestion with ID "${suggestionId}" not found.`);
            }
            
            // Validate suggestion type
            if (suggestion.type !== 'arcade' && suggestion.type !== 'racing') {
                return interaction.editReply(`Cannot implement a suggestion of type "${suggestion.type}". Only arcade and racing suggestions can be implemented.`);
            }
            
            // Check if board ID already exists
            const existingBoard = await ArcadeBoard.findOne({ boardId });
            if (existingBoard) {
                return interaction.editReply(`A board with ID "${boardId}" already exists.`);
            }
            
            // Validate game exists and get info
            const gameInfo = await retroAPI.getGameInfo(suggestion.gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }
            
            // Use the customDescription if provided, otherwise use the original suggestion description
            const description = customDescription || suggestion.description;
            
            // Create board based on suggestion type
            let newBoard;
            
            if (suggestion.type === 'arcade') {
                // Create new arcade board
                newBoard = new ArcadeBoard({
                    boardId,
                    boardType: 'arcade',
                    leaderboardId,
                    gameId: suggestion.gameId,
                    gameTitle: gameInfo.title,
                    consoleName: gameInfo.consoleName || 'Unknown',
                    description
                });
            } else if (suggestion.type === 'racing') {
                // For racing boards, we need to set up start and end dates
                const now = new Date();
                const year = now.getFullYear();
                const month = now.getMonth() + 1;
                
                // Calculate start and end dates (current month by default)
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 0, 23, 59, 59);
                
                // Generate month key
                const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
                
                // Get the full game title and console name
                const gameFull = `${gameInfo.title} (${gameInfo.consoleName})`;
                
                // Create new racing board
                newBoard = new ArcadeBoard({
                    boardId,
                    boardType: 'racing',
                    leaderboardId,
                    gameId: suggestion.gameId,
                    gameTitle: gameFull,
                    trackName: suggestion.trackName || '',
                    consoleName: gameInfo.consoleName || 'Unknown',
                    description,
                    startDate,
                    endDate,
                    monthKey
                });
            }
            
            // Save the new board
            await newBoard.save();
            
            // Update the suggestion status
            suggestion.status = 'implemented';
            suggestion.adminResponse = `Implemented as ${suggestion.type} board with ID: ${boardId}`;
            suggestion.adminResponseDate = new Date();
            suggestion.adminRespondedBy = interaction.user.tag;
            await suggestion.save();
            
            // Create notification for the user if enabled
            const notifyOnImplementation = config.suggestions?.notifyOnImplementation || false;
            if (notifyOnImplementation) {
                try {
                    // Try to DM the user
                    const member = await interaction.guild.members.fetch(suggestion.discordId);
                    if (member) {
                        try {
                            // Create a notification embed
                            const notifyEmbed = new EmbedBuilder()
                                .setTitle('Suggestion Implemented!')
                                .setColor('#0099FF')
                                .setDescription(`Your ${suggestion.type} suggestion has been implemented!`)
                                .addFields(
                                    {
                                        name: 'Suggestion',
                                        value: `**Game:** ${suggestion.gameTitle}` + 
                                               (suggestion.type === 'racing' && suggestion.trackName ? `\n**Track:** ${suggestion.trackName}` : '')
                                    },
                                    {
                                        name: 'Now Available',
                                        value: `You can check it out with the \`/arcade\` command!`
                                    }
                                );
                                
                            if (gameInfo.imageIcon) {
                                notifyEmbed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                            }
                                
                            await member.send({ embeds: [notifyEmbed] });
                        } catch (dmError) {
                            console.error('Error sending DM to user:', dmError);
                            // Continue even if DM fails
                        }
                    }
                } catch (userError) {
                    console.error('Error finding/notifying user:', userError);
                    // Continue even if user notification fails
                }
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setTitle(`${suggestion.type === 'arcade' ? 'Arcade Board' : 'Racing Challenge'} Created`)
                .setDescription(`Successfully implemented suggestion as a ${suggestion.type} board!`)
                .setColor('#00FF00')
                .setTimestamp();
                
            embed.addFields(
                {
                    name: 'Board Details',
                    value: `**Game:** ${gameInfo.title}\n` + 
                           `**Board ID:** ${boardId}\n` +
                           `**Leaderboard ID:** ${leaderboardId}\n` +
                           `**Description:** ${description}` +
                           (suggestion.type === 'racing' && suggestion.trackName ? `\n**Track:** ${suggestion.trackName}` : '')
                }
            );
            
            embed.addFields(
                {
                    name: 'Next Steps',
                    value: `• View the board with \`/arcade\`\n` +
                           `• Announce the board with \`/arcadeadmin announce board_id:${boardId}\``
                }
            );
            
            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error implementing suggestion:', error);
            return interaction.editReply('An error occurred while implementing the suggestion. Please try again.');
        }
    },

    async deleteSuggestion(interaction) {
        try {
            const suggestionId = interaction.options.getString('id');
            
            // Get the suggestion
            const suggestion = await Suggestion.findById(suggestionId);
            
            if (!suggestion) {
                return interaction.editReply(`Suggestion with ID "${suggestionId}" not found.`);
            }
            
            // Delete the suggestion
            await Suggestion.findByIdAndDelete(suggestionId);
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setTitle('Suggestion Deleted')
                .setDescription(`Successfully deleted the suggestion.`)
                .setColor('#FF0000')
                .setTimestamp();
                
            embed.addFields(
                {
                    name: 'Deleted Suggestion',
                    value: `**ID:** \`${suggestion._id}\`\n` +
                           `**Title:** ${suggestion.title || suggestion.gameTitle}\n` +
                           `**Type:** ${suggestion.type}\n` +
                           `**By:** ${suggestion.suggestedBy}`
                }
            );
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error deleting suggestion:', error);
            return interaction.editReply('An error occurred while deleting the suggestion. Please try again.');
        }
    }
};
