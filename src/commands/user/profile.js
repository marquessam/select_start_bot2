// SIMPLIFIED FIX - Just update the handleTrophyCaseButton method in profile.js
// Replace this method in your existing profile.js:

async handleTrophyCaseButton(interaction, user) {
    // STEP 1: Get Challenge documents for title lookups
    const challenges = await Challenge.find({}).sort({ date: 1 });
    const challengeTitleMap = {};
    
    // Build a lookup map for game titles
    for (const challenge of challenges) {
        const monthKey = this.getMonthKey(challenge.date);
        challengeTitleMap[monthKey] = {
            monthly: challenge.monthly_game_title,
            shadow: challenge.shadow_game_title
        };
    }

    console.log('Challenge title map:', challengeTitleMap);

    // STEP 2: Generate trophies with Challenge document fallback
    const trophies = [];

    // Process monthly challenges
    for (const [monthKey, data] of user.monthlyChallenges.entries()) {
        if (data.progress > 0) {
            let awardLevel = 'participation';
            if (data.progress === 3) awardLevel = 'mastery';
            else if (data.progress === 2) awardLevel = 'beaten';

            const dateParts = monthKey.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            const trophyDate = new Date(year, month, 15);

            // Use Challenge document title as fallback
            let gameTitle = data.gameTitle; // User data first
            
            if (!gameTitle && challengeTitleMap[monthKey]?.monthly) {
                gameTitle = challengeTitleMap[monthKey].monthly; // Challenge document fallback
                console.log(`Using Challenge document title for ${monthKey}: ${gameTitle}`);
            }
            
            if (!gameTitle) {
                gameTitle = `Monthly Challenge - ${this.formatShortDate(monthKey)}`; // Final fallback
            }

            trophies.push({
                gameId: `monthly_${monthKey}`,
                gameTitle: gameTitle,
                consoleName: 'Monthly Challenge',
                awardLevel: awardLevel,
                challengeType: 'monthly',
                emojiId: null,
                emojiName: this.getTrophyEmoji(awardLevel),
                earnedAt: trophyDate,
                monthKey: monthKey
            });
        }
    }

    // Process shadow challenges
    for (const [monthKey, data] of user.shadowChallenges.entries()) {
        if (data.progress > 0) {
            let awardLevel = 'participation';
            if (data.progress === 2) awardLevel = 'beaten';

            const dateParts = monthKey.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            const trophyDate = new Date(year, month, 15);

            // Use Challenge document title as fallback
            let gameTitle = data.gameTitle; // User data first
            
            if (!gameTitle && challengeTitleMap[monthKey]?.shadow) {
                gameTitle = challengeTitleMap[monthKey].shadow; // Challenge document fallback
                console.log(`Using Challenge document shadow title for ${monthKey}: ${gameTitle}`);
            }
            
            if (!gameTitle) {
                gameTitle = `Shadow Challenge - ${this.formatShortDate(monthKey)}`; // Final fallback
            }

            trophies.push({
                gameId: `shadow_${monthKey}`,
                gameTitle: gameTitle,
                consoleName: 'Shadow Challenge',
                awardLevel: awardLevel,
                challengeType: 'shadow',
                emojiId: null,
                emojiName: this.getTrophyEmoji(awardLevel),
                earnedAt: trophyDate,
                monthKey: monthKey
            });
        }
    }

    // Process community awards (unchanged)
    const currentYear = new Date().getFullYear();
    const communityAwards = user.getCommunityAwardsForYear(currentYear);
    
    for (const award of communityAwards) {
        trophies.push({
            gameId: `community_${award.title.replace(/\s+/g, '_').toLowerCase()}`,
            gameTitle: award.title,
            consoleName: 'Community',
            awardLevel: 'special',
            challengeType: 'community',
            emojiId: null,
            emojiName: '🏆',
            earnedAt: award.awardedAt,
            monthKey: null
        });
    }

    // Sort by earned date (most recent first)
    trophies.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));

    if (trophies.length === 0) {
        return interaction.editReply({
            content: '🏆 This trophy case is empty! \n\n' +
                     '**How to earn trophies:**\n' +
                     '• Complete monthly challenges (mastery, beaten, or participation)\n' +
                     '• Complete shadow challenges when they\'re revealed\n' +
                     '• Earn community awards\n\n' +
                     '💡 **Achievement trophies are automatically generated from your progress!**',
            ephemeral: true
        });
    }

    // STEP 3: Group and display trophies (rest of the method unchanged)
    const groupedTrophies = {
        monthly: { mastery: [], beaten: [], participation: [] },
        shadow: { mastery: [], beaten: [], participation: [] },
        community: { special: [] }
    };

    trophies.forEach(trophy => {
        if (groupedTrophies[trophy.challengeType] && groupedTrophies[trophy.challengeType][trophy.awardLevel]) {
            groupedTrophies[trophy.challengeType][trophy.awardLevel].push(trophy);
        }
    });

    const embed = new EmbedBuilder()
        .setTitle(`🏆 ${user.raUsername}'s Trophy Case`)
        .setColor('#FFD700') // Gold color
        .setDescription(`**Achievement Trophies:** ${trophies.length}`)
        .setTimestamp();

    // Add fields for each category
    ['monthly', 'shadow', 'community'].forEach(challengeType => {
        const categoryTrophies = groupedTrophies[challengeType];
        if (!categoryTrophies) return;

        Object.keys(categoryTrophies).forEach(awardLevel => {
            const levelTrophies = categoryTrophies[awardLevel];
            if (levelTrophies.length === 0) return;

            let emoji = '🏆';
            let typeName = challengeType;
            let levelName = awardLevel;

            if (awardLevel === 'mastery') emoji = '✨';
            else if (awardLevel === 'beaten') emoji = '⭐';
            else if (awardLevel === 'participation') emoji = '🏁';
            else if (awardLevel === 'special') emoji = '🎖️';

            typeName = challengeType.charAt(0).toUpperCase() + challengeType.slice(1);
            levelName = awardLevel.charAt(0).toUpperCase() + awardLevel.slice(1);

            const fieldName = `${emoji} ${typeName} ${levelName} (${levelTrophies.length})`;
            
            let fieldValue = '';
            levelTrophies.slice(0, 8).forEach(trophy => {
                const shortDate = this.formatShortDate(trophy.monthKey || '2025-01');
                
                const trophyEmoji = trophy.emojiId ? 
                    `<:${trophy.emojiName}:${trophy.emojiId}>` : 
                    (trophy.emojiName || emoji);
                
                fieldValue += `${trophyEmoji} **${trophy.gameTitle}** - ${shortDate}\n`;
            });

            if (levelTrophies.length > 8) {
                fieldValue += `*...and ${levelTrophies.length - 8} more*\n`;
            }

            embed.addFields({ name: fieldName, value: fieldValue, inline: true });
        });
    });

    embed.setFooter({ 
        text: 'Achievement trophies are earned by completing challenges and awards' 
    });

    await interaction.editReply({
        embeds: [embed],
        ephemeral: true
    });
},

// Add these helper methods to your profile.js if they don't exist:
getMonthKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
},

formatShortDate(monthKey) {
    const dateParts = monthKey.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const shortYear = year.toString().slice(-2);
    const monthName = monthNames[month - 1];
    
    return `${monthName} ${shortYear}`;
},

getTrophyEmoji(awardLevel) {
    const emojiMap = {
        mastery: '✨',
        beaten: '⭐', 
        participation: '🏁'
    };
    return emojiMap[awardLevel] || '🏆';
}
