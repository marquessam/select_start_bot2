// File: src/utils/initializeGames.js
const mongoose = require('mongoose');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('../services/retroAchievements');

const games2024 = [
    {
        month: 1,
        year: 2024,
        monthlyGame: {
            gameId: "319",
            title: "Chrono Trigger",
            progression: ['2080', '2081', '2085', '2090', '2191', '2100', '2108', '2129', '2133'],
            winCondition: ['2266', '2281'],
            requireProgression: true,
            requireAllWinConditions: false,
            masteryCheck: true
        },
        shadowGame: {
            gameId: "10024",
            title: "Mario Tennis",
            winCondition: ['48411', '48412'],
            requireProgression: false,
            requireAllWinConditions: false,
            masteryCheck: false
        }
    },
    {
        month: 2,
        year: 2024,
        monthlyGame: {
            gameId: "355",
            title: "The Legend of Zelda: A Link to the Past",
            progression: ['944', '2192', '2282', '980', '2288', '2291', '2292', '2296', '2315', 
                         '2336', '2351', '2357', '2359', '2361', '2365', '2334', '2354', '2368', 
                         '2350', '2372', '2387'],
            winCondition: ['2389'],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: true
        },
        shadowGame: {
            gameId: "274",
            title: "UN Squadron",
            progression: ['6413', '6414', '6415', '6416', '6417', '6418', '6419', '6420', '6421'],
            winCondition: ['6422'],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: false
        }
    }
];

async function initializeGames() {
    try {
        console.log('Starting game initialization...');
        
        // Clear existing games
        await Game.deleteMany({});
        
        const raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );

        for (const monthData of games2024) {
            console.log(`Processing games for month ${monthData.month}`);

            // Monthly Game
            const monthlyInfo = await raAPI.getGameInfo(monthData.monthlyGame.gameId);
            console.log(`Monthly game ${monthData.monthlyGame.title} has ${monthlyInfo.numAchievements} achievements`);
            
            await Game.create({
                ...monthData.monthlyGame,
                type: 'MONTHLY',
                month: monthData.month,
                year: monthData.year,
                numAchievements: monthlyInfo.numAchievements || 0
            });

            // Shadow Game
            const shadowInfo = await raAPI.getGameInfo(monthData.shadowGame.gameId);
            console.log(`Shadow game ${monthData.shadowGame.title} has ${shadowInfo.numAchievements} achievements`);
            
            await Game.create({
                ...monthData.shadowGame,
                type: 'SHADOW',
                month: monthData.month,
                year: monthData.year,
                numAchievements: shadowInfo.numAchievements || 0
            });
        }

        // Verify initialization
        const finalGames = await Game.find({}).sort({ month: 1 });
        console.log('Games initialized:', finalGames.map(g => 
            `${g.title} (${g.type}) - Month ${g.month} - ${g.numAchievements} achievements`
        ));

    } catch (error) {
        console.error('Error initializing games:', error);
        throw error;
    }
}

module.exports = { initializeGames, games2024 };
