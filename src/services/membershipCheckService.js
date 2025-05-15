// src/services/membershipCheckService.js
import { User } from '../models/User.js';
import { config } from '../config/config.js';

const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // Check once every 24 hours
const LOG_CHANNEL_ID = config.discord.adminLogChannelId || ''; // Channel for logging membership removals

class MembershipCheckService {
    constructor() {
        this.client = null;
        this.updateInterval = null;
        this.guildId = config.discord.guildId;
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for membership check service');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for membership check service');
            return;
        }

        try {
            console.log('Starting membership check service...');
            
            // Initial check on startup
            await this.checkMemberships();
            
            // Set up recurring checks
            this.updateInterval = setInterval(() => {
                this.checkMemberships().catch(error => {
                    console.error('Error checking memberships:', error);
                });
            }, CHECK_INTERVAL);
            
            console.log(`Membership check service started. Checks will occur every ${CHECK_INTERVAL / (60 * 60 * 1000)} hours.`);
        } catch (error) {
            console.error('Error starting membership check service:', error);
        }
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('Membership check service stopped.');
        }
    }

    async getLogChannel() {
        if (!this.client || !LOG_CHANNEL_ID) {
            return null;
        }

        try {
            const guild = await this.client.guilds.fetch(this.guildId);
            
            if (!guild) {
                return null;
            }

            return await guild.channels.fetch(LOG_CHANNEL_ID);
        } catch (error) {
            console.error('Error getting log channel:', error);
            return null;
        }
    }

    async checkMemberships() {
        try {
            console.log('Checking memberships for users who left the server...');
            
            // Get all registered users
            const users = await User.find({});
            
            if (users.length === 0) {
                console.log('No registered users found to check.');
                return;
            }
            
            console.log(`Found ${users.length} registered users to check.`);
            
            // Get the guild
            const guild = await this.client.guilds.fetch(this.guildId);
            if (!guild) {
                console.error(`Guild not found: ${this.guildId}`);
                return;
            }
            
            // Get log channel for reporting
            const logChannel = await this.getLogChannel();
            
            // Track users who were removed
            const removedUsers = [];
            
            // Check each user
            for (const user of users) {
                // Skip if no Discord ID (shouldn't happen, but just in case)
                if (!user.discordId) {
                    console.warn(`User ${user.raUsername} has no Discord ID.`);
                    continue;
                }
                
                try {
                    // Check if the user is still in the guild
                    const guildMember = await guild.members.fetch(user.discordId).catch(() => null);
                    
                    // If the user is no longer in the guild, remove them from the database
                    if (!guildMember) {
                        console.log(`User ${user.raUsername} (${user.discordId}) is no longer in the guild. Unregistering...`);
                        
                        // Store user info for logging
                        removedUsers.push({
                            raUsername: user.raUsername,
                            discordId: user.discordId
                        });
                        
                        // Delete the user from the database
                        await User.deleteOne({ _id: user._id });
                    }
                } catch (memberError) {
                    // This typically happens if the user is not in the guild
                    console.log(`Error fetching member ${user.discordId}, likely not in server. Unregistering ${user.raUsername}...`);
                    
                    // Store user info for logging
                    removedUsers.push({
                        raUsername: user.raUsername,
                        discordId: user.discordId
                    });
                    
                    // Delete the user from the database
                    await User.deleteOne({ _id: user._id });
                }
            }
            
            // Log the results
            if (removedUsers.length > 0) {
                console.log(`Removed ${removedUsers.length} users who left the server.`);
                
                // Send log to Discord if channel is available
                if (logChannel) {
                    // Get current Unix timestamp for Discord formatting
                    const unixTimestamp = Math.floor(Date.now() / 1000);
                    
                    let logMessage = `🔄 **Membership Check** (<t:${unixTimestamp}:f>)\n`;
                    logMessage += `${removedUsers.length} user(s) have left the server and were unregistered:\n\n`;
                    
                    removedUsers.forEach((user, index) => {
                        logMessage += `${index + 1}. **${user.raUsername}** (ID: ${user.discordId})\n`;
                    });
                    
                    await logChannel.send(logMessage);
                }
            } else {
                console.log('No users have left the server. No action taken.');
            }
            
        } catch (error) {
            console.error('Error checking memberships:', error);
        }
    }
    
    // Method to manually trigger a membership check
    async triggerCheck() {
        try {
            await this.checkMemberships();
            return true;
        } catch (error) {
            console.error('Error triggering membership check:', error);
            return false;
        }
    }
}

// Create singleton instance
const membershipCheckService = new MembershipCheckService();
export default membershipCheckService;
