// src/utils/FeedManagerBase.js
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

/**
 * Base class for all feed managers
 */
export class FeedManagerBase {
    constructor(client, channelId) {
        this.client = client;
        this.channelId = channelId || null;
        this.messageIds = new Map(); // Map of messageKey -> messageId
        this.headerMessageId = null;
        this.updateInterval = null;
    }

    setClient(client) {
        this.client = client;
        console.log(`Discord client set for ${this.constructor.name}`);
    }

    async start(intervalMs = 60 * 60 * 1000) { // Default 1 hour
        if (!this.client) {
            console.error(`Discord client not set for ${this.constructor.name}`);
            return;
        }

        try {
            console.log(`Starting ${this.constructor.name}...`);
            
            // Clear the channel (can be overridden)
            if (this.shouldClearOnStart()) {
                await this.clearChannel();
            }
            
            // Initial update
            await this.update();
            
            // Set up recurring updates
            this.updateInterval = setInterval(() => {
                this.update().catch(error => {
                    console.error(`Error updating ${this.constructor.name}:`, error);
                });
            }, intervalMs);
            
            console.log(`${this.constructor.name} started. Updates every ${intervalMs / 60000} minutes.`);
        } catch (error) {
            console.error(`Error starting ${this.constructor.name}:`, error);
        }
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log(`${this.constructor.name} stopped.`);
        }
    }

    // Methods that subclasses must implement
    async update() {
        throw new Error('Method update() must be implemented by subclass');
    }

    // Methods that subclasses can override
    shouldClearOnStart() {
        return true; // Default is to clear on start
    }

    // Helper methods
    async getChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return null;
        }

        try {
            const guildId = config.discord.guildId;
            const guild = await this.client.guilds.fetch(guildId);
            
            if (!guild) {
                console.error(`Guild not found: ${guildId}`);
                return null;
            }

            const channel = await guild.channels.fetch(this.channelId);
            
            if (!channel) {
                console.error(`Channel not found: ${this.channelId}`);
                return null;
            }
            
            return channel;
        } catch (error) {
            console.error('Error getting channel:', error);
            return null;
        }
    }

    async clearChannel() {
        try {
            const channel = await this.getChannel();
            if (!channel) return false;
            
            // Define allowed feed channels that can be safely cleared
            const ALLOWED_FEED_CHANNELS = [
                '1371350718505811989', // leaderboard feed
                '1371363491130114098', // arcade feed
                '1373570913882214410'  // arena feed
            ];
            
            // Check if this channel is allowed to be cleared
            if (!ALLOWED_FEED_CHANNELS.includes(this.channelId)) {
                console.warn(`Attempted to clear channel ${this.channelId} which is not in the allowed feed channels list. Clearing skipped for safety.`);
                return false;
            }
            
            console.log(`Clearing feed channel ${this.channelId}...`);
            
            let messagesDeleted = 0;
            let messages;
            
            do {
                messages = await channel.messages.fetch({ limit: 100 });
                if (messages.size > 0) {
                    try {
                        await channel.bulkDelete(messages);
                        messagesDeleted += messages.size;
                    } catch (bulkError) {
                        // Fall back to individual deletion for older messages
                        for (const [id, message] of messages) {
                            try {
                                await message.delete();
                                messagesDeleted++;
                            } catch (deleteError) {
                                console.error(`Error deleting message ${id}`);
                            }
                            // Add delay to avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
            } while (messages.size >= 100);
            
            // Reset state
            this.messageIds.clear();
            this.headerMessageId = null;
            
            console.log(`Cleared ${messagesDeleted} messages from feed channel ${this.channelId}`);
            return true;
        } catch (error) {
            console.error('Error clearing channel:', error);
            return false;
        }
    }

    async updateMessage(key, content, pin = false) {
        try {
            const channel = await this.getChannel();
            if (!channel) return null;
            
            if (this.messageIds.has(key)) {
                try {
                    const messageId = this.messageIds.get(key);
                    const message = await channel.messages.fetch(messageId);
                    await message.edit(content);
                    return messageId;
                } catch (error) {
                    if (error.message.includes('Unknown Message')) {
                        // Message was deleted, create a new one
                        this.messageIds.delete(key);
                    } else {
                        throw error;
                    }
                }
            }
            
            // Create a new message
            const message = await channel.send(content);
            this.messageIds.set(key, message.id);
            
            // Pin if requested
            if (pin) {
                try {
                    const pinnedMessages = await channel.messages.fetchPinned();
                    if (pinnedMessages.size >= 50) {
                        // Unpin oldest if limit reached
                        const oldestPinned = pinnedMessages.last();
                        await oldestPinned.unpin();
                    }
                    await message.pin();
                } catch (pinError) {
                    console.error(`Error pinning message: ${pinError.message}`);
                }
            }
            
            return message.id;
        } catch (error) {
            console.error(`Error updating message ${key}:`, error);
            return null;
        }
    }

    async updateHeader(content) {
        const messageId = await this.updateMessage('header', content, true);
        this.headerMessageId = messageId;
        return messageId;
    }

    async sendTemporaryMessage(options, hoursUntilDelete = 3) {
        try {
            const channel = await this.getChannel();
            if (!channel) return null;
            
            const sentMessage = await channel.send(options);
            
            // Schedule deletion
            setTimeout(async () => {
                try {
                    const message = await channel.messages.fetch(sentMessage.id).catch(() => null);
                    if (message) await message.delete();
                } catch (error) {
                    console.error(`Error deleting temp message: ${error.message}`);
                }
            }, hoursUntilDelete * 60 * 60 * 1000);
            
            return sentMessage;
        } catch (error) {
            console.error('Error sending temporary message:', error);
            return null;
        }
    }
}

export default FeedManagerBase;
