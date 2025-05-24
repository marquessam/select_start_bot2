// src/commands/admin/restrictionManager.js

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { config } from '../../config/config.js';
import { NominationSettings } from '../../models/NominationSettings.js';
import { 
    CONSOLE_GROUPS, 
    PUBLISHER_GROUPS, 
    GENRE_GROUPS, 
    QUICK_PRESETS,
    RuleBuilder,
    RestrictionRuleEngine
} from '../../config/consoleGroups.js';
import enhancedRetroAPI from '../../services/enhancedRetroAPI.js';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export default {
    data: new SlashCommandBuilder()
        .setName('restrictions')
        .setDescription('Advanced nomination restriction management')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        
        // Status and overview
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current restriction settings and active rules')
        )
        
        // Quick presets
        .addSubcommand(subcommand =>
            subcommand
                .setName('preset')
                .setDescription('Apply a quick preset restriction')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Month (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addStringOption(option =>
                    option
                        .setName('preset')
                        .setDescription('Preset to apply')
                        .setRequired(true)
                        .addChoices(
                            ...Object.keys(QUICK_PRESETS).map(key => ({
                                name: QUICK_PRESETS[key].name,
                                value: key
                            }))
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName('year')
                        .setDescription('Specific year (optional)')
                        .setRequired(false)
                        .setMinValue(2024)
                        .setMaxValue(2030)
                )
        )
        
        // Console group restrictions
        .addSubcommand(subcommand =>
            subcommand
                .setName('console-group')
                .setDescription('Restrict to specific console groups')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Month (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addStringOption(option =>
                    option
                        .setName('groups')
                        .setDescription('Console groups (comma-separated)')
                        .setRequired(true)
                        .addChoices(
                            ...Object.keys(CONSOLE_GROUPS).map(key => ({
                                name: CONSOLE_GROUPS[key].name,
                                value: key
                            }))
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('operation')
                        .setDescription('How to combine multiple groups')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Any group (OR)', value: 'OR' },
                            { name: 'All groups (AND)', value: 'AND' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('Custom restriction title')
                        .setRequired(false)
                )
        )
        
        // Publisher restrictions  
        .addSubcommand(subcommand =>
            subcommand
                .setName('publisher')
                .setDescription('Restrict by publisher')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Month (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addStringOption(option =>
                    option
                        .setName('publishers')
                        .setDescription('Publisher groups or custom names (comma-separated)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('Restriction title')
                        .setRequired(true)
                )
        )
        
        // Year-based restrictions
        .addSubcommand(subcommand =>
            subcommand
                .setName('year-range')
                .setDescription('Restrict by game release year')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Month (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('min-year')
                        .setDescription('Minimum year (inclusive)')
                        .setRequired(false)
                        .setMinValue(1970)
                        .setMaxValue(2024)
                )
                .addIntegerOption(option =>
                    option
                        .setName('max-year')
                        .setDescription('Maximum year (inclusive)')
                        .setRequired(false)
                        .setMinValue(1970)
                        .setMaxValue(2024)
                )
                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('Restriction title')
                        .setRequired(true)
                )
        )
        
        // Remove restrictions
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove restriction for a month')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Month (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('year')
                        .setDescription('Specific year (optional)')
                        .setRequired(false)
                        .setMinValue(2024)
                        .setMaxValue(2030)
                )
        )
        
        // Toggle restrictions
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable/disable restriction without removing')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Month (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable')
                        .setRequired(true)
                )
        )
        
        // Test restrictions
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Test a game against current restrictions')
                .addIntegerOption(option =>
                    option
                        .setName('gameid')
                        .setDescription('RetroAchievements Game ID')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Month to test against (default: current)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
        )
        
        // List available groups
        .addSubcommand(subcommand =>
            subcommand
                .setName('groups')
                .setDescription('List available console/publisher groups')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Type of groups to show')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Console Groups', value: 'consoles' },
                            { name: 'Publisher Groups', value: 'publishers' },
                            { name: 'Genre Groups', value: 'genres' },
                            { name: 'Quick Presets', value: 'presets' }
                        )
                )
        ),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const modifiedBy = {
            discordId: interaction.user.id,
            username: interaction.user.tag
        };

        try {
            switch(subcommand) {
                case 'status':
                    await this.handleStatus(interaction);
                    break;
                case 'preset':
                    await this.handlePreset(interaction, modifiedBy);
                    break;
                case 'console-group':
                    await this.handleConsoleGroup(interaction, modifiedBy);
                    break;
                case 'publisher':
                    await this.handlePublisher(interaction, modifiedBy);
                    break;
                case 'year-range':
                    await this.handleYearRange(interaction, modifiedBy);
                    break;
                case 'remove':
                    await this.handleRemove(interaction, modifiedBy);
                    break;
                case 'toggle':
                    await this.handleToggle(interaction, modifiedBy);
                    break;
                case 'test':
                    await this.handleTest(interaction);
                    break;
                case 'groups':
                    await this.handleGroups(interaction);
                    break;
                default:
                    await interaction.editReply('Invalid subcommand.');
            }
        } catch (error) {
            console.error('Error managing restrictions:', error);
            await interaction.editReply(`An error occurred: ${error.message}`);
        }
    },

    async handleStatus(interaction) {
        const settings = await NominationSettings.getSettings();
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentRestriction = settings.getCurrentMonthRestriction(now);
        const nominationsOpen = settings.areNominationsOpen(now);

        const embed = new EmbedBuilder()
            .setTitle('🎮 Advanced Restriction Status')
            .setColor(nominationsOpen ? '#00FF00' : '#FF0000')
            .setTimestamp();

        // Current status
        embed.addFields({
            name: '📊 Overall Status',
            value: `Nominations: ${nominationsOpen ? '✅ Open' : '❌ Closed'}\n` +
                   `Default Mode: ${settings.defaultRestricted ? '🔒 Restricted' : '🔓 Open'}\n` +
                   `Close Days: Last ${settings.nominationCloseDays} days`,
            inline: false
        });

        // Current month restriction
        if (currentRestriction) {
            const ruleCount = currentRestriction.restrictionRule.rules.conditions?.length || 0;
            embed.addFields({
                name: `${currentRestriction.restrictionRule.emoji} Current Restriction`,
                value: `**${currentRestriction.restrictionRule.name}**\n` +
                       `${currentRestriction.restrictionRule.description}\n` +
                       `Logic: ${currentRestriction.restrictionRule.rules.type || 'AND'}\n` +
                       `Rules: ${ruleCount} condition(s)\n` +
                       `Status: ${currentRestriction.enabled ? '✅ Active' : '❌ Disabled'}`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '📅 Current Month',
                value: settings.defaultRestricted ? 
                    '🔒 No specific restrictions (default restricted)' : 
                    '🔓 No restrictions active',
                inline: false
            });
        }

        // All active restrictions
        const activeRestrictions = settings.monthlyRestrictions.filter(r => r.enabled);
        if (activeRestrictions.length > 0) {
            const restrictionList = activeRestrictions.map(r => {
                const monthName = MONTH_NAMES[r.month];
                const yearText = r.year ? ` ${r.year}` : '';
                const ruleCount = r.restrictionRule.rules.conditions?.length || 0;
                return `${r.restrictionRule.emoji} **${monthName}${yearText}**: ${r.restrictionRule.name} (${ruleCount} rules)`;
            }).join('\n');
            
            embed.addFields({
                name: '📋 All Active Restrictions',
                value: restrictionList.length > 1000 ? 
                    restrictionList.substring(0, 1000) + '...' : 
                    restrictionList,
                inline: false
            });
        }

        // Available quick actions
        embed.addFields({
            name: '⚡ Quick Actions',
            value: '• `/restrictions preset` - Apply quick presets\n' +
                   '• `/restrictions console-group` - Group-based restrictions\n' +
                   '• `/restrictions test gameid:XXXXX` - Test a game\n' +
                   '• `/restrictions groups` - View available groups',
            inline: false
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handlePreset(interaction, modifiedBy) {
        const month = interaction.options.getInteger('month') - 1;
        const presetName = interaction.options.getString('preset');
        const year = interaction.options.getInteger('year');

        const preset = QUICK_PRESETS[presetName];
        if (!preset) {
            return interaction.editReply(`❌ Preset "${presetName}" not found.`);
        }

        const settings = await NominationSettings.getSettings();
        
        try {
            settings.applyQuickPreset(month, year, presetName);
            settings.lastModifiedBy = modifiedBy;
            await settings.save();

            const monthName = MONTH_NAMES[month];
            const yearText = year ? ` ${year}` : ' (all years)';

            await interaction.editReply(
                `✅ **${preset.name}** preset applied to **${monthName}${yearText}**\n\n` +
                `${preset.emoji} ${preset.description}`
            );
        } catch (error) {
            await interaction.editReply(`❌ Error applying preset: ${error.message}`);
        }
    },

    async handleConsoleGroup(interaction, modifiedBy) {
        const month = interaction.options.getInteger('month') - 1;
        const groupNames = interaction.options.getString('groups').split(',').map(g => g.trim());
        const operation = interaction.options.getString('operation') || 'OR';
        const customTitle = interaction.options.getString('title');

        // Validate groups
        const validGroups = groupNames.filter(name => CONSOLE_GROUPS[name]);
        if (validGroups.length === 0) {
            return interaction.editReply('❌ No valid console groups specified.');
        }

        // Build conditions
        const conditions = validGroups.map(groupName => 
            RuleBuilder.consoleGroup(groupName)
        );

        // Create restriction rule
        const firstGroup = CONSOLE_GROUPS[validGroups[0]];
        const restrictionRule = {
            name: customTitle || `${validGroups.map(g => CONSOLE_GROUPS[g].name).join(' + ')} Month`,
            description: `Only games from: ${validGroups.map(g => CONSOLE_GROUPS[g].name).join(', ')}`,
            emoji: firstGroup.emoji,
            color: firstGroup.color,
            enabled: true,
            rules: {
                type: operation,
                conditions
            }
        };

        const settings = await NominationSettings.getSettings();
        settings.addMonthlyRestriction(month, null, restrictionRule);
        settings.lastModifiedBy = modifiedBy;
        await settings.save();

        const monthName = MONTH_NAMES[month];
        await interaction.editReply(
            `✅ **Console group restriction** applied to **${monthName}**\n\n` +
            `${restrictionRule.emoji} ${restrictionRule.description}`
        );
    },

    async handlePublisher(interaction, modifiedBy) {
        const month = interaction.options.getInteger('month') - 1;
        const publishersInput = interaction.options.getString('publishers');
        const title = interaction.options.getString('title');

        // Parse publishers (could be group names or custom names)
        const publisherNames = publishersInput.split(',').map(p => p.trim());
        const conditions = [];

        publisherNames.forEach(name => {
            if (PUBLISHER_GROUPS[name.toUpperCase()]) {
                // It's a group
                conditions.push(RuleBuilder.publisherGroup(name.toUpperCase()));
            } else {
                // It's a custom publisher name
                conditions.push(RuleBuilder.publisher(name));
            }
        });

        const restrictionRule = {
            name: title,
            description: `Only games from publishers: ${publisherNames.join(', ')}`,
            emoji: '🏢',
            color: '#4682B4',
            enabled: true,
            rules: {
                type: 'OR',
                conditions
            }
        };

        const settings = await NominationSettings.getSettings();
        settings.addMonthlyRestriction(month, null, restrictionRule);
        settings.lastModifiedBy = modifiedBy;
        await settings.save();

        const monthName = MONTH_NAMES[month];
        await interaction.editReply(
            `✅ **Publisher restriction** applied to **${monthName}**\n\n` +
            `🏢 ${restrictionRule.description}`
        );
    },

    async handleYearRange(interaction, modifiedBy) {
        const month = interaction.options.getInteger('month') - 1;
        const minYear = interaction.options.getInteger('min-year');
        const maxYear = interaction.options.getInteger('max-year');
        const title = interaction.options.getString('title');

        if (!minYear && !maxYear) {
            return interaction.editReply('❌ You must specify at least one year boundary.');
        }

        const conditions = [];
        let description = 'Games ';

        if (minYear && maxYear) {
            conditions.push(RuleBuilder.yearRange(minYear, maxYear));
            description += `from ${minYear}-${maxYear}`;
        } else if (minYear) {
            conditions.push(RuleBuilder.afterYear(minYear - 1));
            description += `from ${minYear} onwards`;
        } else {
            conditions.push(RuleBuilder.beforeYear(maxYear + 1));
            description += `before ${maxYear + 1}`;
        }

        const restrictionRule = {
            name: title,
            description,
            emoji: '📅',
            color: '#8B4513',
            enabled: true,
            rules: {
                type: 'AND',
                conditions
            }
        };

        const settings = await NominationSettings.getSettings();
        settings.addMonthlyRestriction(month, null, restrictionRule);
        settings.lastModifiedBy = modifiedBy;
        await settings.save();

        const monthName = MONTH_NAMES[month];
        await interaction.editReply(
            `✅ **Year-based restriction** applied to **${monthName}**\n\n` +
            `📅 ${description}`
        );
    },

    async handleRemove(interaction, modifiedBy) {
        const month = interaction.options.getInteger('month') - 1;
        const year = interaction.options.getInteger('year');

        const settings = await NominationSettings.getSettings();
        const removed = settings.removeMonthlyRestriction(month, year);

        if (!removed) {
            const monthName = MONTH_NAMES[month];
            const yearText = year ? ` ${year}` : '';
            return interaction.editReply(`❌ No restriction found for **${monthName}${yearText}**.`);
        }

        settings.lastModifiedBy = modifiedBy;
        await settings.save();

        const monthName = MONTH_NAMES[month];
        const yearText = year ? ` ${year}` : '';
        await interaction.editReply(`✅ Restriction removed for **${monthName}${yearText}**.`);
    },

    async handleToggle(interaction, modifiedBy) {
        const month = interaction.options.getInteger('month') - 1;
        const enabled = interaction.options.getBoolean('enabled');

        const settings = await NominationSettings.getSettings();
        const success = settings.toggleMonthlyRestriction(month, null, enabled);

        if (!success) {
            const monthName = MONTH_NAMES[month];
            return interaction.editReply(`❌ No restriction found for **${monthName}**.`);
        }

        settings.lastModifiedBy = modifiedBy;
        await settings.save();

        const monthName = MONTH_NAMES[month];
        const status = enabled ? 'enabled' : 'disabled';
        await interaction.editReply(`✅ Restriction for **${monthName}** has been **${status}**.`);
    },

    async handleTest(interaction) {
        const gameId = interaction.options.getInteger('gameid');
        const testMonth = interaction.options.getInteger('month');

        try {
            // Get game details
            const gameData = await enhancedRetroAPI.getGameDetails(gameId);
            
            // Get settings and test date
            const settings = await NominationSettings.getSettings();
            const testDate = testMonth ? 
                new Date(new Date().getFullYear(), testMonth - 1, 15) : 
                new Date();

            // Test the game
            const allowed = settings.isGameAllowed(gameData, testDate);
            const restriction = settings.getCurrentMonthRestriction(testDate);

            const embed = new EmbedBuilder()
                .setTitle('🧪 Game Restriction Test')
                .setColor(allowed ? '#00FF00' : '#FF0000')
                .setThumbnail(`https://retroachievements.org${gameData.imageIcon}`)
                .addFields(
                    { name: '🎮 Game', value: gameData.title, inline: true },
                    { name: '🎯 Console', value: gameData.consoleName, inline: true },
                    { name: '🏢 Publisher', value: gameData.publisher || 'Unknown', inline: true },
                    { name: '👨‍💻 Developer', value: gameData.developer || 'Unknown', inline: true },
                    { name: '🎭 Genre', value: gameData.genre || 'Unknown', inline: true },
                    { name: '📅 Released', value: gameData.released || 'Unknown', inline: true },
                    { 
                        name: '✅ Result', 
                        value: allowed ? '**ALLOWED**' : '**BLOCKED**', 
                        inline: false 
                    }
                );

            if (restriction && !allowed) {
                embed.addFields({
                    name: '🚫 Blocked By',
                    value: `${restriction.restrictionRule.emoji} **${restriction.restrictionRule.name}**\n${restriction.restrictionRule.description}`,
                    inline: false
                });
            }

            if (testMonth) {
                const monthName = MONTH_NAMES[testMonth - 1];
                embed.setFooter({ text: `Tested against ${monthName} restrictions` });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply(`❌ Error testing game: ${error.message}`);
        }
    },

    async handleGroups(interaction) {
        const type = interaction.options.getString('type') || 'consoles';

        const embed = new EmbedBuilder()
            .setTitle('📋 Available Groups & Presets')
            .setColor('#0099FF')
            .setTimestamp();

        switch (type) {
            case 'consoles':
                Object.entries(CONSOLE_GROUPS).forEach(([key, group]) => {
                    const consoleList = group.consoles.slice(0, 5).join(', ') + 
                        (group.consoles.length > 5 ? `, +${group.consoles.length - 5} more` : '');
                    
                    embed.addFields({
                        name: `${group.emoji} ${group.name}`,
                        value: consoleList,
                        inline: false
                    });
                });
                break;

            case 'publishers':
                Object.entries(PUBLISHER_GROUPS).forEach(([key, publishers]) => {
                    embed.addFields({
                        name: `🏢 ${key}`,
                        value: publishers.join(', '),
                        inline: true
                    });
                });
                break;

            case 'genres':
                Object.entries(GENRE_GROUPS).forEach(([key, group]) => {
                    embed.addFields({
                        name: `${group.emoji} ${group.name}`,
                        value: group.genres.join(', '),
                        inline: false
                    });
                });
                break;

            case 'presets':
                Object.entries(QUICK_PRESETS).forEach(([key, preset]) => {
                    embed.addFields({
                        name: `${preset.emoji} ${preset.name}`,
                        value: preset.description,
                        inline: false
                    });
                });
                break;
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
