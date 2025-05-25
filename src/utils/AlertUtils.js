// src/utils/AlertUtils.js
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import { COLORS, EMOJIS, getDiscordTimestamp } from './FeedUtils.js';

// Alert type constants for different services
export const ALERT_TYPES = {
    ARCADE: 'arcade',
    ARENA: 'arena',
    MONTHLY: 'monthly',
    SHADOW: 'shadow',
    MASTERY: 'mastery',
    ACHIEVEMENT: 'achievement',
    TIEBREAKER: 'tiebreaker',        // NEW: For tiebreaker events
    TIEBREAKER_BREAKER: 'tb_breaker', // NEW: For tiebreaker-breaker events
    DEFAULT: 'default'
};

// Color mapping for different alert types (matching achievement feed)
const ALERT_COLORS = {
    [ALERT_TYPES.ARCADE]: '#3498DB',           // Blue for arcade
    [ALERT_TYPES.ARENA]: '#FF5722',            // Red for arena  
    [ALERT_TYPES.MONTHLY]: '#9B59B6',          // Purple for monthly
    [ALERT_TYPES.SHADOW]: '#000000',           // Black for shadow
    [ALERT_TYPES.MASTERY]: '#FFD700',          // Gold for mastery
    [ALERT_TYPES.ACHIEVEMENT]: '#808080',      // Grey for regular achievements
    [ALERT_TYPES.TIEBREAKER]: '#FF0000',       // NEW: Red for tiebreaker events
    [ALERT_TYPES.TIEBREAKER_BREAKER]: '#8B0000', // NEW: Dark red for tiebreaker-breaker
    [ALERT_TYPES.DEFAULT]: '#808080'           // Grey for default
};

// Default channel IDs for each alert type
const DEFAULT_CHANNEL_IDS = {
    [ALERT_TYPES.ARCADE]: '1300941091335438471',    // Arcade alerts
    [ALERT_TYPES.ARENA]: '1373570850912997476',     // Arena alerts  
    [ALERT_TYPES.MONTHLY]: '1313640664356880445',   // Monthly challenge updates
    [ALERT_TYPES.SHADOW]: '1300941091335438470',    // Shadow game updates
    [ALERT_TYPES.MASTERY]: '1362227906343997583',   // Mastery and Beaten achievements
    [ALERT_TYPES.ACHIEVEMENT]: '1362227906343997583', // Default achievement channel (same as mastery)
    [ALERT_TYPES.TIEBREAKER]: '1313640664356880445',   // NEW: Tiebreaker alerts (same as monthly)
    [ALERT_TYPES.TIEBREAKER_BREAKER]: '1313640664356880445', // NEW: Tiebreaker-breaker alerts
    [ALERT_TYPES.DEFAULT]: '1362227906343997583'    // Global fallback (same as mastery)
};

// NEW: Tiebreaker-specific emojis
const TIEBREAKER_EMOJIS = {
    TIEBREAKER: '⚔️',        // Main tiebreaker
    TIEBREAKER_BREAKER: '🗡️', // Tiebreaker-breaker
    COMBAT: '⚡',             // For intense competition
    SHIELD: '🛡️',            // For defensive positioning
    SWORD: '🗡️',             // Alternative tiebreaker-breaker
    CROWN: '👑'              // For ultimate victory
};

/**
 * Helper class for sending alerts to designated channels
 * Enhanced to support tiebreaker-breaker functionality and improved formatting
 */
export class AlertManager {
    constructor(client) {
        this.client = client;
        this.channelIds = { ...DEFAULT_CHANNEL_IDS };
        
        console.log('AlertManager initialized with channels:', this.channelIds);
    }
    
    setClient(client) {
        this.client = client;
        console.log('AlertUtils client configured');
    }
    
    /**
     * Get the appropriate color for an alert type
     */
    getColorForAlertType(alertType) {
        return ALERT_COLORS[alertType] || ALERT_COLORS[ALERT_TYPES.DEFAULT];
    }
    
    /**
     * Legacy method for backward compatibility
     * @param {string} channelId - Channel ID to set as default
     */
    setAlertsChannel(channelId) {
        this.channelIds[ALERT_TYPES.DEFAULT] = channelId;
        console.log(`AlertUtils default channel set to ${channelId}`);
    }
    
