// src/commands/admin/trophyfix.js - Admin command to diagnose and fix duplicate trophies
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('trophyfix')
        .setDescription('Diagnose and fix duplicate trophy issues (Admin only)')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Diagnose Only', value: 'diagnose' },
                    { name: 'Fix Duplicates', value: 'fix' },
                    { name: 'Check User', value: 'check_user' }
                ))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Specific username to check (for check_user action)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('detailed')
                .setDescription('Show detailed output')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Check admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ This command requires Administrator permissions.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const action = interaction.options.getString('action');
            const username = interaction.options.getString('username');
            const detailed = interaction.options.getBoolean('detailed') || false;

            const fixService = new TrophyFixService();

            switch (action) {
                case 'diagnose':
                    await this.handleDiagnose(interaction, fixService, detailed);
                    break;
                case 'fix':
                    await this.handleFix(interaction, fixService, detailed);
                    break;
                case 'check_user':
                    await this.handleCheckUser(interaction, fixService, username);
                    break;
                default:
                    await interaction.editReply('❌ Unknown action specified.');
            }

        } catch (error) {
            console.error('Error in trophyfix command:', error);
            await interaction.editReply(`❌ An error occurred: ${error.message}`);
        }
    },

    async handleDiagnose(interaction, fixService, detailed) {
        await interaction.editReply('🔍 Running diagnostic scan...');

        const result = await fixService.analyzeCurrentDuplicates();
        
        const embed = new EmbedBuilder()
            .setTitle('🔍 Trophy Duplicate Diagnostic Report')
            .setColor('#FFA500')
            .setTimestamp();

        // Summary
        embed.addFields({
            name: '📊 Summary',
            value: `👥 **Users Checked:** ${result.totalUsers}\n` +
                   `🚨 **Affected Users:** ${result.affectedUsers.length}\n` +
                   `📅 **Monthly Duplicates:** ${result.totalMonthlyDuplicates}\n` +
                   `🌑 **Shadow Duplicates:** ${result.totalShadowDuplicates}\n` +
                   `🎯 **Total Issues:** ${result.totalMonthlyDuplicates + result.totalShadowDuplicates}`,
            inline: false
        });

        // Current month specific
        if (result.currentMonthIssues) {
            embed.addFields({
                name: '🗓️ Current Month (Dec 2024)',
                value: result.currentMonthIssues || 'No current month issues detected',
                inline: false
            });
        }

        // Top affected users
        if (result.affectedUsers.length > 0) {
            const topUsers = result.affectedUsers
                .slice(0, 5)
                .map(user => {
                    const monthlyCount = user.monthlyDuplicates.count;
                    const shadowCount = user.shadowDuplicates.count;
                    return `• **${user.username}**: ${monthlyCount}M, ${shadowCount}S`;
                })
                .join('\n');

            embed.addFields({
                name: '👥 Top Affected Users',
                value: topUsers + (result.affectedUsers.length > 5 ? `\n*...and ${result.affectedUsers.length - 5} more*` : ''),
                inline: false
            });
        }

        // Detailed breakdown if requested
        if (detailed && result.affectedUsers.length > 0) {
            let detailText = '';
            for (const user of result.affectedUsers.slice(0, 3)) {
                detailText += `**${user.username}:**\n`;
                if (user.monthlyDuplicates.count > 0) {
                    detailText += `  📅 Monthly: ${user.monthlyDuplicates.details.map(d => d.normalizedKey).join(', ')}\n`;
                }
                if (user.shadowDuplicates.count > 0) {
                    detailText += `  🌑 Shadow: ${user.shadowDuplicates.details.map(d => d.normalizedKey).join(', ')}\n`;
                }
                detailText += '\n';
            }

            if (detailText.length > 0) {
                embed.addFields({
                    name: '🔍 Detailed Breakdown',
                    value: detailText.substring(0, 1000) + (detailText.length > 1000 ? '...' : ''),
                    inline: false
                });
            }
        }

        // Recommendations
        let recommendations = '';
        if (result.totalMonthlyDuplicates + result.totalShadowDuplicates > 0) {
            recommendations = '🔧 **Recommended Action:** Run `/trophyfix action:Fix Duplicates` to resolve issues\n';
            recommendations += '⚠️ **Impact:** This will clean up duplicate entries and correct point calculations\n';
            recommendations += '💾 **Backup:** Consider backing up the database before fixing';
        } else {
            recommendations = '✅ **Status:** No duplicates detected - system is healthy!\n';
            recommendations += '🎯 **Action:** No action needed at this time';
        }

        embed.addFields({
            name: '💡 Recommendations',
            value: recommendations,
            inline: false
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleFix(interaction, fixService, detailed) {
        await interaction.editReply('🔧 Analyzing duplicates before fixing...');

        // First diagnose
        const analysis = await fixService.analyzeCurrentDuplicates();
        
        if (analysis.totalMonthlyDuplicates + analysis.totalShadowDuplicates === 0) {
            const embed = new EmbedBuilder()
                .setTitle('✅ No Duplicates Found')
                .setColor('#00FF00')
                .setDescription('No duplicate trophies detected. The system is already clean!')
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        await interaction.editReply('🔧 Fixing duplicate trophies... Please wait...');

        // Run the fix
        const fixResult = await fixService.diagnoseAndFixDuplicates();

        const embed = new EmbedBuilder()
            .setTitle('🛠️ Trophy Fix Complete')
            .setColor('#00FF00')
            .setTimestamp();

        embed.addFields({
            name: '📊 Fix Results',
            value: `👥 **Users Fixed:** ${fixResult.totalFixedUsers}\n` +
                   `🗑️ **Duplicates Removed:** ${fixResult.totalDuplicatesRemoved}\n` +
                   `⏱️ **Processing Time:** ${fixResult.processingTime || 'N/A'}\n` +
                   `✅ **Status:** ${fixResult.totalDuplicatesRemoved > 0 ? 'Successfully resolved all duplicates' : 'No changes needed'}`,
            inline: false
        });

        if (fixResult.fixedUsers && fixResult.fixedUsers.length > 0) {
            const fixedUsersList = fixResult.fixedUsers
                .slice(0, 10)
                .map(user => `• **${user.username}**: -${user.duplicatesRemoved} duplicates`)
                .join('\n');

            embed.addFields({
                name: '👥 Fixed Users',
                value: fixedUsersList + (fixResult.fixedUsers.length > 10 ? `\n*...and ${fixResult.fixedUsers.length - 10} more*` : ''),
                inline: false
            });
        }

        embed.addFields({
            name: '💡 Next Steps',
            value: '• Run `/trophyfix action:Diagnose Only` to verify the fix\n' +
                   '• Check affected users\' profiles to confirm trophy counts\n' +
                   '• Monitor leaderboard for accurate point calculations\n' +
                   '• Deploy updated profile.js and statsUpdateService.js to prevent future duplicates',
            inline: false
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleCheckUser(interaction, fixService, username) {
        if (!username) {
            return interaction.editReply('❌ Please provide a username to check.');
        }

        await interaction.editReply(`🔍 Checking user: ${username}...`);

        const user = await User.findOne({ 
            raUsername: { $regex: new RegExp('^' + username + '$', 'i') }
        });

        if (!user) {
            return interaction.editReply(`❌ User '${username}' not found.`);
        }

        const analysis = fixService.analyzeUserDuplicates(user);

        const embed = new EmbedBuilder()
            .setTitle(`🔍 User Analysis: ${user.raUsername}`)
            .setColor(analysis.hasIssues ? '#FFA500' : '#00FF00')
            .setTimestamp();

        // Monthly challenges analysis
        let monthlyText = '';
        if (analysis.monthlyDuplicates.count > 0) {
            monthlyText = `🚨 **${analysis.monthlyDuplicates.count} duplicates found**\n`;
            analysis.monthlyDuplicates.details.slice(0, 3).forEach(detail => {
                monthlyText += `• ${detail.normalizedKey}: ${detail.keys.join(', ')}\n`;
            });
        } else {
            monthlyText = '✅ No duplicates detected';
        }

        embed.addFields({
            name: '📅 Monthly Challenges',
            value: monthlyText,
            inline: false
        });

        // Shadow challenges analysis
        let shadowText = '';
        if (analysis.shadowDuplicates.count > 0) {
            shadowText = `🚨 **${analysis.shadowDuplicates.count} duplicates found**\n`;
            analysis.shadowDuplicates.details.slice(0, 3).forEach(detail => {
                shadowText += `• ${detail.normalizedKey}: ${detail.keys.join(', ')}\n`;
            });
        } else {
            shadowText = '✅ No duplicates detected';
        }

        embed.addFields({
            name: '🌑 Shadow Challenges',
            value: shadowText,
            inline: false
        });

        // Current totals
        const monthlyEntries = user.monthlyChallenges ? user.monthlyChallenges.size : 0;
        const shadowEntries = user.shadowChallenges ? user.shadowChallenges.size : 0;
        
        embed.addFields({
            name: '📊 Current Totals',
            value: `📅 **Monthly Entries:** ${monthlyEntries}\n` +
                   `🌑 **Shadow Entries:** ${shadowEntries}\n` +
                   `🏆 **GP Balance:** ${user.gpBalance || 0}`,
            inline: true
        });

        // December 2024 specific check
        const dec2024Monthly = user.monthlyChallenges ? 
            Array.from(user.monthlyChallenges.entries()).filter(([key]) => 
                fixService.normalizeMonthKey(key) === '2024-12'
            ) : [];
        
        if (dec2024Monthly.length > 0) {
            let dec2024Text = '';
            dec2024Monthly.forEach(([key, data]) => {
                dec2024Text += `• ${key}: ${data.progress} pts, ${data.gameTitle || 'No title'}\n`;
            });
            
            embed.addFields({
                name: '🗓️ December 2024 Details',
                value: dec2024Text.substring(0, 1000),
                inline: false
            });
        }

        if (analysis.hasIssues) {
            embed.addFields({
                name: '🔧 Recommended Action',
                value: 'Run `/trophyfix action:Fix Duplicates` to resolve these duplicates automatically.',
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};

class TrophyFixService {
    async analyzeCurrentDuplicates() {
        const startTime = Date.now();
        const users = await User.find({});
        let totalMonthlyDuplicates = 0;
        let totalShadowDuplicates = 0;
        let affectedUsers = [];
        let currentMonthIssues = '';

        for (const user of users) {
            const analysis = this.analyzeUserDuplicates(user);
            
            if (analysis.monthlyDuplicates.count > 0 || analysis.shadowDuplicates.count > 0) {
                affectedUsers.push({
                    username: user.raUsername,
                    monthlyDuplicates: analysis.monthlyDuplicates,
                    shadowDuplicates: analysis.shadowDuplicates
                });
                totalMonthlyDuplicates += analysis.monthlyDuplicates.count;
                totalShadowDuplicates += analysis.shadowDuplicates.count;

                // Check for December 2024 specifically
                const dec2024Issues = this.checkDecember2024Issues(user);
                if (dec2024Issues) {
                    currentMonthIssues += `• ${user.raUsername}: ${dec2024Issues}\n`;
                }
            }
        }

        return {
            totalUsers: users.length,
            affectedUsers,
            totalMonthlyDuplicates,
            totalShadowDuplicates,
            currentMonthIssues,
            processingTime: `${Date.now() - startTime}ms`
        };
    }

    analyzeUserDuplicates(user) {
        const monthlyDuplicates = this.findDuplicatesInMap(user.monthlyChallenges);
        const shadowDuplicates = this.findDuplicatesInMap(user.shadowChallenges);
        
        return {
            hasIssues: monthlyDuplicates.count > 0 || shadowDuplicates.count > 0,
            monthlyDuplicates,
            shadowDuplicates
        };
    }

    checkDecember2024Issues(user) {
        const monthlyEntries = user.monthlyChallenges ? 
            Array.from(user.monthlyChallenges.entries()).filter(([key]) => 
                this.normalizeMonthKey(key) === '2024-12'
            ) : [];
        
        const shadowEntries = user.shadowChallenges ? 
            Array.from(user.shadowChallenges.entries()).filter(([key]) => 
                this.normalizeMonthKey(key) === '2024-12'
            ) : [];

        let issues = '';
        if (monthlyEntries.length > 1) {
            issues += `${monthlyEntries.length} monthly entries`;
        }
        if (shadowEntries.length > 1) {
            if (issues) issues += ', ';
            issues += `${shadowEntries.length} shadow entries`;
        }

        return issues;
    }

    findDuplicatesInMap(challengeMap) {
        if (!challengeMap || challengeMap.size === 0) {
            return { count: 0, details: [] };
        }
        
        const entries = Array.from(challengeMap.entries());
        const grouped = new Map();
        
        for (const [key, data] of entries) {
            const normalized = this.normalizeMonthKey(key);
            
            if (!grouped.has(normalized)) {
                grouped.set(normalized, { keys: [], data: [] });
            }
            
            grouped.get(normalized).keys.push(key);
            grouped.get(normalized).data.push(data);
        }
        
        const duplicates = [];
        let count = 0;
        
        for (const [normalizedKey, group] of grouped) {
            if (group.keys.length > 1) {
                duplicates.push({
                    normalizedKey,
                    keys: group.keys,
                    data: group.data
                });
                count += group.keys.length - 1;
            }
        }
        
        return { count, details: duplicates };
    }

    async diagnoseAndFixDuplicates() {
        const startTime = Date.now();
        const users = await User.find({});
        let totalFixedUsers = 0;
        let totalDuplicatesRemoved = 0;
        let fixedUsers = [];
        
        for (const user of users) {
            const result = await this.fixUserDuplicates(user);
            if (result.fixed) {
                totalFixedUsers++;
                totalDuplicatesRemoved += result.duplicatesRemoved;
                fixedUsers.push({
                    username: user.raUsername,
                    duplicatesRemoved: result.duplicatesRemoved
                });
            }
        }
        
        return { 
            totalFixedUsers, 
            totalDuplicatesRemoved, 
            fixedUsers,
            processingTime: `${Date.now() - startTime}ms`
        };
    }

    async fixUserDuplicates(user) {
        let fixed = false;
        let duplicatesRemoved = 0;
        
        // Fix monthly challenges
        const monthlyResult = this.deduplicateMap(user.monthlyChallenges);
        if (monthlyResult.hasDuplicates) {
            user.monthlyChallenges = monthlyResult.cleanedMap;
            fixed = true;
            duplicatesRemoved += monthlyResult.duplicatesFound;
        }
        
        // Fix shadow challenges  
        const shadowResult = this.deduplicateMap(user.shadowChallenges);
        if (shadowResult.hasDuplicates) {
            user.shadowChallenges = shadowResult.cleanedMap;
            fixed = true;
            duplicatesRemoved += shadowResult.duplicatesFound;
        }
        
        if (fixed) {
            await user.save();
        }
        
        return { fixed, duplicatesRemoved };
    }

    deduplicateMap(challengeMap) {
        if (!challengeMap || challengeMap.size === 0) {
            return { hasDuplicates: false, cleanedMap: challengeMap, duplicatesFound: 0 };
        }
        
        const entries = Array.from(challengeMap.entries());
        const groupedByMonth = new Map();
        let duplicatesFound = 0;
        
        for (const [originalKey, data] of entries) {
            const normalizedKey = this.normalizeMonthKey(originalKey);
            
            if (groupedByMonth.has(normalizedKey)) {
                duplicatesFound++;
                
                const existing = groupedByMonth.get(normalizedKey);
                if (data.progress > existing.data.progress || 
                    (data.progress === existing.data.progress && (data.achievements || 0) > (existing.data.achievements || 0))) {
                    groupedByMonth.set(normalizedKey, { key: originalKey, data });
                }
            } else {
                groupedByMonth.set(normalizedKey, { key: originalKey, data });
            }
        }
        
        const cleanedMap = new Map();
        for (const [normalizedKey, { data }] of groupedByMonth) {
            cleanedMap.set(normalizedKey, data);
        }
        
        return {
            hasDuplicates: duplicatesFound > 0,
            cleanedMap,
            duplicatesFound
        };
    }

    normalizeMonthKey(dateKey) {
        if (!dateKey) return dateKey;
        
        const keyStr = String(dateKey).trim();
        
        if (/^\d{4}-\d{2}$/.test(keyStr)) {
            return keyStr;
        }
        
        if (/^\d{4}-\d{2}-\d{2}$/.test(keyStr)) {
            return keyStr.substring(0, 7);
        }
        
        try {
            const date = new Date(keyStr);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                return `${year}-${month}`;
            }
        } catch (error) {
            // Ignore parsing errors
        }
        
        return keyStr;
    }
}
