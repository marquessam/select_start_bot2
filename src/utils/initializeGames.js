// File: src/utils/initializeGames.js
const Game = require('../models/Game');

const games2025 = [
    {
        month: 1,
        year: 2025,
        monthlyGame: {
            gameId: "319",
            title: "Chrono Trigger",
            winConditions: [
                '2266',  // The Final Battle
                '2281'   // Dream's End
            ],
            requireAllWinConditions: false // Need either ending
        },
        shadowGame: {
            gameId: "10024",
            title: "Mario Tennis",
            winConditions: [
                '48411',  // Tournament Victory
                '48412'   // Another Tournament Victory
            ],
            requireAllWinConditions: false
        }
    },
    {
        month: 2,
        year: 2025,
        monthlyGame: {
            gameId: "355",
            title: "The Legend of Zelda: A Link to the Past",
            winConditions: ['2389'],  // Defeat Ganon
            requireAllWinConditions: true
        },
        shadowGame: {
            gameId: "274",
            title: "UN Squadron",
            winConditions: ['6422'],  // Final Mission
            requireAllWinConditions: true
        }
    }
    // Add more months as needed
];

async function initializeGames() {
    try {
        console.log('Starting game initialization...');
        
        // Clear existing games
        await Game.deleteMany({});
        console.log('Cleared existing games');

        const gamesToInsert = [];
        
        // Process each month's games
        for (const monthData of games2025) {
            // Add monthly game
            gamesToInsert.push({
                gameId: monthData.monthlyGame.gameId,
                title: monthData.monthlyGame.title,
                type: 'MONTHLY',
                month: monthData.month,
                year: monthData.year,
                winConditions: monthData.monthlyGame.winConditions,
                requireAllWinConditions: monthData.monthlyGame.requireAllWinConditions
            });

            // Add shadow game
            gamesToInsert.push({
                gameId: monthData.shadowGame.gameId,
                title: monthData.shadowGame.title,
                type: 'SHADOW',
                month: monthData.month,
                year: monthData.year,
                winConditions: monthData.shadowGame.winConditions,
                requireAllWinConditions: monthData.shadowGame.requireAllWinConditions
            });
        }

        // Bulk insert all games
        await Game.insertMany(gamesToInsert);

        const finalGames = await Game.find({}).sort({ month: 1 });
        console.log('Initialized games:', finalGames.map(g => ({
            title: g.title,
            type: g.type,
            month: g.month,
            year: g.year
        })));

        console.log('Game initialization completed successfully');
    } catch (error) {
        console.error('Error initializing games:', error);
        throw error;
    }
}

module.exports = { initializeGames, games2025 };
