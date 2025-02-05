// File: src/utils/initializeGames.js
const mongoose = require('mongoose');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('../services/retroAchievements');

// Single source of truth for games
const games2024 = [
    {
        month: 1,
        year: 2024,
        monthlyGame: {
            gameId: "319",
            title: "Chrono Trigger",
            type: "MONTHLY"
        },
        shadowGame: {
            gameId: "10024",
            title: "Mario Tennis",
            type: "SHADOW"
        }
    },
    {
        month: 2,
        year: 2024,
        monthlyGame: {
            gameId: "355",
            title: "The Legend of Zelda: A Link to the Past",
            type: "MONTHLY"
        },
        shadowGame: {
            gameId: "274",
            title: "UN Squadron",
            type: "SHADOW"
        }
    }
];

async function initializeGames() {
    try {
        console.log('Starting game initialization...');
        
        // Clear existing games to prevent duplicates
        await Game.deleteMany({});
        
        const raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );

        for (const monthData of games2024) {
            // Add monthly game
            const monthlyInfo = await raAPI.getGameInfo(monthData.monthlyGame.gameId);
            await Game.create({
                gameId: monthData.monthlyGame.gameId,
                title: monthData.monthlyGame.title,
                type: 'MONTHLY',
                month: monthData.month,
                year: monthData.year,
                numAchievements: monthlyInfo.numAchievements || 0,
                active: true
            });

            // Add shadow game
            const shadowInfo = await raAPI.getGameInfo(monthData.shadowGame.gameId);
            await Game.create({
                gameId: monthData.shadowGame.gameId,
                title: monthData.shadowGame.title,
                type: 'SHADOW',
                month: monthData.month,
                year: monthData.year,
                numAchievements: shadowInfo.numAchievements || 0,
                active: true
            });
        }
        
        const finalGames = await Game.find({});
        console.log('Games initialized:', finalGames.map(g => 
            `${g.title} (${g.type}) - Month ${g.month}`
        ));
        
    } catch (error) {
        console.error('Error initializing games:', error);
        throw error;
    }
}

module.exports = { initializeGames, games2024 };
