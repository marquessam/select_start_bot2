// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
  /**
   * @param {string} username - Your RetroAchievements username.
   * @param {string} apiKey - Your RetroAchievements API key.
   */
  constructor(username, apiKey) {
    if (!username || !apiKey) {
      throw new Error('Username and API key are required.');
    }
    this.username = username;
    this.apiKey = apiKey;
    this.baseUrl = 'https://retroachievements.org/API';
    // Initialize lastRequestTime to now so that the first request doesn't wait unnecessarily.
    this.lastRequestTime = Date.now();
    this.minRequestInterval = 2000;

    // Create a dedicated Axios instance.
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // Set an appropriate timeout (in ms)
    });
  }

  /**
   * Pause execution for a given number of milliseconds.
   * @param {number} ms - Milliseconds to sleep.
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enforce rate limiting by waiting if the previous request was made too recently.
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.info(`Rate limiting: waiting ${waitTime}ms before next request`);
      await this.sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Make a GET request to the RetroAchievements API.
   * @param {string} endpoint - API endpoint (e.g., 'API_GetGame.php').
   * @param {object} params - Query parameters for the request.
   * @returns {Promise<any>} - The response data.
   */
  async makeRequest(endpoint, params = {}) {
    await this.waitForRateLimit();

    // Merge default parameters with any additional ones provided.
    const fullParams = {
      ...params,
      z: this.username,
      y: this.apiKey,
    };

    try {
      console.info(`Making request to ${endpoint} with params:`, fullParams);
      const response = await this.axiosInstance.get(`/${endpoint}`, { params: fullParams });
      return response.data;
    } catch (error) {
      console.error(`API request to ${endpoint} failed: ${error.message}`);
      // Log additional error details if available.
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  async getGameInfo(gameId) {
    console.info(`Fetching game info for game ${gameId}`);
    return this.makeRequest('API_GetGame.php', { i: gameId });
  }

  async getUserGameProgress(username, gameId) {
    console.info(`Fetching progress for ${username} in game ${gameId}`);
    const data = await this.makeRequest('API_GetGameInfoAndUserProgress.php', {
      u: username,
      g: gameId,
    });

    // Format the response to match what our system expects.
    return {
      numAchievements: data.NumAchievements,
      earnedAchievements: data.NumAwardedToUser,
      totalAchievements: data.NumAchievements,
      // Ensure achievements is an array if expected.
      achievements: data.Achievements || [],
      userCompletion: data.UserCompletion,
      gameTitle: data.GameTitle,
      console: data.ConsoleName,
      gameIcon: data.ImageIcon,
      points: data.Points,
      possibleScore: data.PossibleScore,
    };
  }

  async getGameList(searchTerm) {
    console.info(`Searching for games matching: ${searchTerm}`);
    return this.makeRequest('API_GetGameList.php', {
      f: searchTerm,
      h: 1,
    });
  }

  async getUserRecentAchievements(username, count = 50) {
    console.info(`Fetching recent achievements for ${username}`);
    return this.makeRequest('API_GetUserRecentAchievements.php', {
      u: username,
      c: count,
    });
  }

  async getUserProfile(username) {
    console.info(`Fetching profile for ${username}`);
    return this.makeRequest('API_GetUserProfile.php', { u: username });
  }
}

module.exports = RetroAchievementsAPI;
