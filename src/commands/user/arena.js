// src/commands/user/arena.js - UPDATED with gear for creator, crown for #1
import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ButtonBuilder, 
    ActionRowBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import { ArenaChallenge } from '../../models/ArenaChallenge.js';
import arenaService from '../../services/arenaService.js';
import arenaUtils from '../../utils/arenaUtils.js';
import gpUtils from '../../utils/gpUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Access the Arena challenge system - create challenges, place bets, and compete!'),

    async execute(interaction) {
        // Get or create user
        let user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
            return interaction.reply({
                content: '❌ You need to register with the bot first. Please use `/register` to link your RetroAchievements account.',
                ephemeral: true
            });
        }

        await this.showArenaMenu(interaction, user);
    },

    async showArenaMenu(interaction, user) {
        // Get active challenges count
        const activeChallenges = await arenaService.getActiveChallenges(5);
        const userChallenges = await arenaService.getUserChallenges(user.discordId, 3);
        
        // Format last GP grant date
        const lastGrantText = user.lastMonthlyGpGrant 
            ? user.lastMonthlyGpGrant.toLocaleDateString()
            : 'Never';
        
        const embed = new EmbedBuilder()
            .setTitle('🏟️ Welcome to the Arena!')
            .setDescription(
                `**${user.raUsername}**, ready to compete?\n\n` +
                `💰 **Your GP Balance:** ${gpUtils.formatGP(user.gpBalance || 0)}\n` +
                `🏆 **Challenges Won:** ${user.arenaStats?.challengesWon || 0}\n` +
                `🎯 **Win Rate:** ${user.getGpWinRate()}%\n` +
                `📅 **Last GP Grant:** ${lastGrantText}\n` +
                `🎁 **Next GP Grant:** Automatic on 1st of next month\n\n` +
                `🔥 **Active Challenges:** ${activeChallenges.length}\n` +
                `📋 **Your Active:** ${userChallenges.filter(c => c.status === 'active' || c.status === 'pending').length}\n\n` +
                `Select an action from the menu below:`
            )
            .setColor('#00FF00')
            .setThumbnail('https://cdn.discordapp.com/emojis/853287407997755412.png') // Arena icon
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('arena_action_select')
            .setPlaceholder('🎮 Choose your arena action...')
            .addOptions([
                {
                    label: 'Create Challenge',
                    description: 'Start a new 1v1 or open challenge',
                    value: 'create_challenge',
                    emoji: '⚔️'
                },
                {
                    label: 'View & Join Challenges',
                    description: 'See all current challenges and join them',
                    value: 'view_active',
                    emoji: '🔥'
                },
                {
                    label: 'My Challenges',
                    description: 'View your challenge history and status',
                    value: 'my_challenges',
                    emoji: '📋'
                },
                {
                    label: 'Place Bet',
                    description: 'Browse challenges to bet on',
                    value: 'browse_betting',
                    emoji: '🎰'
                },
                {
                    label: 'View Balance & Transactions',
                    description: 'Check your GP balance and transaction history',
                    value: 'view_balance',
                    emoji: '💰'
                },
                {
                    label: 'Leaderboards',
                    description: 'View GP and arena statistics rankings',
                    value: 'leaderboards',
                    emoji: '🏆'
                },
                {
                    label: 'How to Play',
                    description: 'Learn how the Arena system works',
                    value: 'help',
                    emoji: '❓'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Quick action buttons (removed claim button)
        const quickButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arena_quick_create')
                    .setLabel('Quick Challenge')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚔️'),
                new ButtonBuilder()
                    .setCustomId('arena_quick_active')
                    .setLabel('View & Join')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔥'),
                new ButtonBuilder()
                    .setCustomId('arena_refresh')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
            );

        // Make the response ephemeral (only visible to the user who used the command)
        await interaction.reply({
            embeds: [embed],
            components: [row, quickButtons],
            ephemeral: true // This makes it only visible to the user
        });
    },

    async handleBalance(interaction, user) {
        const transactions = await gpUtils.getTransactionHistory(user, 10);
        
        // Format last GP grant date
        const lastGrantText = user.lastMonthlyGpGrant 
            ? user.lastMonthlyGpGrant.toLocaleDateString()
            : 'Never';
        
        const embed = new EmbedBuilder()
            .setTitle('💰 Your Arena Balance')
            .setDescription(
                `**Current Balance:** ${gpUtils.formatGP(user.gpBalance || 0)}\n` +
                `**Last GP Grant:** ${lastGrantText}\n` +
                `**Next GP Grant:** Automatic on 1st of next month (1,000 GP)\n\n` +
                `**Arena Stats:**\n` +
                `🏆 Challenges Won: ${user.arenaStats?.challengesWon || 0}\n` +
                `🎯 Challenges Participated: ${user.arenaStats?.challengesParticipated || 0}\n` +
                `💎 Total GP Won: ${gpUtils.formatGP(user.arenaStats?.totalGpWon || 0)}\n` +
                `💸 Total GP Wagered: ${gpUtils.formatGP(user.arenaStats?.totalGpWagered || 0)}\n` +
                `🎰 Bets Won: ${user.arenaStats?.betsWon || 0}/${user.arenaStats?.betsPlaced || 0}`
            )
            .setColor('#0099FF')
            .setTimestamp();

        if (transactions.length > 0) {
            const transactionText = transactions
                .map(tx => {
                    const formatted = gpUtils.formatTransaction(tx);
                    const date = tx.timestamp.toLocaleDateString();
                    return `${formatted.emoji} **${formatted.amount} GP** - ${formatted.description} *(${date})*`;
                })
                .join('\n');
            
            embed.addFields({
                name: '📝 Recent Transactions (Last 10)',
                value: transactionText.length > 1024 ? transactionText.substring(0, 1021) + '...' : transactionText,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleLeaderboard(interaction) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('arena_leaderboard_select')
            .setPlaceholder('Choose leaderboard type')
            .addOptions([
                {
                    label: 'GP Balance',
                    description: 'Top users by current GP balance',
                    value: 'gp',
                    emoji: '💰'
                },
                {
                    label: 'Challenges Won',
                    description: 'Top users by challenges won',
                    value: 'wins',
                    emoji: '🏆'
                },
                {
                    label: 'Total GP Won',
                    description: 'Top users by total GP won',
                    value: 'total_won',
                    emoji: '💎'
                },
                {
                    label: 'Bet Win Rate',
                    description: 'Top users by betting success',
                    value: 'bet_rate',
                    emoji: '🎰'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '🏆 **Arena Leaderboards**\nSelect which leaderboard you\'d like to view:',
            components: [row],
            ephemeral: true
        });
    },

    async displayLeaderboard(interaction, type) {
        await interaction.deferUpdate();

        let leaderboard, title, description;

        try {
            switch (type) {
                case 'gp':
                    leaderboard = await gpUtils.getGPLeaderboard(10);
                    title = '💰 GP Balance Leaderboard';
                    description = 'Top users by current GP balance';
                    break;
                case 'wins':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('challengesWon', 10);
                    title = '🏆 Challenge Winners Leaderboard';
                    description = 'Top users by challenges won';
                    break;
                case 'total_won':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('totalGpWon', 10);
                    title = '💎 Total GP Won Leaderboard';
                    description = 'Top users by total GP won from challenges';
                    break;
                case 'bet_rate':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('betsWon', 10);
                    title = '🎰 Betting Champions Leaderboard';
                    description = 'Top users by betting success';
                    break;
                default:
                    leaderboard = await gpUtils.getGPLeaderboard(10);
                    title = '💰 GP Balance Leaderboard';
                    description = 'Top users by current GP balance';
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('#FFD700')
                .setTimestamp();

            if (leaderboard.length === 0) {
                embed.addFields({ name: 'No Data', value: 'No users found for this leaderboard.', inline: false });
            } else {
                const leaderboardText = leaderboard
                    .map(user => {
                        const medal = user.rank === 1 ? '🥇' : user.rank === 2 ? '🥈' : user.rank === 3 ? '🥉' : `${user.rank}.`;
                        
                        switch (type) {
                            case 'gp':
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.gpBalance)}`;
                            case 'wins':
                                return `${medal} **${user.raUsername}** - ${user.challengesWon} wins (${user.winRate}% win rate)`;
                            case 'total_won':
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.totalGpWon)} total won`;
                            case 'bet_rate':
                                return `${medal} **${user.raUsername}** - ${user.betsWon}/${user.betsPlaced} bets (${user.betWinRate}%)`;
                            default:
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.gpBalance)}`;
                        }
                    })
                    .join('\n');

                embed.addFields({ name: 'Rankings', value: leaderboardText, inline: false });
            }

            // Add system stats
            const systemStats = await gpUtils.getSystemGPStats();
            embed.addFields({
                name: '📊 System Statistics',
                value: 
                    `Total Users: ${systemStats.totalUsers}\n` +
                    `Users with GP: ${systemStats.usersWithGP}\n` +
                    `Total GP in circulation: ${gpUtils.formatGP(systemStats.totalGP)}\n` +
                    `Total challenges created: ${systemStats.totalChallengesCreated}`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed], components: [] });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching the leaderboard. Please try again.',
                components: []
            });
        }
    },

    // UPDATED: Now includes current scores and gear for creator, crown for #1
    async handleViewActive(interaction) {
        console.log('=== HANDLE VIEW ACTIVE CALLED ===');
        console.log('User:', interaction.user.username);
        
        await interaction.deferReply({ ephemeral: true });

        try {
            const activeChallenges = await arenaService.getActiveChallenges(10);
            console.log(`Found ${activeChallenges.length} active challenges`);
            
            if (activeChallenges.length === 0) {
                return interaction.editReply({
                    content: '🔥 **No Active Challenges**\n\nThere are currently no active challenges. Be the first to create one using the "Create Challenge" option!'
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🔥 Active Challenges')
                .setDescription('Current challenges you can join or bet on. Click the buttons below to interact with each challenge.')
                .setColor('#FF6600')
                .setTimestamp();

            // Show up to 5 challenges with detailed info including current scores
            const challengesToShow = activeChallenges.slice(0, 5);
            let embedDescription = '';
            
            for (let index = 0; index < challengesToShow.length; index++) {
                const challenge = challengesToShow[index];
                console.log(`Processing challenge ${index + 1}: ${challenge.challengeId}`);
                
                const typeEmoji = challenge.type === 'direct' ? '⚔️' : '🌍';
                const statusEmoji = challenge.status === 'pending' ? '⏳' : '🔥';
                
                embedDescription += `**${index + 1}. ${typeEmoji} ${challenge.gameTitle}**\n`;
                embedDescription += `${statusEmoji} ${challenge.status.toUpperCase()} | `;
                embedDescription += `${challenge.description || 'No description'}\n`;
                embedDescription += `⚙️ Created by: ${challenge.creatorRaUsername}\n`; // UPDATED: Changed to gear
                embedDescription += `💰 Wager: ${gpUtils.formatGP(challenge.participants[0]?.wager || 0)} | `;
                embedDescription += `👥 Players: ${challenge.participants.length}`;
                
                if (challenge.bets && challenge.bets.length > 0) {
                    embedDescription += ` | 🎰 Bets: ${challenge.bets.length}`;
                }
                
                // UPDATED: Add current scores/standings for this challenge
                if (challenge.participants.length > 0) {
                    try {
                        const participantUsernames = challenge.participants.map(p => p.raUsername);
                        const currentScores = await arenaUtils.fetchLeaderboardScores(
                            challenge.gameId,
                            challenge.leaderboardId,
                            participantUsernames
                        );
                        
                        if (currentScores && currentScores.length > 0) {
                            // Sort by rank and show current standings
                            currentScores.sort((a, b) => {
                                if (a.rank === null && b.rank === null) return 0;
                                if (a.rank === null) return 1;
                                if (b.rank === null) return -1;
                                return a.rank - b.rank;
                            });
                            
                            embedDescription += `\n📊 Current Standings:\n`;
                            currentScores.forEach((score, scoreIndex) => {
                                const standing = scoreIndex + 1;
                                // UPDATED: Crown only for #1, gear for creator
                                const positionEmoji = standing === 1 ? '👑' : `${standing}.`;
                                const creatorIndicator = score.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                                const globalRank = score.rank ? ` (#${score.rank})` : '';
                                const scoreText = score.score !== 'No score' ? ` - ${score.score}` : ' - No score yet';
                                
                                embedDescription += `  ${positionEmoji} ${score.raUsername}${creatorIndicator}${scoreText}${globalRank}\n`;
                            });
                        } else {
                            embedDescription += `\n📊 Current Standings: Scores not available yet\n`;
                        }
                    } catch (error) {
                        console.error(`Error fetching scores for challenge ${challenge.challengeId}:`, error);
                        embedDescription += `\n📊 Current Standings: Unable to fetch scores\n`;
                    }
                }
                
                embedDescription += '\n';
            }

            embed.setDescription(embedDescription);

            // Create action buttons for each challenge
            const actionRows = [];
            
            // Group buttons by 5 per row (Discord limit)
            for (let i = 0; i < challengesToShow.length; i += 5) {
                const row = new ActionRowBuilder();
                const challengeGroup = challengesToShow.slice(i, i + 5);
                
                challengeGroup.forEach((challenge, groupIndex) => {
                    const challengeIndex = i + groupIndex + 1;
                    
                    console.log(`=== CREATING BUTTON FOR CHALLENGE ${challengeIndex} ===`);
                    console.log('Challenge ID:', challenge.challengeId);
                    console.log('Challenge Type:', challenge.type);
                    console.log('Challenge Status:', challenge.status);
                    
                    // Determine button style and label based on challenge type and user eligibility
                    let buttonStyle = ButtonStyle.Secondary;
                    let buttonLabel = `${challengeIndex}. Info`;
                    let buttonEmoji = 'ℹ️';
                    let buttonAction = 'info';
                    
                    // Check if user can join this challenge
                    const isParticipant = challenge.isParticipant(interaction.user.id);
                    const canJoin = challenge.type === 'open' && challenge.status === 'active' && !isParticipant;
                    const canBet = challenge.status === 'active' && !isParticipant && challenge.canBet();
                    
                    console.log('User ID:', interaction.user.id);
                    console.log('Is Participant:', isParticipant);
                    console.log('Can Join:', canJoin);
                    console.log('Can Bet:', canBet);
                    
                    if (canJoin) {
                        buttonStyle = ButtonStyle.Success;
                        buttonLabel = `${challengeIndex}. Join (${gpUtils.formatGP(challenge.participants[0].wager)})`;
                        buttonEmoji = '⚔️';
                        buttonAction = 'join';
                        console.log('Setting button action to JOIN');
                    } else if (canBet) {
                        buttonStyle = ButtonStyle.Primary;
                        buttonLabel = `${challengeIndex}. Bet`;
                        buttonEmoji = '🎰';
                        buttonAction = 'bet';
                        console.log('Setting button action to BET');
                    } else {
                        console.log('Setting button action to INFO (default)');
                    }
                    
                    const customId = `arena_challenge_${challenge.challengeId}_${buttonAction}`;
                    console.log(`Generated customId: ${customId}`);
                    console.log('=====================================');
                    
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(customId)
                            .setLabel(buttonLabel)
                            .setStyle(buttonStyle)
                            .setEmoji(buttonEmoji)
                    );
                });
                
                actionRows.push(row);
            }

            // Add refresh button
            const refreshRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_refresh_active')
                        .setLabel('Refresh List')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔄')
                );
            
            actionRows.push(refreshRow);

            console.log(`Created ${actionRows.length} action rows with buttons`);

            await interaction.editReply({
                embeds: [embed],
                components: actionRows
            });

        } catch (error) {
            console.error('Error fetching active challenges:', error);
            await interaction.editReply({ content: 'Error fetching active challenges.' });
        }
    },

    async handleHistory(interaction, user) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const challenges = await arenaService.getUserChallenges(user.discordId, 10);
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Your Challenge History')
                .setDescription(`Recent challenges for **${user.raUsername}**`)
                .setColor('#0099FF')
                .setTimestamp();

            if (challenges.length === 0) {
                embed.addFields({ name: 'No Challenges', value: 'You haven\'t participated in any challenges yet.', inline: false });
            } else {
                for (const challenge of challenges) {
                    const statusEmoji = {
                        'pending': '⏳',
                        'active': '🔥',
                        'completed': '✅',
                        'cancelled': '❌'
                    };

                    let resultText = '';
                    if (challenge.status === 'completed') {
                        if (challenge.winnerUserId === user.discordId) {
                            resultText = ' 🏆 **WON**';
                        } else if (challenge.winnerUserId) {
                            resultText = ' 😔 Lost';
                        } else {
                            resultText = ' 🤝 No winner';
                        }
                    }

                    const value = 
                        `${statusEmoji[challenge.status]} **${challenge.gameTitle}**${resultText}\n` +
                        `Type: ${challenge.type === 'direct' ? 'Direct' : 'Open'} | ` +
                        `Wager: ${challenge.participants.find(p => p.userId === user.discordId)?.wager || 0} GP\n` +
                        `Created: ${challenge.createdAt.toLocaleDateString()}`;

                    // Fix for the error - ensure challengeId exists and is a string
                    const fieldName = (challenge.challengeId || `Challenge-${challenge._id || 'Unknown'}`).toString();

                    embed.addFields({
                        name: fieldName,
                        value: value,
                        inline: true
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching user challenge history:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching your challenge history.'
            });
        }
    },

    async handleHelp(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('❓ How to Play Arena')
            .setDescription('Learn the Arena challenge system!')
            .setColor('#00BFFF')
            .addFields(
                {
                    name: '💰 GP (Game Points)',
                    value: 
                        '• Get 1,000 GP automatically each month on the 1st\n' +
                        '• Use GP to create challenges and place bets\n' +
                        '• Win challenges to earn more GP',
                    inline: false
                },
                {
                    name: '⚔️ Direct Challenges',
                    value: 
                        '• Challenge a specific player\n' +
                        '• They have 24 hours to accept\n' +
                        '• Winner takes both wagers',
                    inline: true
                },
                {
                    name: '🌍 Open Challenges',
                    value: 
                        '• Anyone can join your challenge\n' +
                        '• Multiple participants possible\n' +
                        '• Winner takes all wagers',
                    inline: true
                },
                {
                    name: '🎰 Betting System',
                    value: 
                        '• Bet on active challenges\n' +
                        '• Non-participants only\n' +
                        '• Betting closes 3 days after start\n' +
                        '• Winners split losing bets proportionally',
                    inline: false
                },
                {
                    name: '🏆 How Winners Are Determined',
                    value: 
                        '• Based on RetroAchievements leaderboard rank\n' +
                        '• Lower rank wins (Rank 1 beats Rank 2)\n' +
                        '• Challenges run for 7 days\n' +
                        '• Ties result in refunds',
                    inline: false
                },
                {
                    name: '📊 Tips for Success',
                    value: 
                        '• Start small with low wagers\n' +
                        '• Check leaderboards before challenging\n' +
                        '• Bet wisely on other challenges\n' +
                        '• GP is granted automatically each month',
                    inline: false
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