    /**
     * Set a specific alert channel for a given type
     * @param {string} alertType - Type of alert (use ALERT_TYPES constants)
     * @param {string} channelId - Channel ID to use for this alert type
     */
    setChannelForAlertType(alertType, channelId) {
        if (!alertType) return;
        
        this.channelIds[alertType] = channelId;
        console.log(`AlertUtils channel for ${alertType} set to ${channelId}`);
    }
    
    /**
     * Set multiple alert channels at once
     * @param {Object} channelMapping - Mapping of alert types to channel IDs
     */
    setAlertChannels(channelMapping) {
        if (!channelMapping) return;
        
        for (const [type, id] of Object.entries(channelMapping)) {
            this.channelIds[type] = id;
        }
        console.log(`AlertUtils configured with ${Object.keys(channelMapping).length} channels`);
    }
    
    /**
     * Initialize alert channels from environment or config
     * This should be called once during bot startup
     */
    initializeFromConfig() {
        try {
            const originalChannels = { ...this.channelIds };
            
            this.channelIds = {
                ...DEFAULT_CHANNEL_IDS,
                [ALERT_TYPES.ARCADE]: config.discord.arcadeAlertsChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ARCADE],
                [ALERT_TYPES.ARENA]: config.discord.arenaChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ARENA],
                [ALERT_TYPES.MONTHLY]: config.discord.monthlyChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.MONTHLY],
                [ALERT_TYPES.SHADOW]: config.discord.shadowChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.SHADOW],
                [ALERT_TYPES.MASTERY]: config.discord.masteryChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.MASTERY],
                [ALERT_TYPES.ACHIEVEMENT]: config.discord.achievementChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ACHIEVEMENT],
                [ALERT_TYPES.TIEBREAKER]: config.discord.tiebreakerChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.TIEBREAKER],
                [ALERT_TYPES.TIEBREAKER_BREAKER]: config.discord.tiebreakerBreakerChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.TIEBREAKER_BREAKER],
                [ALERT_TYPES.DEFAULT]: config.discord.defaultAlertsChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.DEFAULT]
            };
            
            console.log('AlertUtils channels initialized from config');
            console.log('Channel mappings:', this.channelIds);
        } catch (error) {
            console.error('Error initializing AlertUtils channels from config:', error);
        }
    }
    
    /**
     * Get the appropriate channel for an alert type
     * @param {string} alertType - Type of alert to get channel for
     * @param {string} overrideChannelId - Optional specific channel ID to override defaults
     * @returns {Promise<Discord.TextChannel|null>} - The channel object or null if not found
     */
    async getAlertsChannel(alertType = null, overrideChannelId = null) {
        if (!this.client) {
            console.error('AlertUtils: Discord client not set');
            return null;
        }
        
        let channelId = null;
        
        if (overrideChannelId) {
            channelId = overrideChannelId;
            console.log(`Using override channel: ${channelId}`);
        } else if (alertType && this.channelIds[alertType]) {
            channelId = this.channelIds[alertType];
            console.log(`Using ${alertType} channel: ${channelId}`);
        } else if (this.channelIds[ALERT_TYPES.DEFAULT]) {
            channelId = this.channelIds[ALERT_TYPES.DEFAULT];
            console.log(`Using default channel: ${channelId}`);
        }
        
        if (!channelId) {
            console.warn(`No channel configured for alert type: ${alertType || 'default'}`);
            return null;
        }
        
        return this.getChannelById(channelId);
    }
    
    /**
     * Helper method to get a channel by ID
     * @private
     */
    async getChannelById(channelId) {
        if (!channelId) return null;
        
        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error(`Guild not found: ${config.discord.guildId}`);
                return null;
            }
            
            const channel = await guild.channels.fetch(channelId);
            if (!channel) {
                console.error(`Channel not found: ${channelId}`);
                return null;
            }
            
            console.log(`Successfully fetched channel: ${channel.name} (${channelId})`);
            return channel;
        } catch (error) {
            console.error(`Error getting alerts channel ${channelId}:`, error);
            return null;
        }
    }
    
    /**
     * NEW: Enhanced method to format tiebreaker information for display
     * @param {string} scoreText - The score text that may contain tiebreaker info
     * @returns {Object} - Formatted score information
     */
    formatTiebreakerScore(scoreText) {
        if (!scoreText) return { primary: '', tiebreaker: '', tiebreakerBreaker: '' };
        
        const lines = scoreText.split('\n');
        const primary = lines[0] || '';
        
        let tiebreaker = '';
        let tiebreakerBreaker = '';
        
        // Look for tiebreaker and tiebreaker-breaker lines
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.includes('⚔️') || line.includes('Tiebreaker:')) {
                tiebreaker = line;
            } else if (line.includes('🗡️') || line.includes('TB-Breaker:')) {
                tiebreakerBreaker = line;
            }
        }
        
        return { primary, tiebreaker, tiebreakerBreaker };
    }
    
    /**
     * ENHANCED: Send a standard alert for position/rank changes with improved tiebreaker support
     * @param {Object} options - Alert options
     * @param {string} alertType - The type of alert to send (determines channel and color)
     * @param {string} overrideChannelId - Optional specific channel ID to override default
     */
    async sendPositionChangeAlert(options, alertType = ALERT_TYPES.ARCADE, overrideChannelId = null) {
        try {
            console.log(`Sending position change alert - Type: ${alertType}, Override: ${overrideChannelId || 'none'}`);
            
            const {
                title,
                description,
                changes = [],
                currentStandings = [],
                thumbnail = null,
                color = null, // Will be overridden by alert type color
                footer = null,
                hasTiebreaker = false,        // NEW: Indicates if tiebreaker is active
                hasTiebreakerBreaker = false, // NEW: Indicates if tiebreaker-breaker is active
                tiebreakerGame = null,        // NEW: Name of tiebreaker game
                tiebreakerBreakerGame = null  // NEW: Name of tiebreaker-breaker game
            } = options;
            
            const channel = await this.getAlertsChannel(alertType, overrideChannelId);
            if (!channel) {
                console.error(`No alerts channel found for type ${alertType}, skipping notification`);
                return;
            }
            
            console.log(`Sending position change alert to channel: ${channel.name} (${channel.id})`);
            
            // Use alert type specific color, or fallback to provided color
            const alertColor = this.getColorForAlertType(alertType);
            
            // Create timestamp
            const timestamp = getDiscordTimestamp(new Date());
            
            // NEW: Enhanced description with tiebreaker context
            let enhancedDescription = `${description}\n**Time:** ${timestamp}`;
            
            // Add tiebreaker context if active
            if (hasTiebreaker && tiebreakerGame) {
                enhancedDescription += `\n\n${TIEBREAKER_EMOJIS.TIEBREAKER} **Active Tiebreaker:** ${tiebreakerGame}`;
                if (hasTiebreakerBreaker && tiebreakerBreakerGame) {
                    enhancedDescription += `\n${TIEBREAKER_EMOJIS.TIEBREAKER_BREAKER} **Tiebreaker-Breaker:** ${tiebreakerBreakerGame}`;
                }
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(alertColor)
                .setTitle(title)
                .setDescription(enhancedDescription)
                .setTimestamp();
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            // Add position changes if any exist
            if (changes && changes.length > 0) {
                let changesText = '';
                changes.forEach(change => {
                    let rankEmoji = '';
                    if (change.newRank && change.newRank <= 3) {
                        rankEmoji = EMOJIS[`RANK_${change.newRank}`];
                    } else {
                        rankEmoji = `#${change.newRank || ''}`;
                    }
                    
                    // NEW: Add special indicators for tiebreaker victories
                    let specialIndicator = '';
                    if (hasTiebreaker && change.newRank <= 3) {
                        if (hasTiebreakerBreaker) {
                            specialIndicator = ` ${TIEBREAKER_EMOJIS.CROWN}`;
                        } else {
                            specialIndicator = ` ${TIEBREAKER_EMOJIS.TIEBREAKER}`;
                        }
                    }
                    
                    changesText += `**${change.username}** is now in ${rankEmoji} place!${specialIndicator}\n`;
                });
                
                embed.addFields({ 
                    name: hasTiebreaker ? 'Tiebreaker Position Changes' : 'Position Changes', 
                    value: changesText 
                });
            }
            
            // ENHANCED: Add current standings with improved tiebreaker formatting
            if (currentStandings && currentStandings.length > 0) {
                // Sort by rank (lower is better)
                const sortedStandings = [...currentStandings]
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
                
                let standingsText = '';
                sortedStandings.slice(0, 5).forEach(user => {
                    const rankEmoji = user.rank <= 3 ? 
                        EMOJIS[`RANK_${user.rank}`] : 
                        `#${user.rank}`;
                    
                    // Show global rank in parentheses if available
                    const globalRank = user.globalRank ? ` (Global: #${user.globalRank})` : '';
                    
                    // NEW: Enhanced handling of tiebreaker scores
                    const scoreInfo = this.formatTiebreakerScore(user.score || user.value);
                    
                    standingsText += `${rankEmoji} **${user.username}**: ${scoreInfo.primary}${globalRank}\n`;
                    
                    // NEW: Better formatting for tiebreaker information
                    if (scoreInfo.tiebreaker) {
                        standingsText += `   ${scoreInfo.tiebreaker}\n`;
                    }
                    
                    if (scoreInfo.tiebreakerBreaker) {
                        standingsText += `   ${scoreInfo.tiebreakerBreaker}\n`;
                    }
                    
                    // Add a small spacing between users for readability
                    if (scoreInfo.tiebreaker || scoreInfo.tiebreakerBreaker) {
                        standingsText += '\n';
                    }
                });
                
                // NEW: Enhanced field name based on tiebreaker status
                let fieldName = 'Current Top 5';
                if (hasTiebreaker) {
                    if (hasTiebreakerBreaker) {
                        fieldName = `${TIEBREAKER_EMOJIS.TIEBREAKER_BREAKER} Tiebreaker Rankings`;
                    } else {
                        fieldName = `${TIEBREAKER_EMOJIS.TIEBREAKER} Tiebreaker Rankings`;
                    }
                }
                
                embed.addFields({ 
                    name: fieldName, 
                    value: standingsText 
                });
            }
            
            // NEW: Add tiebreaker explanation if active
            if (hasTiebreaker) {
                let explanationText = `${TIEBREAKER_EMOJIS.TIEBREAKER} Tied users in top positions are ranked by their performance in ${tiebreakerGame}.`;
                
                if (hasTiebreakerBreaker) {
                    explanationText += `\n${TIEBREAKER_EMOJIS.TIEBREAKER_BREAKER} Users tied in the tiebreaker are further ranked by ${tiebreakerBreakerGame}.`;
                }
                
                embed.addFields({
                    name: 'Tiebreaker System',
                    value: explanationText
                });
            }
            
            // Add footer if provided
            if (footer) {
                embed.setFooter(footer);
            } else {
                let footerText = 'Rankings update regularly. Check the feed channel for full standings.';
                if (hasTiebreaker) {
                    footerText = 'Tiebreaker system active. Rankings determined by multiple games.';
                }
                embed.setFooter({ text: footerText });
            }
            
            // Send the alert
            await channel.send({ embeds: [embed] });
            console.log(`Successfully sent position change alert to ${channel.name} (${alertType}): "${title}"`);
        } catch (error) {
            console.error(`Error sending position change alert (${alertType}):`, error);
        }
    }
    
    /**
     * NEW: Send a tiebreaker activation alert
     * @param {Object} options - Alert options
     * @param {string} overrideChannelId - Optional specific channel ID to override default
     */
    async sendTiebreakerActivationAlert(options, overrideChannelId = null) {
        try {
            const {
                tiebreakerGame,
                description,
                endDate,
                thumbnail = null,
                hasTiebreakerBreaker = false,
                tiebreakerBreakerGame = null
            } = options;
            
            const channel = await this.getAlertsChannel(ALERT_TYPES.TIEBREAKER, overrideChannelId);
            if (!channel) {
                console.error('No tiebreaker alerts channel found, skipping notification');
                return;
            }
            
            const timestamp = getDiscordTimestamp(new Date());
            const endTimestamp = endDate ? getDiscordTimestamp(endDate, 'F') : 'TBD';
            
            let alertDescription = `${TIEBREAKER_EMOJIS.TIEBREAKER} **A tiebreaker challenge is now active!**\n\n` +
                                  `**Game:** ${tiebreakerGame}\n` +
                                  `**Description:** ${description}\n` +
                                  `**Ends:** ${endTimestamp}\n\n` +
                                  `This tiebreaker will resolve ties in the monthly challenge leaderboard.`;
            
            if (hasTiebreakerBreaker) {
                alertDescription += `\n\n${TIEBREAKER_EMOJIS.TIEBREAKER_BREAKER} **Tiebreaker-Breaker:** ${tiebreakerBreakerGame}\n` +
                                   `*Used to resolve ties within the tiebreaker itself.*`;
            }
            
            alertDescription += `\n\n**Time:** ${timestamp}`;
            
            const embed = new EmbedBuilder()
                .setColor(ALERT_COLORS[ALERT_TYPES.TIEBREAKER])
                .setTitle(`${TIEBREAKER_EMOJIS.COMBAT} Tiebreaker Challenge Active!`)
                .setDescription(alertDescription)
                .setTimestamp();
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            embed.setFooter({ 
                text: 'Compete in the tiebreaker to improve your ranking!' 
            });
            
            await channel.send({ embeds: [embed] });
            console.log(`Successfully sent tiebreaker activation alert to ${channel.name}`);
        } catch (error) {
            console.error('Error sending tiebreaker activation alert:', error);
        }
    }
    
    /**
     * NEW: Send a tiebreaker completion alert
     * @param {Object} options - Alert options
     * @param {string} overrideChannelId - Optional specific channel ID to override default
     */
    async sendTiebreakerCompletionAlert(options, overrideChannelId = null) {
        try {
            const {
                tiebreakerGame,
                winners = [],
                participantCount = 0,
                thumbnail = null,
                hasTiebreakerBreaker = false,
                tiebreakerBreakerGame = null
            } = options;
            
            const channel = await this.getAlertsChannel(ALERT_TYPES.TIEBREAKER, overrideChannelId);
            if (!channel) {
                console.error('No tiebreaker alerts channel found, skipping notification');
                return;
            }
            
            const timestamp = getDiscordTimestamp(new Date());
            
            let alertDescription = `${TIEBREAKER_EMOJIS.CROWN} **The tiebreaker challenge has concluded!**\n\n` +
                                  `**Game:** ${tiebreakerGame}\n` +
                                  `**Participants:** ${participantCount}\n\n`;
            
            if (hasTiebreakerBreaker) {
                alertDescription += `${TIEBREAKER_EMOJIS.TIEBREAKER_BREAKER} **Tiebreaker-Breaker:** ${tiebreakerBreakerGame}\n\n`;
            }
            
            alertDescription += `**Time:** ${timestamp}`;
            
            const embed = new EmbedBuilder()
                .setColor(ALERT_COLORS[ALERT_TYPES.TIEBREAKER])
                .setTitle(`${TIEBREAKER_EMOJIS.CROWN} Tiebreaker Complete!`)
                .setDescription(alertDescription)
                .setTimestamp();
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            // Add winners if provided
            if (winners && winners.length > 0) {
                let winnersText = '';
                winners.slice(0, 3).forEach((winner, index) => {
                    const rankEmoji = [EMOJIS.RANK_1, EMOJIS.RANK_2, EMOJIS.RANK_3][index];
                    winnersText += `${rankEmoji} **${winner.username}**: ${winner.score}\n`;
                    
                    if (winner.tiebreakerBreakerScore) {
                        winnersText += `   ${TIEBREAKER_EMOJIS.TIEBREAKER_BREAKER} ${winner.tiebreakerBreakerScore}\n`;
                    }
                });
                
                embed.addFields({
                    name: 'Final Tiebreaker Rankings',
                    value: winnersText
                });
            }
            
            embed.setFooter({ 
                text: 'Check the leaderboard for updated monthly challenge rankings!' 
            });
            
            await channel.send({ embeds: [embed] });
            console.log(`Successfully sent tiebreaker completion alert to ${channel.name}`);
        } catch (error) {
            console.error('Error sending tiebreaker completion alert:', error);
        }
    }
    
    /**
     * Send a standard alert for new achievements/awards
     * @param {Object} options - Alert options
     * @param {string} alertType - The type of alert to send (determines channel)
     * @param {string} overrideChannelId - Optional specific channel ID to override default
     */
    async sendAchievementAlert(options, alertType = null, overrideChannelId = null) {
        try {
            const {
                username,
                achievementTitle,
                achievementDescription,
                gameTitle,
                gameId,
                points = null,
                thumbnail = null,
                badgeUrl = null,
                color = null, // Will be overridden by alert type color
                isAward = false,
                isMastery = false,
                isBeaten = false
            } = options;
            
            // Determine the correct alert type based on explicit parameter first
            let targetAlertType = alertType;
            
            if (!targetAlertType) {
                if (isMastery || isBeaten) {
                    targetAlertType = ALERT_TYPES.MASTERY;
                } else if (isAward) {
                    targetAlertType = ALERT_TYPES.ACHIEVEMENT;
                } else {
                    targetAlertType = ALERT_TYPES.ACHIEVEMENT;
                }
            }
            
            console.log(`Sending achievement alert - Type: ${targetAlertType}, Override: ${overrideChannelId || 'none'}`);
            
            const channel = await this.getAlertsChannel(targetAlertType, overrideChannelId);
            if (!channel) {
                console.error(`No alerts channel found for type ${targetAlertType}, skipping notification`);
                return;
            }
            
            console.log(`Sending achievement alert to channel: ${channel.name} (${channel.id})`);
            
            // Use alert type specific color
            const alertColor = this.getColorForAlertType(targetAlertType);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(alertColor)
                .setTimestamp();
            
            // Create title based on achievement or award
            if (isMastery) {
                embed.setTitle(`✨ ${username} Mastered a Game!`);
            } else if (isBeaten) {
                embed.setTitle(`⭐ ${username} Beaten a Game!`);
            } else if (isAward) {
                embed.setTitle(`🏆 ${username} earned an award!`);
            } else {
                embed.setTitle(`🎮 Achievement Unlocked!`);
            }
            
            // Create description
            const gameUrl = `https://retroachievements.org/game/${gameId}`;
            let description = '';
            
            if (isMastery) {
                description = `**${username}** has mastered **${gameTitle}**!\n` +
                             `They've earned every achievement in the game.`;
            } else if (isBeaten) {
                description = `**${username}** has beaten **${gameTitle}**!\n` +
                             `They've completed the core achievements.`;
            } else if (isAward) {
                description = `**${username}** has earned **${achievementTitle}**\n` +
                             `Game: [${gameTitle}](${gameUrl})`;
            } else {
                description = `**${username}** has unlocked **${achievementTitle}**\n` +
                             `Game: [${gameTitle}](${gameUrl})`;
            }
            
            embed.setDescription(description);
            
            // Add achievement description if available
            if (achievementDescription && !isAward && !isMastery && !isBeaten) {
                embed.addFields({ 
                    name: 'Description', 
                    value: `*${achievementDescription}*` 
                });
            }
            
            // Add points if available
            if (points) {
                embed.addFields({ 
                    name: 'Points', 
                    value: `${points}` 
                });
            }
            
            // Set thumbnail (game icon) or badge image
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            } else if (badgeUrl) {
                embed.setThumbnail(badgeUrl);
            }
            
            // Send the alert
            await channel.send({ embeds: [embed] });
            console.log(`Successfully sent ${targetAlertType} alert to ${channel.name} for ${username}: "${achievementTitle}"`);
        } catch (error) {
            console.error(`Error sending achievement alert (${alertType}):`, error);
        }
    }
    
    /**
     * Send a mastery alert (convenience method)
     */
    async sendMasteryAlert(options, overrideChannelId = null) {
        return this.sendAchievementAlert(
            { ...options, isMastery: true },
            ALERT_TYPES.MASTERY,
            overrideChannelId
        );
    }
    
    /**
     * Send a beaten game alert (convenience method)
     */
    async sendBeatenAlert(options, overrideChannelId = null) {
        return this.sendAchievementAlert(
            { ...options, isBeaten: true },
            ALERT_TYPES.MASTERY,
            overrideChannelId
        );
    }
    
    /**
     * Send a monthly challenge award alert (convenience method)
     */
    async sendMonthlyAwardAlert(options, overrideChannelId = null) {
        return this.sendAchievementAlert(
            { ...options, isAward: true },
            ALERT_TYPES.MONTHLY,
            overrideChannelId
        );
    }
    
    /**
     * Send a shadow challenge award alert (convenience method)
     */
    async sendShadowAwardAlert(options, overrideChannelId = null) {
        return this.sendAchievementAlert(
            { ...options, isAward: true },
            ALERT_TYPES.SHADOW,
            overrideChannelId
        );
    }
    
    /**
     * NEW: Send a tiebreaker-related alert (convenience method)
     */
    async sendTiebreakerAlert(options, overrideChannelId = null) {
        return this.sendPositionChangeAlert(
            { ...options, hasTiebreaker: true },
            ALERT_TYPES.TIEBREAKER,
            overrideChannelId
        );
    }
    
    /**
     * NEW: Send a tiebreaker-breaker alert (convenience method)
     */
    async sendTiebreakerBreakerAlert(options, overrideChannelId = null) {
        return this.sendPositionChangeAlert(
            { ...options, hasTiebreaker: true, hasTiebreakerBreaker: true },
            ALERT_TYPES.TIEBREAKER_BREAKER,
            overrideChannelId
        );
    }
}

// Create singleton instance
const alertManager = new AlertManager();

// Initialize channels from config when imported
alertManager.initializeFromConfig();

export default alertManager;
