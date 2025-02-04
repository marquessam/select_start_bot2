// File: src/utils/initializeGames.js
const mongoose = require('mongoose');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('../services/retroAchievements');

const monthlyGames = [
    {
        month: 1,
        year: 2025,
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
        year: 2025,
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
        
        // First, log existing games
        const existingGames = await Game.find({});
        console.log('Existing games in database:', existingGames);

        const raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );

        for (const monthData of monthlyGames) {
            console.log(`Processing games for ${monthData.month}/${monthData.year}`);

            // Monthly Game
            console.log(`Fetching info for monthly game: ${monthData.monthlyGame.title}`);
            const monthlyGameInfo = await raAPI.getGameInfo(monthData.monthlyGame.gameId);
            
            const monthlyGameData = {
                gameId: monthData.monthlyGame.gameId,
                title: monthData.monthlyGame.title,
                type: 'MONTHLY',
                month: monthData.month,
                year: monthData.year,
                numAchievements: monthlyGameInfo.numAchievements || 0,
                active: true,
                progressionAchievements: [] // We'll need to define these specifically for each game
            };

            console.log('Saving monthly game:', monthlyGameData);
            await Game.findOneAndUpdate(
                {
                    month: monthData.month,
                    year: monthData.year,
                    type: 'MONTHLY'
                },
                monthlyGameData,
                { upsert: true, new: true }
            );

            // Shadow Game
            console.log(`Fetching info for shadow game: ${monthData.shadowGame.title}`);
            const shadowGameInfo = await raAPI.getGameInfo(monthData.shadowGame.gameId);
            
            const shadowGameData = {
                gameId: monthData.shadowGame.gameId,
                title: monthData.shadowGame.title,
                type: 'SHADOW',
                month: monthData.month,
                year: monthData.year,
                numAchievements: shadowGameInfo.numAchievements || 0,
                active: true,
                progressionAchievements: [] // We'll need to define these specifically for each game
            };

            console.log('Saving shadow game:', shadowGameData);
            await Game.findOneAndUpdate(
                {
                    month: monthData.month,
                    year: monthData.year,
                    type: 'SHADOW'
                },
                shadowGameData,
                { upsert: true, new: true }
            );
        }

        // Verify final state
        const finalGames = await Game.find({}).sort({ month: 1 });
        console.log('Games in database after initialization:', 
            finalGames.map(g => ({
                title: g.title,
                type: g.type,
                month: g.month,
                achievements: g.numAchievements
            }))
        );
        
        console.log('Games initialized successfully');
    } catch (error) {
        console.error('Error initializing games:', error);
        throw error;
    }
}

module.exports = { initializeGames };
