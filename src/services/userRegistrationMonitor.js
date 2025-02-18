import { User } from '../models/index.js';
import retroAPI from './retroAPI.js';
import activityTracker from './activityTracker.js';
import { EmbedBuilder } from 'discord.js';

class UserRegistrationMonitor {
    constructor(client) {
        this.client = client;
        this.monitoredChannels = new Set();
        this.registrationChannel = null;
    }

    /**
     * Initialize the registration channel for announcements
     * @param {string} channelId - Discord channel ID for registration announcements
     */
    setRegistrationChannel(channelId) {
        if (channelId) {
            this.registrationChannel = this.client.channels.cache.get(channelId);
            if (!this.registrationChannel) {
                console.warn(`Warning: Registration channel ${channelId} not found`);
            }
        }
    }

    /**
     * Add a channel to monitor for usernames
     * @param {string} channelId - Discord channel ID to monitor
     */
    addMonitoredChannel(channelId) {
        if (channelId) {
            const channel = this.client.channels.cache.get(channelId);
            if (channel) {
                this.monitoredChannels.add(channelId);
            } else {
                console.warn(`Warning: Monitor channel ${channelId} not found`);
            }
        }
    }

    /**
     * Remove a channel from monitoring
     * @param {string} channelId - Discord channel ID to stop monitoring
     */
    removeMonitoredChannel(channelId) {
        this.monitoredChannels.delete(channelId);
    }

    /**
     * Start monitoring messages for RetroAchievements usernames
     */
    startMonitoring() {
        this.client.on('messageCreate', async (message) => {
            // Check if message is in a monitored channel
            if (!this.monitoredChannels.has(message.channelId)) return;

            // Extract potential RA usernames from message
            // Look for common patterns like "RA: username" or "RetroAchievements: username"
            const patterns = [
                /RA:\s*([a-zA-Z0-9_]+)/i,
                /RetroAchievements:\s*([a-zA-Z0-9_]+)/i,
                /username:\s*([a-zA-Z0-9_]+)/i
            ];

            for (const pattern of patterns) {
                const match = message.content.match(pattern);
                if (match) {
                    const username = match[1];
                    await this.processUsername(username, message.author);
                    break;
                }
            }
        });
    }

    /**
     * Process a potential RetroAchievements username
     * @param {string} username - RetroAchievements username to verify
     * @param {Object} discordUser - Discord user object
     */
    async processUsername(username, discordUser) {
        try {
            // Check if username exists on RetroAchievements
            const userExists = await retroAPI.validateUsername(username);
            if (!userExists) {
                await this.announceError(username, 'Username not found on RetroAchievements');
                return;
            }

            // Check if username is already registered
            const existingUser = await User.findByRAUsername(username);
            if (existingUser) {
                await this.announceError(username, 'Username already registered');
                return;
            }

            // Create new user
            const user = new User({
                raUsername: username,
                discordId: discordUser.id,
                discordUsername: discordUser.username,
                joinDate: new Date(),
                activityTier: 'ACTIVE', // Start as active to ensure proper tracking
                lastActivity: new Date()
            });

            await user.save();

            // Start activity tracking
            await activityTracker.startTracking(username);

            // Announce successful registration
            await this.announceRegistration(username, discordUser);

        } catch (error) {
            console.error(`Error processing username ${username}:`, error);
            await this.announceError(username, 'An error occurred while processing the registration');
        }
    }

    /**
     * Announce successful registration
     * @param {string} username - RetroAchievements username
     * @param {Object} discordUser - Discord user object
     */
    async announceRegistration(username, discordUser) {
        if (!this.registrationChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ New User Registered')
            .setDescription(`Successfully registered RetroAchievements user!`)
            .addFields(
                { name: 'RA Username', value: username, inline: true },
                { name: 'Discord User', value: discordUser.username, inline: true }
            )
            .setTimestamp();

        await this.registrationChannel.send({ embeds: [embed] });
    }

    /**
     * Announce registration error
     * @param {string} username - RetroAchievements username
     * @param {string} error - Error message
     */
    async announceError(username, error) {
        if (!this.registrationChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Registration Error')
            .setDescription(`Error registering username: ${username}`)
            .addFields(
                { name: 'Error', value: error }
            )
            .setTimestamp();

        await this.registrationChannel.send({ embeds: [embed] });
    }
}

// Create and export singleton instance
const userRegistrationMonitor = new UserRegistrationMonitor();
export default userRegistrationMonitor;
