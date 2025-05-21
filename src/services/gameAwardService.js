// src/services/gameAwardService.js
import { EmbedBuilder } from 'discord.js';
import { User } from '../models/User.js';
import retroAPI from './retroAPI.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';

class GameAwardService {
    constructor() {
        this.client = null;
        this.channelCache = new Map(); // Cache channels by ID
        this.channelIds = {
            monthlyChallenge: '1313640664356880445',
            shadowGame: '1300941091335438470',
            retroachievement: '1362227906343997583'
        };
        
        // In-memory tracking to prevent duplicates
        this.sessionAnnouncementHistory = new Set();
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for game award service');
    }

    async initialize() {
        // Pre-cache channels to improve performance
        for (const [key, channelId] of Object.entries(this.channelIds)) {
            try {
                const channel = await this.getChannel(channelId);
                if (channel) {
                    this.channelCache.set(channelId, channel);
                    console.log(`Cached ${key} channel: ${channel.name}`);
                }
            } catch (error) {
                console.error(`Failed to cache ${key} channel:`, error);
            }
        }
    }

    async getChannel(channelId) {
        if (this.channelCache.has(channelId)) {
            return this.channelCache.get(channelId);
        }

        if (!this.client) {
            console.error('Discord client not set for game award service');
            return null;
        }

        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) return null;

            const channel = await guild.channels.fetch(channelId);
            if (channel) {
                this.channelCache.set(channelId, channel);
            }
            return channel;
        } catch (error) {
            console.error(`Error getting channel ${channelId}:`, error);
            return null;
        }
    }

    // Process monthly and shadow game awards (existing logic from AchievementFeedService)
    async checkForGameAwards(user, gameId, isShadow) {
        // Get the appropriate channel
        const channelId = isShadow ? this.channelIds.shadowGame : this.channelIds.monthlyChallenge;
        const channel = await this.getChannel(channelId);
        
        if (!channel) {
            console.error(`Cannot find channel for ${isShadow ? 'shadow' : 'monthly'} game awards`);
            return;
        }
        
        // [Existing logic for determining awards from AchievementFeedService.checkForGameAwards]
        // ...
        
        // If award determined, announce it
        if (currentAward) {
            await this.announceGameAward(
                channel,
                user,
                gameInfo,
                currentAward,
                progress.numAwardedToUser,
                totalAchievements,
                isShadow
            );
            
            // Add to history and update user record
            // ...
        }
    }

    // New method to check if a game has been mastered
    async checkForGameMastery(user, gameId, achievement) {
        // Skip if we already have this in session history
        const masteryIdentifier = `${user.raUsername}:mastery:${gameId}`;
        if (this.sessionAnnouncementHistory.has(masteryIdentifier)) {
            return;
        }

        // Also check if it's already in the database
        if (user.announcedAchievements.some(id => 
            id.startsWith(`${user.raUsername}:mastery:${gameId}`)
        )) {
            return;
        }

        try {
            // Get game info and user progress
            const gameInfo = await retroAPI.getGameInfo(gameId);
            const progress = await retroAPI.getUserGameProgress(user.raUsername, gameId);
            
            // Check if user has earned all achievements
            if (progress.numAwardedToUser === gameInfo.numAchievements) {
                // Get mastery channel
                const channel = await this.getChannel(this.channelIds.retroachievement);
                if (!channel) return;
                
                // Announce mastery
                await this.announceMastery(
                    channel,
                    user,
                    gameInfo,
                    progress.numAwardedToUser
                );
                
                // Add to session history
                this.sessionAnnouncementHistory.add(masteryIdentifier);
                
                // Add to user's announced achievements
                const masteryIdentifierWithTimestamp = `${masteryIdentifier}:${Date.now()}`;
                await User.findOneAndUpdate(
                    { _id: user._id },
                    { 
                        $push: { 
                            announcedAchievements: masteryIdentifierWithTimestamp
                        }
                    },
                    { new: true }
                );
            }
        } catch (error) {
            console.error(`Error checking for game mastery ${user.raUsername} on ${gameId}:`, error);
        }
    }

    // New method for announcing game masteries
    async announceMastery(channel, user, gameInfo, totalAchievements) {
        try {
            console.log(`Creating embed for game mastery: ${user.raUsername} mastered ${gameInfo.title}`);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(COLORS.GOLD)  // Gold for masteries
                .setTimestamp();
            
            // Set game name and platform as the title with clickable link to game page
            const platformText = gameInfo?.consoleName ? ` • ${gameInfo.consoleName}` : '';
            embed.setTitle(`${gameInfo?.title || 'Unknown Game'}${platformText}`);
            embed.setURL(`https://retroachievements.org/game/${gameInfo.id}`);
            
            // Set author with ✨ emoji
            embed.setAuthor({
                name: `Game Mastery ${EMOJIS.MASTERY}`,
                iconURL: 'https://raw.githubusercontent.com/marquessam/select_start_bot2/a58a4136ff0597217bb9fb181115de3f152b71e4/assets/logo_simple.png'
            });
            
            // Set thumbnail to game icon
            if (gameInfo?.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            // Get user's profile image URL for footer
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
            
            // Create user link
            const userLink = `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})`;
            
            // Build description
            let description = '';
            description += `${userLink} has **MASTERED** this game!\n\n`;
            description += `*All ${totalAchievements} achievements completed!*`;
            
            embed.setDescription(description);

            // Footer - just points and user icon
            embed.setFooter({
                text: `Total Achievements: ${totalAchievements}`,
                iconURL: profileImageUrl
            });

            console.log(`Sending mastery announcement to channel`);
            
            // Send the announcement
            const sentMessage = await channel.send({ embeds: [embed] });
            console.log(`Successfully sent mastery announcement, message ID: ${sentMessage.id}`);
            return true;
        } catch (error) {
            console.error('Error announcing mastery:', error);
            return false;
        }
    }
    
    // Remaining methods from AchievementFeedService:
    // - getUserProfileImageUrl
    // - announceGameAward
    // etc.
}

// Create singleton instance
const gameAwardService = new GameAwardService();
export default gameAwardService;
