import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import retroAPI from '../../services/retroAPI.js';

// Helper function to check if a challenge is from a past month
function isPastChallenge(challengeDate) {
    const now = new Date();
    // Challenge is in the past if it's from a previous month or previous year
    return (challengeDate.getFullYear() < now.getFullYear()) ||
           (challengeDate.getFullYear() === now.getFullYear() && 
            challengeDate.getMonth() < now.getMonth());
}

export default {
    data: new SlashCommandBuilder()
        .setName('challenge')
        .setDescription('Shows current monthly challenge, shadow game, and racing challenge status'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            
            // Last day of the month at 11:59 PM
            const lastDayOfMonth = new Date(nextMonthStart - 1);
            lastDayOfMonth.setHours(23, 59, 59);
            const lastDayTimestamp = Math.floor(lastDayOfMonth.getTime() / 1000);
            
            // String format for fallback/display
            const lastDayOfMonthStr = lastDayOfMonth.toISOString().split('T')[0];

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            // Get current racing challenge
            const activeRacing = await ArcadeBoard.findOne({
                boardType: 'racing',
                startDate: { $lte: now },
                endDate: { $gte: now }
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
                
                // Get progression and win achievement counts
                const progressionCount = currentChallenge.monthly_challange_progression_achievements.length;
                const winCount = currentChallenge.monthly_challange_win_achievements.length;
                
                // Build challenge text with clarified point structure
                let challengeText = 
                    `**GAME:** "${gameInfo.title}"\n` +
                    `**DATES:** ${startDate} to <t:${lastDayTimestamp}:F>\n\n` +
                    `**POINTS AVAILABLE (CUMULATIVE):**\n` +
                    `- Participation: 1 point\n` +
                    `- Beaten: 4 points total (1 for participation + 3 for completion)\n` +
                    `- Mastery: 7 points total (1 for participation + 3 for beaten + 3 for mastery)\n\n` +
                    `**RULES:**\n` +
                    `- To earn "beaten" status, all ${progressionCount} progression achievements must be completed` +
                    (winCount > 0 ? ` and at least one of the ${winCount} win achievements must be earned` : '') + `\n` +
                    `- Earn "mastery" status by completing all achievements\n\n` +
                    `**MONTHLY PRIZES:**\n` +
                    `- Top 3 players will receive recognition and prizes`;
                
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
                // Check if it's a past challenge (automatically revealed) or currently revealed
                const isPast = isPastChallenge(currentChallenge.date);
                const isRevealed = isPast || currentChallenge.shadow_challange_revealed;
                
                if (isRevealed) {
                    // Shadow game is revealed - show the game info
                    const shadowGameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                    
                    // Get progression and win achievement counts for shadow
                    const progressionCount = currentChallenge.shadow_challange_progression_achievements.length;
                    const winCount = currentChallenge.shadow_challange_win_achievements.length;
                    
                    let shadowText = 
                        `**GAME:** ${shadowGameInfo.title}\n\n` +
                        `**POINTS AVAILABLE (CUMULATIVE):**\n` +
                        `- Participation: 1 point\n` +
                        `- Beaten: 4 points total (1 for participation + 3 for completion)\n\n` +
                        `This challenge requires all ${progressionCount} progression achievements` +
                        (winCount > 0 ? ` and at least one win achievement` : '') + ` to be completed.\n\n` +
                        `This challenge runs parallel to the monthly challenge.\n` +
                        `*Note: Shadow games are ineligible for mastery awards.*`;
                    
                    embed.addFields({ name: 'SHADOW CHALLENGE UNLOCKED', value: shadowText });
                } else {
                    // Shadow game is hidden
                    let shadowText = 
                        `*An ancient power stirs in the shadows...*\n` +
                        `*But its presence remains hidden.*\n\n` +
                        `The shadow challenge will be revealed at the admins' discretion.\n` +
                        `Use \`/shadowguess\` to attempt to unlock it.`;
                    
                    embed.addFields({ name: 'SHADOW CHALLENGE', value: shadowText });
                }
            } else {
                embed.addFields({ name: 'SHADOW CHALLENGE', value: 'No shadow challenge is set for the current month.' });
            }

            // Add racing challenge information
            if (activeRacing) {
                try {
                    // Get game info for thumbnail
                    const gameInfo = await retroAPI.getGameInfo(activeRacing.gameId);
                    
                    // Generate full title with track name
                    const trackDisplay = activeRacing.trackName 
                        ? ` - ${activeRacing.trackName}`
                        : '';
                        
                    const gameDisplay = `${activeRacing.gameTitle}${trackDisplay}`;
                    
                    // Calculate end date timestamp
                    const endTimestamp = Math.floor(activeRacing.endDate.getTime() / 1000);
                    
                    let racingText = 
                        `**GAME:** ${gameDisplay}\n` +
                        `**ENDS:** <t:${endTimestamp}:F> (<t:${endTimestamp}:R>)\n\n` +
                        `**POINTS AVAILABLE:**\n` +
                        `- 1st Place: 3 points\n` +
                        `- 2nd Place: 2 points\n` +
                        `- 3rd Place: 1 point\n\n` +
                        `Use \`/arcade racing\` for full details and leaderboard.`;
                    
                    embed.addFields({ name: 'RACING CHALLENGE', value: racingText });
                } catch (error) {
                    console.error('Error fetching racing challenge details:', error);
                    embed.addFields({ 
                        name: 'RACING CHALLENGE', 
                        value: 'A racing challenge is currently active. Use `/arcade racing` for details.' 
                    });
                }
            } else {
                embed.addFields({ 
                    name: 'RACING CHALLENGE', 
                    value: 'No racing challenge is currently active. Check `/arcade races` for upcoming challenges.' 
                });
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
