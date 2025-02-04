// File: src/utils/initializeGames.js
const mongoose = require('mongoose');
const Game = require('../models/Game');
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
        console.log('Starting game initialization...');
        const raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );

        for (const monthData of monthlyGames) {
            console.log(`Processing games for ${monthData.month}/${monthData.year}`);
            
            // Monthly Game
            console.log(`Fetching info for monthly game: ${monthData.monthlyGame.title}`);
            const monthlyGameInfo = await raAPI.getGameInfo(monthData.monthlyGame.gameId);
            
            const monthlyGame = new Game({
                gameId: monthData.monthlyGame.gameId,
                title: monthData.monthlyGame.title,
                type: 'MONTHLY',
                month: monthData.month,
                year: monthData.year,
                numAchievements: monthlyGameInfo.numAchievements || 0,
                active: true
            });
            await monthlyGame.save();

            // Shadow Game
            console.log(`Fetching info for shadow game: ${monthData.shadowGame.title}`);
            const shadowGameInfo = await raAPI.getGameInfo(monthData.shadowGame.gameId);
            
            const shadowGame = new Game({
                gameId: monthData.shadowGame.gameId,
                title: monthData.shadowGame.title,
                type: 'SHADOW',
                month: monthData.month,
                year: monthData.year,
                numAchievements: shadowGameInfo.numAchievements || 0,
                active: true
            });
            await shadowGame.save();
        }
        
        console.log('Games initialized successfully');
    } catch (error) {
        console.error('Error initializing games:', error);
        throw error;
    }
}

module.exports = { initializeGames };
