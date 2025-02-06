// File: src/utils/initializeGames.js
const mongoose = require('mongoose');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('../services/retroAchievements');

const games2025 = [
    {
        month: 1,
        year: 2025,
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
        year: 2025,
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

async function processGamesSequentially(games, raAPI) {
    const results = [];
    for (const game of games) {
        try {
            // Process monthly game
            console.log(`Processing monthly game: ${game.monthlyGame.title}`);
            const monthlyInfo = await raAPI.getGameInfo(game.monthlyGame.gameId);
            console.log(`Got info for monthly game: ${game.monthlyGame.title}`);
            
            results.push({
                ...game.monthlyGame,
                type: 'MONTHLY',
                month: game.month,
                year: game.year,
                numAchievements: monthlyInfo.NumAchievements || 0
            });

            // Add delay between requests
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Process shadow game
            console.log(`Processing shadow game: ${game.shadowGame.title}`);
            const shadowInfo = await raAPI.getGameInfo(game.shadowGame.gameId);
            console.log(`Got info for shadow game: ${game.shadowGame.title}`);
            
            results.push({
                ...game.shadowGame,
                type: 'SHADOW',
                month: game.month,
                year: game.year,
                numAchievements: shadowInfo.NumAchievements || 0
            });

            // Add delay between requests
            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (error) {
            console.error(`Error processing game pair for month ${game.month}:`, error);
            throw error;
        }
    }
    return results;
}

async function initializeGames() {
    try {
        console.log('Starting game initialization...');
        
        // Clear existing games
        await Game.deleteMany({});
        console.log('Cleared existing games');
        
        const raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );

        // Process games sequentially to respect rate limits
        console.log('Starting to process games...');
        const processedGames = await processGamesSequentially(games2025, raAPI);
        console.log(`Processed ${processedGames.length} games`);

        // Bulk insert all games
        console.log('Inserting games into database...');
        await Game.insertMany(processedGames);

        const finalGames = await Game.find({}).sort({ month: 1 });
        console.log('Initialized games:', finalGames.map(g => ({
            title: g.title,
            type: g.type,
            month: g.month,
            year: g.year,
            achievements: g.numAchievements
        })));

        console.log('Game initialization completed successfully');

    } catch (error) {
        console.error('Error initializing games:', error);
        throw error;
    }
}

module.exports = { initializeGames, games2025 };
