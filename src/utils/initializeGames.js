// File: src/utils/initializeGames.js
const { monthlyGames } = require('../config/games');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('../services/retroAchievements');

const raAPI = new RetroAchievementsAPI(
    process.env.RA_USERNAME,
    process.env.RA_API_KEY
);

async function initializeGames() {
    try {
        for (const monthData of monthlyGames) {
            // Initialize monthly game
            const monthlyGameInfo = await raAPI.getGameInfo(monthData.monthlyGame.gameId);
            await Game.findOneAndUpdate(
                {
                    month: monthData.month,
                    year: monthData.year,
                    type: 'MONTHLY'
                },
                {
                    gameId: monthData.monthlyGame.gameId,
                    title: monthData.monthlyGame.title,
                    numAchievements: monthlyGameInfo.numAchievements,
                    active: true
                },
                { upsert: true }
            );

            // Initialize shadow game
            const shadowGameInfo = await raAPI.getGameInfo(monthData.shadowGame.gameId);
            await Game.findOneAndUpdate(
                {
                    month: monthData.month,
                    year: monthData.year,
                    type: 'SHADOW'
                },
                {
                    gameId: monthData.shadowGame.gameId,
                    title: monthData.shadowGame.title,
                    numAchievements: shadowGameInfo.numAchievements,
                    active: true
                },
                { upsert: true }
            );
        }
        console.log('Games initialized successfully');
    } catch (error) {
        console.error('Error initializing games:', error);
        throw error;
    }
}

module.exports = { initializeGames };
