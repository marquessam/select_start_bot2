// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
  constructor(username, apiKey) {
    this.username = username;
    this.apiKey = apiKey;
    this.baseUrl = 'https://retroachievements.org/API';
  }

  async getGameInfo(gameId) {
    try {
      const response = await axios.get(`${this.baseUrl}/API_GetGame.php`, {
        params: {
          z: this.username,
          y: this.apiKey,
          i: gameId
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching game info:', error);
      throw error;
    }
  }

  async getUserProgress(raUsername, gameId) {
    try {
      const response = await axios.get(`${this.baseUrl}/API_GetGameInfoAndUserProgress.php`, {
        params: {
          z: this.username,
          y: this.apiKey,
          u: raUsername,
          g: gameId,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching user progress:', error);
      throw error;
    }
  }

  async getUserRecentAchievements(raUsername, count = 10) {
    try {
      const response = await axios.get(`${this.baseUrl}/API_GetUserRecentAchievements.php`, {
        params: {
          z: this.username,
          y: this.apiKey,
          u: raUsername,
          c: count,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching recent achievements:', error);
      throw error;
    }
  }
}

module.exports = RetroAchievementsAPI;
