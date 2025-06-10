// Add this debug command to src/commands/admin/debug-profile.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';

const POINTS = {
    MASTERY: 7,
    BEATEN: 4,
    PARTICIPATION: 1
};

export default {
    data: new SlashCommandBuilder()
        .setName('debug-profile')
        .setDescription('Debug profile points calculation (Admin only)')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Username to debug')
                .setRequired(true)),

    async execute(interaction) {
        // Check admin permissions
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        if (!adminRoleId || !interaction.member.roles.cache.has(adminRoleId)) {
            return interaction.reply({ 
                content: '❌ This command requires administrator permissions.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const username = interaction.options.getString('username');
            
            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply(`❌ User "${username}" not found.`);
            }

            // Raw data inspection
            let debugInfo = `## Debug Info for ${user.raUsername}\n\n`;
            
            // Check monthly challenges raw data
            debugInfo += `### Monthly Challenges (${user.monthlyChallenges?.size || 0} entries)\n`;
            if (user.monthlyChallenges && user.monthlyChallenges.size > 0) {
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    debugInfo += `**${monthKey}**: progress=${data.progress}, achievements=${data.achievements || 'N/A'}, gameTitle=${data.gameTitle || 'N/A'}\n`;
                }
            } else {
                debugInfo += "No monthly challenge data found\n";
            }
            
            debugInfo += "\n";
            
            // Check shadow challenges raw data  
            debugInfo += `### Shadow Challenges (${user.shadowChallenges?.size || 0} entries)\n`;
            if (user.shadowChallenges && user.shadowChallenges.size > 0) {
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    debugInfo += `**${monthKey}**: progress=${data.progress}, achievements=${data.achievements || 'N/A'}, gameTitle=${data.gameTitle || 'N/A'}\n`;
                }
            } else {
                debugInfo += "No shadow challenge data found\n";
            }
            
            debugInfo += "\n";

            // Calculate points step by step
            debugInfo += `### Points Calculation\n`;
            let challengePoints = 0;
            let stats = { mastery: 0, beaten: 0, participation: 0, shadowBeaten: 0, shadowParticipation: 0 };
            
            // Process monthly challenges
            if (user.monthlyChallenges && user.monthlyChallenges.size > 0) {
                debugInfo += `**Monthly Processing:**\n`;
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    debugInfo += `- ${monthKey}: progress=${data.progress} → `;
                    
                    if (data.progress === 3) {
                        stats.mastery++;
                        challengePoints += POINTS.MASTERY;
                        debugInfo += `MASTERY (+${POINTS.MASTERY} pts)\n`;
                    } else if (data.progress === 2) {
                        stats.beaten++;
                        challengePoints += POINTS.BEATEN;
                        debugInfo += `BEATEN (+${POINTS.BEATEN} pts)\n`;
                    } else if (data.progress === 1) {
                        stats.participation++;
                        challengePoints += POINTS.PARTICIPATION;
                        debugInfo += `PARTICIPATION (+${POINTS.PARTICIPATION} pts)\n`;
                    } else {
                        debugInfo += `NO POINTS (unexpected progress value)\n`;
                    }
                }
            }
            
            // Process shadow challenges
            if (user.shadowChallenges && user.shadowChallenges.size > 0) {
                debugInfo += `**Shadow Processing:**\n`;
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    debugInfo += `- ${monthKey}: progress=${data.progress} → `;
                    
                    if (data.progress === 2) {
                        stats.shadowBeaten++;
                        challengePoints += POINTS.BEATEN;
                        debugInfo += `SHADOW BEATEN (+${POINTS.BEATEN} pts)\n`;
                    } else if (data.progress === 1) {
                        stats.shadowParticipation++;
                        challengePoints += POINTS.PARTICIPATION;
                        debugInfo += `SHADOW PARTICIPATION (+${POINTS.PARTICIPATION} pts)\n`;
                    } else {
                        debugInfo += `NO POINTS (unexpected progress value)\n`;
                    }
                }
            }
            
            const currentYear = new Date().getFullYear();
            const communityPoints = user.getCommunityPointsForYear ? user.getCommunityPointsForYear(currentYear) : 0;
            
            debugInfo += `\n### Final Results\n`;
            debugInfo += `Challenge Points: ${challengePoints}\n`;
            debugInfo += `Community Points: ${communityPoints}\n`;
            debugInfo += `**Total Points: ${challengePoints + communityPoints}**\n\n`;
            
            debugInfo += `Stats: ${JSON.stringify(stats, null, 2)}\n\n`;
            
            // Check community awards
            debugInfo += `### Community Awards (${currentYear})\n`;
            if (user.communityAwards && user.communityAwards.length > 0) {
                const yearAwards = user.communityAwards.filter(award => 
                    award.awardedAt.getFullYear() === currentYear
                );
                debugInfo += `Found ${yearAwards.length} awards for ${currentYear}\n`;
                yearAwards.forEach(award => {
                    debugInfo += `- ${award.title}: ${award.points} pts (${award.awardedAt.toISOString()})\n`;
                });
            } else {
                debugInfo += "No community awards found\n";
            }

            // Check for potential issues
            debugInfo += `\n### Potential Issues\n`;
            
            // Check for unexpected progress values
            const unexpectedValues = [];
            if (user.monthlyChallenges) {
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    if (![1, 2, 3].includes(data.progress) && data.progress > 0) {
                        unexpectedValues.push(`Monthly ${monthKey}: ${data.progress}`);
                    }
                }
            }
            if (user.shadowChallenges) {
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    if (![1, 2].includes(data.progress) && data.progress > 0) {
                        unexpectedValues.push(`Shadow ${monthKey}: ${data.progress}`);
                    }
                }
            }
            
            if (unexpectedValues.length > 0) {
                debugInfo += `⚠️ Unexpected progress values found:\n${unexpectedValues.join('\n')}\n`;
            } else {
                debugInfo += `✅ All progress values are in expected format\n`;
            }
            
            // Check for duplicates
            const monthlyKeys = user.monthlyChallenges ? Array.from(user.monthlyChallenges.keys()) : [];
            const shadowKeys = user.shadowChallenges ? Array.from(user.shadowChallenges.keys()) : [];
            
            debugInfo += `Monthly keys: ${monthlyKeys.join(', ')}\n`;
            debugInfo += `Shadow keys: ${shadowKeys.join(', ')}\n`;

            // Split into chunks if too long for Discord
            const chunks = this.splitIntoChunks(debugInfo, 4000);
            
            for (let i = 0; i < chunks.length; i++) {
                const embed = new EmbedBuilder()
                    .setTitle(i === 0 ? `Profile Debug: ${user.raUsername}` : `Debug (continued ${i + 1})`)
                    .setDescription(`\`\`\`\n${chunks[i]}\`\`\``)
                    .setColor('#FFA500')
                    .setTimestamp();

                if (i === 0) {
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                }
            }

        } catch (error) {
            console.error('Error in debug-profile:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Debug Failed')
                .setColor('#FF0000')
                .setDescription(`Error: ${error.message}`)
                .setTimestamp();
                
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    splitIntoChunks(text, maxLength) {
        const chunks = [];
        let currentChunk = '';
        
        const lines = text.split('\n');
        
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk);
                    currentChunk = '';
                }
            }
            currentChunk += line + '\n';
        }
        
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }
};
