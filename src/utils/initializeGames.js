// File: src/utils/initializeGames.js
const { Game } = require('../models/Game');
const RetroAchievementsAPI = require('../services/retroAchievements');

const monthlyGames = [
    {
        month: 1,
        year: 2024,
        monthlyGame: {
            gameId: "319",
            title: "Chrono Trigger"
        },
        shadowGame: {
            gameId: "10024",
            title: "Mario Tennis"
        }
    },
    {
        month: 2,
        year: 2024,
        monthlyGame: {
            gameId: "355",
            title: "The Legend of Zelda: A Link to the Past"
        },
        shadowGame: {
            gameId: "274",
            title: "UN Squadron"
        }
    }
];

async function initializeGames() {
    try {
        const raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );

        for (const monthData of monthlyGames) {
            // Initialize monthly game
            const monthlyGameInfo = await raAPI.getGameInfo(monthData.monthlyGame.gameId);
            await Game.updateOne(
                {
                    month: monthData.month,
                    year: monthData.year,
                    type: 'MONTHLY'
                },
                {
                    $set: {
                        gameId: monthData.monthlyGame.gameId,
                        title: monthData.monthlyGame.title,
                        numAchievements: monthlyGameInfo.numAchievements || 0,
                        active: true
                    }
                },
                { upsert: true }
            );

            // Initialize shadow game
            const shadowGameInfo = await raAPI.getGameInfo(monthData.shadowGame.gameId);
            await Game.updateOne(
                {
                    month: monthData.month,
                    year: monthData.year,
                    type: 'SHADOW'
                },
                {
                    $set: {
                        gameId: monthData.shadowGame.gameId,
                        title: monthData.shadowGame.title,
                        numAchievements: shadowGameInfo.numAchievements || 0,
                        active: true
                    }
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
