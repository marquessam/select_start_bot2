// src/utils/AlertUtils.js
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import { COLORS, EMOJIS, getDiscordTimestamp } from './FeedUtils.js';

/**
 * Helper class for sending alerts to designated channels
 */
export class AlertManager {
    constructor(client) {
        this.client = client;
        this.alertsChannelId = null;
    }
    
    setClient(client) {
        this.client = client;
    }
    
    setAlertsChannel(channelId) {
        this.alertsChannelId = channelId;
    }
    
    async getAlertsChannel() {
        if (!this.client || !this.alertsChannelId) return null;
        
        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) return null;
            
            return await guild.channels.fetch(this.alertsChannelId);
        } catch (error) {
            console.error('Error getting alerts channel:', error);
            return null;
        }
    }
    
    /**
     * Send a standard alert for position/rank changes
     */
    async sendPositionChangeAlert(options) {
        const {
            title,
            description,
            changes = [],
            currentStandings = [],
            thumbnail = null,
            color = COLORS.WARNING,
            footer = null
        } = options;
        
        const channel = await this.getAlertsChannel();
        if (!channel) {
            console.log('No alerts channel configured, skipping notification');
            return;
        }
        
        // Create timestamp
        const timestamp = getDiscordTimestamp(new Date());
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(`${description}\n**Time:** ${timestamp}`)
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
                
                changesText += `**@${change.username}** is now in ${rankEmoji} place!\n`;
            });
            
            embed.addFields({ 
                name: 'Position Changes', 
                value: changesText 
            });
        }
        
        // Add current standings if provided
        if (currentStandings && currentStandings.length > 0) {
            let standingsText = '';
            currentStandings.slice(0, 5).forEach(user => {
                const rankEmoji = user.rank <= 3 ? 
                    EMOJIS[`RANK_${user.rank}`] : 
                    `#${user.rank}`;
                
                standingsText += `${rankEmoji} **@${user.username}**: ${user.score || user.value}\n`;
            });
            
            embed.addFields({ 
                name: 'Current Top 5', 
                value: standingsText 
            });
        }
        
        // Add footer if provided
        if (footer) {
            embed.setFooter(footer);
        } else {
            embed.setFooter({ 
                text: 'Rankings update regularly. Check the feed channel for full standings.' 
            });
        }
        
        // Send the alert
        await channel.send({ embeds: [embed] });
        console.log(`Sent position change alert: "${title}"`);
    }
    
    /**
     * Send a standard alert for new achievements/awards
     */
    async sendAchievementAlert(options) {
        const {
            username,
            achievementTitle,
            achievementDescription,
            gameTitle,
            gameId,
            points = null,
            thumbnail = null,
            badgeUrl = null,
            color = COLORS.SUCCESS,
            isAward = false
        } = options;
        
        const channel = await this.getAlertsChannel();
        if (!channel) {
            console.log('No alerts channel configured, skipping notification');
            return;
        }
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTimestamp();
        
        // Create title based on achievement or award
        if (isAward) {
            embed.setTitle(`🏆 ${username} earned an award!`);
        } else {
            embed.setTitle(`🎮 Achievement Unlocked!`);
        }
        
        // Create description
        const gameUrl = `https://retroachievements.org/game/${gameId}`;
        let description = '';
        
        if (isAward) {
            description = `**${username}** has earned **${achievementTitle}**\n` +
                         `Game: [${gameTitle}](${gameUrl})`;
        } else {
            description = `**${username}** has unlocked **${achievementTitle}**\n` +
                         `Game: [${gameTitle}](${gameUrl})`;
        }
        
        embed.setDescription(description);
        
        // Add achievement description if available
        if (achievementDescription) {
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
        if (badgeUrl) {
            embed.setThumbnail(badgeUrl);
        } else if (thumbnail) {
            embed.setThumbnail(thumbnail);
        }
        
        // Send the alert
        await channel.send({ embeds: [embed] });
        console.log(`Sent achievement alert for ${username}: "${achievementTitle}"`);
    }
}

// Create singleton instance
const alertManager = new AlertManager();
export default alertManager;
