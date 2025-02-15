import achievementTracker from './achievementTracker.js';
import leaderboardService from './leaderboardService.js';
import nominationService from './nominationService.js';
import retroAPI from './retroAPI.js';
import arcadeService from './arcadeService.js';

// Initialize services that require setup
export const initializeServices = async (client, config) => {
    try {
        // Set up achievement tracker with Discord client and channel
        achievementTracker.client = client;
        achievementTracker.setAchievementChannel(config.discord.achievementChannelId);

        console.log('Services initialized successfully');
    } catch (error) {
        console.error('Error initializing services:', error);
        throw error;
    }
};

export {
    achievementTracker,
    leaderboardService,
    nominationService,
    retroAPI,
    arcadeService
};

export default {
    achievementTracker,
    leaderboardService,
    nominationService,
    retroAPI,
    arcadeService,
    initializeServices
};
