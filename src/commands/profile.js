// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');

function calculatePoints(awards) {
    let points = 0;
    if (awards.participation) points += 1;  // Participation
    if (awards.beaten) points += 3;         // Beaten
    if (awards.mastered) points += 3;       // Mastery
    return points;
}

module.exports = {
    name: 'profile',
    async execute(message, args) {
        try {
            const raUsername = args[0] || "royek";
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Profile for ${raUsername}`)
                .setThumbnail(`https://retroachievements.org/UserPic/${raUsername}.png`);

            const games = await Game.find({ year: 2025 }).sort({ month: 1 });
            const awards = await Award.find({ 
                raUsername, 
                year: 2025 
            }).sort({ month: 1 });

            let currentMonth = null;
            let monthText = '';
            let totalPoints = 0;

            // Process all awards
            for (const award of awards) {
                const month = award.month;
                // If we're starting a new month, add the previous month's text
                if (currentMonth !== month) {
                    if (monthText) {
                        embed.addFields({ 
                            name: currentMonth === 1 ? 'January' : 'February', 
                            value: monthText 
                        });
                    }
                    currentMonth = month;
                    monthText = '';
                }

                // Find the corresponding game to get type
                const game = games.find(g => g.gameId === award.gameId);
                if (!game) continue;

                monthText += `**${game.title}** (${game.type})\n`;
                monthText += `▫️ Progress: ${award.achievementCount}/${award.totalAchievements} (${award.userCompletion})\n`;
                
                // Build award display
                let awardText = [];
                if (award.awards.participation) awardText.push("🏁P");
                if (award.awards.beaten) awardText.push("⭐B");
                if (award.awards.mastered) awardText.push("✨M");
                
                const points = calculatePoints(award.awards);
                totalPoints += points;
                monthText += `▫️ ${awardText.join(" + ")} = ${points}pts\n\n`;
            }

            // Add the last month's text if any
            if (monthText) {
                embed.addFields({ 
                    name: currentMonth === 1 ? 'January' : 'February', 
                    value: monthText 
                });
            }

            // Add total points
            embed.addFields({
                name: 'Total Points',
                value: `**${totalPoints}** points earned in 2025`,
                inline: false
            });

            // Send the embed
            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            message.reply('Error getting profile data.');
        }
    }
};