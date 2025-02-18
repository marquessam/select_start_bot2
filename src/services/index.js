import achievementTracker from './achievementTracker.js';
import activityTracker from './activityTracker.js';
import leaderboardService from './leaderboardService.js';
import nominationService from './nominationService.js';
import retroAPI from './retroAPI.js';
import arcadeService from './arcadeService.js';
import userRegistrationMonitor from './userRegistrationMonitor.js';
import shadowGameService from './shadowGameService.js';

// Initialize services that require setup
export const initializeServices = async (client, config) => {
    try {
        // Set up achievement tracker with Discord client and channel
        achievementTracker.client = client;
        achievementTracker.setAchievementChannel(config.discord.achievementChannelId);

        // Set up user registration monitor
        userRegistrationMonitor.client = client;
        userRegistrationMonitor.setRegistrationChannel(config.discord.registrationChannelId);
        userRegistrationMonitor.addMonitoredChannel(config.discord.registrationMonitorChannelId);
        userRegistrationMonitor.startMonitoring();

        // Set up shadow game service
        shadowGameService.client = client;
        shadowGameService.setShadowChannel(config.discord.shadowGameChannelId);

        // Initialize activity tracking
        await activityTracker.initializeTracking();

        console.log('Services initialized successfully');
    } catch (error) {
        console.error('Error initializing services:', error);
        throw error;
    }
};

export {
    achievementTracker,
    activityTracker,
    leaderboardService,
    nominationService,
    retroAPI,
    arcadeService,
    userRegistrationMonitor,
    shadowGameService
};

export default {
    achievementTracker,
    activityTracker,
    leaderboardService,
    nominationService,
    retroAPI,
    arcadeService,
    userRegistrationMonitor,
    shadowGameService,
    initializeServices
};
