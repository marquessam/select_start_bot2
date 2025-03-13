import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('challenge')
        .setDescription('Shows current monthly challenge and shadow game status'),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const lastDayOfMonth = new Date(nextMonthStart - 86400000).toISOString().split('T')[0];

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            // Create embed for display
            const embed = new EmbedBuilder()
                .setColor('#32CD32')  // Lime green color
                .setTitle('CURRENT CHALLENGES')
                .setDescription('**[DATABASE ACCESS GRANTED]**');

            // Add monthly challenge info
            if (currentChallenge && currentChallenge.monthly_challange_gameid) {
                // Get game info from RetroAchievements API
                const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
                
                // Format dates
                const startDate = currentMonthStart.toISOString().split('T')[0];
                
                // Build challenge text
                let challengeText = 
                    `**GAME:** "${gameInfo.title}"\n` +
                    `**DATES:** ${startDate} to ${lastDayOfMonth}\n\n` +
                    `**POINTS AVAILABLE:**\n` +
                    `- Participation: 1 point\n` +
                    `- Game Completion: 3 points (${currentChallenge.monthly_challange_goal} achievements)\n` +
                    `- Mastery: 3 points (${currentChallenge.monthly_challange_game_total} achievements)\n\n` +
                    `**RULES:**\n` +
                    `- Complete at least ${currentChallenge.monthly_challange_goal} of ${currentChallenge.monthly_challange_game_total} achievements\n` +
                    `- Earn "beaten" status by reaching the goal\n` +
                    `- Earn "mastery" status by completing all achievements`;
                
                embed.addFields({ name: 'MONTHLY CHALLENGE', value: challengeText });

                if (gameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }

                // Add link to game
                embed.setURL(`https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid}`);
            } else {
                embed.addFields({ name: 'MONTHLY CHALLENGE', value: 'No active challenge found for the current month.' });
            }

            // Shadow game display based on revealed status
            if (currentChallenge && currentChallenge.shadow_challange_gameid) {
                if (currentChallenge.shadow_challange_revealed) {
                    // Shadow game is revealed - show the game info
                    const shadowGameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                    
                    let shadowText = 
                        `**GAME:** ${shadowGameInfo.title}\n\n` +
                        `**POINTS AVAILABLE:**\n` +
                        `- Participation: 1 point\n` +
                        `- Completion: 3 points (${currentChallenge.shadow_challange_goal} achievements)\n` +
                        `- Mastery: 3 points (${currentChallenge.shadow_challange_game_total} achievements)\n\n` +
                        `This challenge runs parallel to the monthly challenge.`;
                    
                    embed.addFields({ name: 'SHADOW CHALLENGE UNLOCKED', value: shadowText });
                } else {
                    // Shadow game is hidden
                    let shadowText = 
                        `*An ancient power stirs in the shadows...*\n` +
                        `*But its presence remains hidden.*\n\n` +
                        `The shadow challenge will be revealed at the admins' discretion.`;
                    
                    embed.addFields({ name: 'SHADOW CHALLENGE', value: shadowText });
                }
            } else {
                embed.addFields({ name: 'SHADOW CHALLENGE', value: 'No shadow challenge is set for the current month.' });
            }

            // Add random terminal ID and timestamp
            embed.setFooter({ text: `TERMINAL_ID: ${generateTerminalId()}` });
            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Challenge Command Error:', error);
            await interaction.editReply('**[ERROR]** Failed to retrieve challenge data. Please try again.');
        }
    }
};

// Helper function to generate a random terminal ID (preserved from original command)
function generateTerminalId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 7; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
