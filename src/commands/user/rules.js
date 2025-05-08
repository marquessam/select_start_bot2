import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    ComponentType
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('View detailed community rules and guidelines'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Display the main rules menu with dropdown navigation
            await this.displayRulesMenu(interaction);
        } catch (error) {
            console.error('Rules Command Error:', error);
            await interaction.editReply('Failed to display rules. Please try again.');
        }
    },

    async displayRulesMenu(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Select Start Community Rules')
            .setDescription('Here you\'ll find our comprehensive community rules and guidelines. Select a category below to learn more about specific rules.')
            .setColor('#3498DB')
            .addFields({
                name: 'Rule Categories',
                value: 'Use the dropdown menu to explore different rule sets:'
            })
            .setFooter({ text: 'Select Start Gaming Community • Select a category from the dropdown' })
            .setTimestamp();

        // Create a dropdown menu for category selection
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ruleCategories')
                    .setPlaceholder('Select a category')
                    .addOptions([
                        {
                            label: 'Community Conduct',
                            description: 'General behavior and community guidelines',
                            value: 'conduct',
                            emoji: '👤'
                        },
                        {
                            label: 'RetroAchievements Requirements',
                            description: 'Hardcore mode and technical requirements',
                            value: 'retroreqs',
                            emoji: '⚠️'
                        },
                        {
                            label: 'Competition Guidelines',
                            description: 'Rules for fair competition',
                            value: 'competition',
                            emoji: '🏆'
                        },
                        {
                            label: 'Registration & Participation',
                            description: 'How to join and participate',
                            value: 'registration',
                            emoji: '📝'
                        },
                        {
                            label: 'Communication Channels',
                            description: 'Channel-specific guidelines',
                            value: 'channels',
                            emoji: '💬'
                        },
                        {
                            label: 'Monthly Challenge Rules',
                            description: 'Detailed rules for monthly challenges',
                            value: 'monthly',
                            emoji: '🎮'
                        },
                        {
                            label: 'Shadow Game Rules',
                            description: 'Rules for shadow game challenges',
                            value: 'shadow',
                            emoji: '👥'
                        },
                        {
                            label: 'Arcade & Racing Rules',
                            description: 'Rules for arcade and racing challenges',
                            value: 'arcade',
                            emoji: '🏎️'
                        },
                        {
                            label: 'Points System',
                            description: 'Detailed explanation of points system',
                            value: 'points',
                            emoji: '📊'
                        }
                    ])
            );

        // Send the initial message with dropdown menu
        const message = await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

        // Create collector for dropdown interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 600000 // Time limit: 10 minutes
        });

        // Create collector for button interactions
        const buttonCollector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 600000 // Time limit: 10 minutes
        });

        // Generate back button
        const backRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('back')
                    .setLabel('Back to Rules Menu')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('↩️')
            );

        // Handle dropdown selection
        collector.on('collect', async (i) => {
            await i.deferUpdate();

            // Handle different category selections
            switch (i.values[0]) {
                case 'conduct':
                    const conductEmbed = this.createCommunityRulesEmbed();
                    await i.editReply({ embeds: [conductEmbed], components: [backRow] });
                    break;
                case 'retroreqs':
                    const retroreqsEmbed = this.createRetroAchievementsEmbed();
                    await i.editReply({ embeds: [retroreqsEmbed], components: [backRow] });
                    break;
                case 'competition':
                    const competitionEmbed = this.createCompetitionEmbed();
                    await i.editReply({ embeds: [competitionEmbed], components: [backRow] });
                    break;
                case 'registration':
                    const registrationEmbed = this.createRegistrationEmbed();
                    await i.editReply({ embeds: [registrationEmbed], components: [backRow] });
                    break;
                case 'channels':
                    const channelsEmbed = this.createChannelsEmbed();
                    await i.editReply({ embeds: [channelsEmbed], components: [backRow] });
                    break;
                case 'monthly':
                    const monthlyEmbed = this.createMonthlyChallengeEmbed();
                    await i.editReply({ embeds: [monthlyEmbed], components: [backRow] });
                    break;
                case 'shadow':
                    const shadowEmbed = this.createShadowGameEmbed();
                    await i.editReply({ embeds: [shadowEmbed], components: [backRow] });
                    break;
                case 'arcade':
                    const arcadeEmbed = this.createArcadeRacingEmbed();
                    await i.editReply({ embeds: [arcadeEmbed], components: [backRow] });
                    break;
                case 'points':
                    const pointsEmbed = this.createPointsSystemEmbed();
                    await i.editReply({ embeds: [pointsEmbed], components: [backRow] });
                    break;
            }
        });

        // Handle button clicks
        buttonCollector.on('collect', async (i) => {
            await i.deferUpdate();

            if (i.customId === 'back') {
                // Return to main rules menu
                await i.editReply({ 
                    embeds: [embed], 
                    components: [row] 
                });
            }
        });

        // When the collector expires
        collector.on('end', async () => {
            if (!buttonCollector.ended) buttonCollector.stop();
        });

        buttonCollector.on('end', async () => {
            try {
                // Disable the select menu when time expires
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('ruleCategories')
                            .setPlaceholder('Rules session expired')
                            .setDisabled(true)
                            .addOptions([{ label: 'Expired', value: 'expired' }])
                    );

                // Update with disabled menu
                await interaction.editReply({
                    embeds: [embed.setFooter({ text: 'Select Start Gaming Community • Rules session expired' })],
                    components: [disabledRow]
                });
            } catch (error) {
                console.error('Error disabling menu:', error);
            }
        });
    },

    // Create all the rule embed functions
    createCommunityRulesEmbed() {
        return new EmbedBuilder()
            .setTitle('Community Conduct Rules')
            .setColor('#E74C3C')
            .setDescription('These general rules apply to all interactions within the Select Start community:')
            .addFields(
                {
                    name: '👤 Respect & Inclusivity',
                    value: '• **Treat all members with respect** - This is our most fundamental rule\n' +
                           '• **No harassment or bullying** - We have zero tolerance for targeted harassment\n' +
                           '• **No discrimination** - Discrimination based on race, gender, sexual orientation, disability, or any other characteristic is prohibited\n' +
                           '• **No hate speech** - Slurs, derogatory terms, and hateful language are not permitted\n' +
                           '• **Keep discussions family-friendly** - Avoid explicit, vulgar, or inappropriate content'
                },
                {
                    name: '🔊 Communication Guidelines',
                    value: '• **Be constructive** - When giving feedback, be thoughtful and considerate\n' +
                           '• **Avoid excessive caps** - Don\'t type in ALL CAPS as it comes across as shouting\n' +
                           '• **No spamming** - Don\'t flood channels with repeated messages\n' +
                           '• **Keep discussions on topic** - Follow the purpose of each channel\n' +
                           '• **Use appropriate channels** - Post content in the relevant channels\n' +
                           '• **Avoid arguments** - If a disagreement arises, discuss civilly or take it to DMs'
                },
                {
                    name: '👮 Moderation & Enforcement',
                    value: '• **Listen to moderators** - Follow directions from community moderators and admins\n' +
                           '• **Report issues privately** - Use DMs to report problems to moderators\n' +
                           '• **Accept consequences** - If you receive a warning or action, accept it respectfully\n' +
                           '• **No ban evasion** - Creating new accounts to evade bans will result in permanent exclusion'
                },
                {
                    name: '💻 Technical Content & Sharing',
                    value: '• **No piracy** - Don\'t share or request pirated content\n' +
                           '• **No cheating tools** - Don\'t share tools designed to cheat in RetroAchievements\n' +
                           '• **No unauthorized emulators** - Only use approved emulators for challenges\n' +
                           '• **Respect intellectual property** - Don\'t share copyrighted material without permission\n' +
                           '• **Use spoiler tags** - Mark spoilers for games, especially current challenges'
                },
                {
                    name: '⚠️ Rule Violations',
                    value: '• First Violation: Warning\n' +
                           '• Second Violation: Temporary restriction from channels\n' +
                           '• Third Violation: Temporary server mute or timeout\n' +
                           '• Severe Violations: Immediate permanent ban\n\n' +
                           'Moderators reserve the right to adjust these actions based on the severity of violations.'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    },

    createRetroAchievementsEmbed() {
        return new EmbedBuilder()
            .setTitle('RetroAchievements Requirements')
            .setColor('#F39C12')
            .setDescription('These technical requirements apply to all challenges and competitions:')
            .addFields(
                {
                    name: '🎮 Hardcore Mode Requirements',
                    value: '• **HARDCORE MODE IS MANDATORY** - All achievements must be earned in RetroAchievements Hardcore Mode\n' +
                           '• **What is Hardcore Mode?** - A setting in RetroAchievements that disables certain emulator features\n' +
                           '• **Hardcore restrictions apply even during the "last day of month" grace period**\n' +
                           '• **Only achievements earned in Hardcore Mode count** toward challenges and competitions\n' +
                           '• **Achievements must be visible on your RetroAchievements profile** to count toward standings'
                },
                {
                    name: '⛔ Prohibited Features',
                    value: '• **Save States** - Using save states is strictly prohibited\n' +
                           '• **Rewind Features** - Using rewind functionality is strictly prohibited\n' +
                           '• **Cheat Codes** - Using cheat codes is strictly prohibited (unless specifically required by an achievement)\n' +
                           '• **Third-party Tools** - Using unauthorized tools or software to manipulate games is prohibited\n' +
                           '• **Modded ROMs** - Using modified game files is prohibited (unless specifically required)'
                },
                {
                    name: '✅ Permitted Features',
                    value: '• **Fast Forward** - Using fast forward is permitted to speed up gameplay\n' +
                           '• **In-game Saves** - Using the game\'s built-in save feature is allowed\n' +
                           '• **Control Remapping** - Customizing your controller layout is allowed\n' +
                           '• **Filters/Shaders** - Visual enhancements that don\'t affect gameplay are allowed\n' +
                           '• **Screenshots** - Taking screenshots or recordings is allowed'
                },
                {
                    name: '🖥️ Approved Emulators',
                    value: 'Only emulators that properly support RetroAchievements and Hardcore Mode are permitted. Common approved emulators include:\n\n' +
                           '• RetroArch (with appropriate cores)\n' +
                           '• RALibretro\n' +
                           '• RAVBA\n' +
                           '• RASnes9x\n' +
                           '• RAP64\n' +
                           '• RAGens\n' +
                           '• RAMeka\n' +
                           '• RANES\n\n' +
                           'Check RetroAchievements.org for the full list of supported emulators.'
                },
                {
                    name: '⚠️ Technical Violations',
                    value: '• **Detected Violations** - RetroAchievements has built-in detection for Hardcore Mode violations\n' +
                           '• **Reporting Bugs** - If you encounter technical issues or bugs, report them to admins immediately\n' +
                           '• **Legitimate Technical Issues** - If you experience technical problems, document them and contact an admin\n' +
                           '• **False Positives** - If you believe your achievements were incorrectly flagged, contact an admin with evidence\n' +
                           '• **Consequences** - Intentional technical violations may result in disqualification from current and future challenges'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    },

    createCompetitionEmbed() {
        return new EmbedBuilder()
            .setTitle('Competition Guidelines')
            .setColor('#2ECC71')
            .setDescription('These rules ensure fair competition across all challenges:')
            .addFields(
                {
                    name: '🏆 Fair Play Principles',
                    value: '• **Play honestly** - Earn all achievements through legitimate gameplay\n' +
                           '• **No exploitation** - Don\'t exploit game glitches or bugs to earn achievements\n' +
                           '• **No collaboration on individual challenges** - Earn achievements yourself, not through others playing for you\n' +
                           '• **No misleading scores** - Submit only accurate and honest completion times and scores\n' +
                           '• **Report technical issues** - If you encounter bugs that affect competition, report them to admins'
                },
                {
                    name: '📆 Time Restrictions',
                    value: '• **Monthly Challenge Timeframe** - From 12:00 AM on the 1st day to 11:59 PM on the last day of the month\n' +
                           '• **Racing Challenge Duration** - As specified in the challenge announcement, typically one calendar month\n' +
                           '• **Arcade Boards** - Open year-round until December 1st when points are calculated\n' +
                           '• **Tiebreakers** - Special tiebreaker challenges have their own specified timeframes'
                },
                {
                    name: '📊 Achievement Tracking',
                    value: '• **Automatic Tracking** - Most achievements are tracked automatically via RetroAchievements API\n' +
                           '• **Delayed Updates** - Be aware that the API may have occasional delays in updating\n' +
                           '• **Offline Achievements** - Achievements earned while offline will not count\n' +
                           '• **Deleted Achievements** - If you delete achievements from your profile, they will not count\n' +
                           '• **Profile Privacy** - Your RetroAchievements profile must be public for tracking to work'
                },
                {
                    name: '⚖️ Tie Resolution',
                    value: '• **Identical Mastery** - When users reach identical mastery status in monthly challenges\n' +
                           '• **Tiebreaker Events** - Special tiebreaker competitions will typically be created\n' +
                           '• **Participation** - Anyone can participate in tiebreakers, but only tied users\' scores count toward final rankings\n' +
                           '• **Tiebreaker Format** - Usually involves a time-limited competition on a separate game\n' +
                           '• **Timeline** - Usually ends with the monthly challenge but may be extended in special circumstances (e.g., a tie within a tie)'
                },
                {
                    name: '🚫 Disqualification',
                    value: '• **Cheating** - Any form of cheating will result in immediate disqualification\n' +
                           '• **Hardcore Violations** - Violations of Hardcore Mode will invalidate affected achievements\n' +
                           '• **Manipulation** - Attempting to manipulate leaderboards will result in disqualification\n' +
                           '• **False Information** - Providing false information about achievements will result in disqualification\n' +
                           '• **Appeals** - Disqualification decisions can be appealed to the admin team within 7 days'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    },

    createRegistrationEmbed() {
        return new EmbedBuilder()
            .setTitle('Registration & Participation')
            .setColor('#9B59B6')
            .setDescription('Requirements for joining and participating in community challenges:')
            .addFields(
                {
                    name: '📝 Registration Process',
                    value: '• **Admin Registration** - You must be registered by an admin using the `/register` command\n' +
                           '• **RetroAchievements Account** - You must have a valid RetroAchievements account\n' +
                           '• **Account Linking** - Your RetroAchievements username must be linked to your Discord account\n' +
                           '• **Account Age** - Your RetroAchievements account should be at least 7 days old\n' +
                           '• **Account Changes** - If you change your RetroAchievements username, notify an admin for updating'
                },
                {
                    name: '👤 Account Requirements',
                    value: '• **Authentic Information** - Provide accurate information during registration\n' +
                           '• **Single Account** - Only one RetroAchievements account per person is allowed\n' +
                           '• **Public Profile** - Your RetroAchievements profile must be set to public\n' +
                           '• **Discord Membership** - You must remain a member of the Discord server to participate\n' +
                           '• **Policy Acceptance** - Registration signifies acceptance of all community rules'
                },
                {
                    name: '🔐 Account Security',
                    value: '• **Account Protection** - Secure your RetroAchievements account with a strong password\n' +
                           '• **Unauthorized Access** - Report any suspicious activity on your account\n' +
                           '• **Account Sharing** - Sharing your account with others is prohibited\n' +
                           '• **Responsible Updates** - Keep your email and password up to date\n' +
                           '• **Privacy** - We respect your privacy and only use your RetroAchievements username for tracking'
                },
                {
                    name: '📊 Leaderboard Requirements',
                    value: '• **Arcade Rankings** - You must place in the top 999 of the global RetroAchievements leaderboard to appear in arcade rankings\n' +
                           '• **Valid Submissions** - All scores and achievements must be valid and earned during the specified timeframe\n' +
                           '• **Fair Competition** - Participate fairly without attempting to manipulate rankings\n' +
                           '• **Profile Consistency** - Maintain consistent account information to ensure proper tracking\n' +
                           '• **Community Standing** - Remain in good standing within the community'
                },
                {
                    name: '⚠️ Registration Issues',
                    value: '• **Technical Problems** - If you encounter issues during registration, contact an admin\n' +
                           '• **Missing Achievements** - If your achievements aren\'t being tracked, verify your account is linked correctly\n' +
                           '• **Registration Updates** - For changes to your registration information, ask an admin\n' +
                           '• **Rejoining** - If you leave and later rejoin, you may need to be re-registered\n' +
                           '• **Legacy Data** - Previous achievements from before your registration may not be counted'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    },

    createChannelsEmbed() {
        return new EmbedBuilder()
            .setTitle('Communication Channels')
            .setColor('#3498DB')
            .setDescription('Guidelines for using our Discord channels effectively:')
            .addFields(
                {
                    name: '#general-chat',
                    value: '• For general discussion and community conversation\n' +
                           '• Keep topics family-friendly and accessible to all\n' +
                           '• Avoid lengthy debates that would be better in specific channels\n' +
                           '• No spamming or excessive self-promotion\n' +
                           '• Welcome new members and foster community engagement'
                },
                {
                    name: '#monthly-challenge',
                    value: '• For discussing the current monthly challenge game\n' +
                           '• Share tips, strategies, and achievements\n' +
                           '• Use spoiler tags for important game reveals or solutions\n' +
                           '• Ask questions about specific achievements\n' +
                           '• Report any issues with the challenge here or to admins directly\n' +
                           '• Celebrate completions and mastery accomplishments'
                },
                {
                    name: '#shadow-game',
                    value: '• For discussions related to the shadow game challenge\n' +
                           '• Share hints about the shadow game identity\n' +
                           '• Use spoiler tags for all shadow game content while unidentified\n' +
                           '• Coordinate guessing strategies\n' +
                           '• Once revealed, discuss tips and strategies\n' +
                           '• Celebrate successful guesses and completions'
                },
                {
                    name: '#the-arcade',
                    value: '• For discussions about arcade board challenges\n' +
                           '• Share racing strategies and time trial tips\n' +
                           '• Discuss high scores and leaderboard standings\n' +
                           '• Suggest new arcade boards and racing challenges\n' +
                           '• Ask technical questions about specific leaderboards\n' +
                           '• Celebrate new records and personal bests'
                },
                {
                    name: '#nominations',
                    value: '• For game nominations and voting discussions\n' +
                           '• Discuss potential nominations and their merits\n' +
                           '• Ask questions about game eligibility\n' +
                           '• Share thoughts on nominated games\n' +
                           '• During voting periods, discuss voting options\n' +
                           '• Avoid campaigning aggressively for specific games'
                },
                {
                    name: '#off-topic',
                    value: '• For non-gaming discussions\n' +
                           '• Discuss other interests respectfully\n' +
                           '• Share relevant media and content\n' +
                           '• Still follows all community conduct rules\n' +
                           '• Keep content family-friendly\n' +
                           '• Use appropriate spoiler tags when needed'
                },
                {
                    name: '#announcements',
                    value: '• Read-only channel for official community announcements\n' +
                           '• Contains important updates about challenges\n' +
                           '• Check regularly for new information\n' +
                           '• Contest results and community changes posted here\n' +
                           '• Do not ask questions here (use appropriate channels instead)'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    },

    createMonthlyChallengeEmbed() {
        return new EmbedBuilder()
            .setTitle('Monthly Challenge Rules')
            .setColor('#E67E22')
            .setDescription('Detailed rules for participating in our monthly challenge events:')
            .addFields(
                {
                    name: '📆 Challenge Period',
                    value: '• **Start Date** - 12:00 AM on the 1st day of each month\n' +
                           '• **End Date** - 11:59 PM on the last day of each month\n' +
                           '• **Grace Period** - The last day of the previous month (for participation only)\n' +
                           '• **Time Zone** - All times are based on UTC (Coordinated Universal Time)\n' +
                           '• **Selection Process** - Games are chosen by community vote from nominated titles'
                },
                {
                    name: '🏆 Achievement Categories',
                    value: '• **Progression Achievements** - Required to be considered "beaten"\n' +
                           '• **Win Achievements** - May be required for "beaten" status (when designated)\n' +
                           '• **Missable Achievements** - Can be permanently missed during gameplay\n' +
                           '• **Mastery Achievements** - All achievements in the game\n' +
                           '• **Beaten vs. Mastery** - "Beaten" requires progression/win achievements; "Mastery" requires all achievements'
                },
                {
                    name: '📊 Point Structure',
                    value: '**CUMULATIVE POINT SYSTEM:**\n' +
                           '• **Participation** - 1 point (earned by unlocking any achievement)\n' +
                           '• **Beaten** - 4 points total (1 for participation + 3 for completing all progression requirements)\n' +
                           '• **Mastery** - 7 points total (1 for participation + 3 for beaten + 3 for 100% completion)\n\n' +
                           'Points from each tier include points from lower tiers (cumulative).'
                },
                {
                    name: '🥇 Leaderboard Rankings',
                    value: '• **Monthly Rankings** - Based on achievement completion percentage\n' +
                           '• **Tiebreakers** - Same percentage ties are resolved by earliest completion timestamp\n' +
                           '• **Prize Tiebreakers** - Ties for top 3 positions may trigger special tiebreaker events\n' +
                           '• **Leaderboard Updates** - Updated regularly throughout the month\n' +
                           '• **Final Standings** - Confirmed within 48 hours after the month ends'
                },
                {
                    name: '🎮 Participation Requirements',
                    value: '• **Registration** - Must be registered with the community\n' +
                           '• **Hardcore Mode** - All achievements must be earned in Hardcore Mode\n' +
                           '• **Timing** - Achievements must be earned during the challenge period\n' +
                           '• **Account Standing** - Must be in good standing with RetroAchievements\n' +
                           '• **Complete Game** - The complete game must be played (not demo versions)'
                },
                {
                    name: '🔍 Progression Tracking',
                    value: '• **Automatic Updates** - Progress is tracked via RetroAchievements API\n' +
                           '• **Manual Checks** - Admins may perform manual verification if needed\n' +
                           '• **Progress Commands** - Use `/leaderboard` to check current standings\n' +
                           '• **Profile Command** - Use `/profile` to check your personal progress\n' +
                           '• **Update Frequency** - Leaderboards update approximately every 15-30 minutes'
                },
                {
                    name: '🏅 Awards & Recognition',
                    value: '• **Monthly Prizes** - Top 3 players receive recognition and prizes\n' +
                           '• **Certificates** - Digital certificates for monthly winners\n' +
                           '• **Discord Roles** - Special roles for consistent winners\n' +
                           '• **Points Accumulation** - Monthly points count toward yearly totals\n' +
                           '• **Annual Awards** - Year-end prizes based on accumulated points'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    },

    createShadowGameEmbed() {
        return new EmbedBuilder()
            .setTitle('Shadow Game Rules')
            .setColor('#8E44AD')
            .setDescription('Comprehensive rules for our shadow game challenges:')
            .addFields(
                {
                    name: '🧩 Shadow Game Concept',
                    value: '• **Definition** - A hidden game challenge that runs alongside the monthly challenge\n' +
                           '• **Purpose** - Adds mystery and variety to the monthly competitions\n' +
                           '• **Game Style** - While thematically connected to the main challenge, shadow games typically offer different gameplay experiences (different genre, length, or tone)\n' +
                           '• **Discovery Mechanic** - Must be correctly guessed by a community member to be revealed\n' +
                           '• **Automatic Reveal** - Past month shadow games are automatically revealed'
                },
                {
                    name: '🔍 Guessing Process',
                    value: '• **Command Usage** - Use `/shadowguess` with the exact title of the game\n' +
                           '• **Guess Format** - Submit the exact game title as it appears on RetroAchievements\n' +
                           '• **Guess Limit** - No limit to the number of guesses\n' +
                           '• **Guess Visibility** - All guesses are visible to everyone in the channel\n' +
                           '• **Successful Guess** - Correct guesses reveal the game for everyone\n' +
                           '• **Hint System** - Occasional hints may be shared by admins in the #shadow-game channel'
                },
                {
                    name: '📊 Point Structure',
                    value: '**CUMULATIVE POINT SYSTEM:**\n' +
                           '• **Participation** - 1 point (earned by unlocking any achievement)\n' +
                           '• **Beaten** - 4 points total (1 for participation + 3 for completing all progression requirements)\n\n' +
                           '**IMPORTANT:** Shadow games are capped at "Beaten" status - there is no additional mastery bonus.'
                },
                {
                    name: '🏆 Achievement Categories',
                    value: '• **Progression Achievements** - Required to be considered "beaten"\n' +
                           '• **Win Achievements** - May be required for "beaten" status (when designated)\n' +
                           '• **Beaten Definition** - Complete all progression achievements and any required win achievements\n' +
                           '• **No Mastery** - Shadow games do not award points for mastery\n' +
                           '• **Measurement** - Progress is measured by percentage of required achievements completed'
                },
                {
                    name: '📆 Timeframe',
                    value: '• **Start Date** - Once revealed, either by correct guess or automatically\n' +
                           '• **End Date** - 11:59 PM on the last day of the month (same as monthly challenge)\n' +
                           '• **Past Games** - Previous month shadow games are automatically revealed\n' +
                           '• **No Grace Period** - Unlike monthly challenges, shadow games have no grace period\n' +
                           '• **Guessing Period** - Guessing can begin as soon as the monthly challenge is announced'
                },
                {
                    name: '📢 Communication Guidelines',
                    value: '• **Spoiler Tags** - Use spoiler tags when discussing the shadow game after it\'s revealed\n' +
                           '• **Hint Sharing** - Share hints and thoughts in the #shadow-game channel\n' +
                           '• **Solution Sharing** - Don\'t explicitly share solutions with others\n' +
                           '• **Collaborative Guessing** - Collaborative guessing is encouraged\n' +
                           '• **Respect** - Respect others\' desire to solve the puzzle independently'
                },
                {
                    name: '🔒 Technical Requirements',
                    value: '• **Hardcore Mode** - All the same Hardcore Mode requirements apply\n' +
                           '• **Registration** - Must be registered with the community\n' +
                           '• **Platform Limitations** - Same platform eligibility as monthly challenges\n' +
                           '• **Emulator Requirements** - Same approved emulator list as monthly challenges\n' +
                           '• **Achievement Tracking** - Progress tracked through RetroAchievements API'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    },

    createArcadeRacingEmbed() {
        return new EmbedBuilder()
            .setTitle('Arcade & Racing Rules')
            .setColor('#16A085')
            .setDescription('Detailed rules for arcade boards and racing challenges:')
            .addFields(
                {
                    name: '🏎️ Racing Challenge Rules',
                    value: '• **Definition** - Monthly time trial competitions on racing games\n' +
                           '• **Timeframe** - Typically runs for one calendar month\n' +
                           '• **Point Structure** - 1st Place (3 points), 2nd Place (2 points), 3rd Place (1 point)\n' +
                           '• **Scoring** - Based on fastest time or highest score depending on the challenge\n' +
                           '• **Hardcore Mode** - All attempts must be in RetroAchievements Hardcore Mode\n' +
                           '• **Leaderboard Position** - Must place in the top 999 of global leaderboard'
                },
                {
                    name: '🎮 Arcade Board Rules',
                    value: '• **Definition** - Year-round leaderboard competitions\n' +
                           '• **Duration** - Boards remain open until December 1st each year\n' +
                           '• **Point Structure** - 1st Place (3 points), 2nd Place (2 points), 3rd Place (1 point)\n' +
                           '• **Point Awarding** - Points awarded annually on December 1st\n' +
                           '• **Participation** - You can earn points from multiple arcade boards\n' +
                           '• **Leaderboard Position** - Must place in the top 999 of global leaderboard'
                },
                {
                    name: '📊 Tracking & Verification',
                    value: '• **Score Tracking** - All scores tracked via RetroAchievements leaderboards\n' +
                           '• **No Manual Submissions** - Scores must be automatically recorded through RetroAchievements\n' +
                           '• **Verification** - Admins may verify unusual scores\n' +
                           '• **Disputed Scores** - Contested scores may require video evidence\n' +
                           '• **Valid Attempts** - Only attempts completed in Hardcore Mode count\n' +
                           '• **Updates** - Leaderboards update approximately every 30 minutes'
                },
                {
                    name: '⚠️ Technical Requirements',
                    value: '• **Hardcore Mode Required** - All the same Hardcore Mode requirements apply\n' +
                           '• **No Save States** - Save states are not permitted\n' +
                           '• **No Rewind** - Rewind features are not permitted\n' +
                           '• **Fast Forward Allowed** - Fast forward is permitted\n' +
                           '• **No Cheats** - No cheat codes or devices\n' +
                           '• **Approved Emulators** - Same approved emulator list as other challenges'
                },
                {
                    name: '⚖️ Fairness Guidelines',
                    value: '• **Legal Shortcuts** - In-game shortcuts are allowed unless specified otherwise\n' +
                           '• **No Exploits** - Game-breaking glitches are not permitted\n' +
                           '• **Character Selection** - Any in-game character/vehicle is allowed unless specified\n' +
                           '• **Track Conditions** - Standard track conditions unless specified\n' +
                           '• **Control Schemes** - Any control scheme is permitted\n' +
                           '• **Recording** - Recording your runs is encouraged but not required'
                },
                {
                    name: '📅 Seasonal Rotation',
                    value: '• **Board Selection** - Each month we add 1-2 arcade boards to our collection\n' +
                           '• **Racing Rotation** - New racing challenges each month\n' +
                           '• **Annual Reset** - All boards reset on December 1st after points are awarded\n' +
                           '• **Board Suggestions** - Use `/suggest` to recommend new boards\n' +
                           '• **Voting** - Community may vote on arcade board selections\n' +
                           '• **Transparency** - All board selections announced in advance'
                },
                {
                    name: '⚔️ Tiebreakers',
                    value: '• **Identical Scores** - In case of identical scores, earliest submission wins\n' +
                           '• **Top 3 Ties** - For tied positions in top 3, additional tiebreaker events may be created\n' +
                           '• **Tiebreaker Format** - Usually a separate mini-challenge\n' +
                           '• **Participation** - Only tied participants can compete in tiebreakers\n' +
                           '• **Duration** - Typically shorter than regular challenges (3-7 days)\n' +
                           '• **Decision** - Admins have final say in tiebreaker disputes'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    },

    createPointsSystemEmbed() {
        return new EmbedBuilder()
            .setTitle('Points System')
            .setColor('#3498DB')
            .setDescription('Complete breakdown of our community points system:')
            .addFields(
                {
                    name: '🎮 Monthly Challenge Points',
                    value: '**CUMULATIVE POINT STRUCTURE:**\n' +
                           '• **Participation** - 1 point (earn any achievement)\n' +
                           '• **Beaten** - 4 points total (1 for participation + 3 for completion)\n' +
                           '• **Mastery** - 7 points total (1 for participation + 3 for beaten + 3 for 100% completion)\n\n' +
                           '**Requirements:**\n' +
                           '• Complete all designated progression achievements\n' +
                           '• Earn any required win achievements (when applicable)\n' +
                           '• For mastery, earn 100% of all achievements in the game\n\n' +
                           'Points are awarded at month\'s end based on highest status achieved.'
                },
                {
                    name: '👥 Shadow Challenge Points',
                    value: '**CUMULATIVE POINT STRUCTURE:**\n' +
                           '• **Participation** - 1 point (earn any achievement)\n' +
                           '• **Beaten** - 4 points total (1 for participation + 3 for completion)\n\n' +
                           '**Requirements:**\n' +
                           '• Complete all designated progression achievements\n' +
                           '• Earn any required win achievements (when applicable)\n\n' +
                           '**IMPORTANT:** Shadow games are capped at "Beaten" status - there is no additional mastery bonus.'
                },
                {
                    name: '🏎️ Racing Challenge Points',
                    value: '**POSITION-BASED POINTS (AWARDED MONTHLY):**\n' +
                           '• **1st Place** - 3 points\n' +
                           '• **2nd Place** - 2 points\n' +
                           '• **3rd Place** - 1 point\n\n' +
                           '**Requirements:**\n' +
                           '• Must place in top 999 of global leaderboard\n' +
                           '• Must use Hardcore Mode\n' +
                           '• Must submit score during the challenge period\n\n' +
                           'Racing points are awarded at the end of each month\'s challenge.'
                },
                {
                    name: '🎮 Arcade Leaderboard Points',
                    value: '**POSITION-BASED POINTS (AWARDED ANNUALLY):**\n' +
                           '• **1st Place** - 3 points\n' +
                           '• **2nd Place** - 2 points\n' +
                           '• **3rd Place** - 1 point\n\n' +
                           '**Requirements:**\n' +
                           '• Must place in top 999 of global leaderboard\n' +
                           '• Must use Hardcore Mode\n' +
                           '• Scores valid until December 1st\n\n' +
                           'Points are awarded for each arcade board separately, so you can earn points from multiple boards.'
                },
                {
                    name: '🏅 Community Awards',
                    value: '**SPECIAL RECOGNITION:**\n' +
                           '• **Community Contribution** - Exceptional contributions to the community\n' +
                           '• **Special Event Winner** - Winners of special events and contests\n' +
                           '• **Seasonal Champion** - Outstanding performance across multiple months\n\n' +
                           'These awards are given at the discretion of the admin team for notable achievements and contributions.'
                },
                {
                    name: '📊 Point Tracking & Verification',
                    value: '• **Automated Tracking** - Most points are tracked automatically\n' +
                           '• **Manual Awards** - Special awards and community points are logged manually\n' +
                           '• **Transparency** - All point awards are announced publicly\n' +
                           '• **Disputes** - Point disputes must be raised within 7 days of awarding\n' +
                           '• **Verification** - Admins may verify point eligibility\n' +
                           '• **Leaderboard** - Use `/yearlyboard` to view current point standings'
                },
                {
                    name: '🏆 Annual Awards',
                    value: '**DECEMBER 1ST AWARDS (TBD):**\n' +
                           'Annual awards may include categories such as:\n' +
                           '• **Grand Champion** - Highest overall point earner for the year\n' +
                           '• **Monthly Master** - Most monthly challenge points\n' +
                           '• **Shadow Seeker** - Most shadow game points\n' +
                           '• **Racing Champion** - Most racing challenge points\n' +
                           '• **Arcade Legend** - Most arcade board points\n' +
                           '• **Community Star** - Community contributions\n\n' +
                           'Specific award categories and prizes will be determined closer to the event. All points reset after the December awards.'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community • Updated Rules' })
            .setTimestamp();
    }
};
