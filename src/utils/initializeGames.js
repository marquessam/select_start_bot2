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
            // Story progression achievements that must be done in order
            progression: [
                '2080',  // Guardia Castle
                '2081',  // The Queen Returns
                '2085',  // A Trap is Sprung
                '2090',  // The Trial
                '2191',  // Beyond the Ruins
                '2100',  // The Factory Ruins
                '2108',  // The End of Time
                '2129',  // Magus' Castle
                '2133'   // Forward to the Past
            ],
            winCondition: [
                '2266',  // The Final Battle
                '2281'   // Dream's End
            ],
            requireProgression: true,     // Must follow story in order
            requireAllWinConditions: false, // Need either ending
            masteryCheck: true
        },
        shadowGame: {
            gameId: "10024",
            title: "Mario Tennis",
            // No progression because it's not a story-based game
            progression: [],  
            winCondition: [
                '48411',  // Tournament Victory
                '48412'   // Another Tournament Victory
            ],
            requireProgression: false,
            requireAllWinConditions: false,  // Need either tournament win
            masteryCheck: false
        }
    },
    {
        month: 2,
        year: 2025,
        monthlyGame: {
            gameId: "355",
            title: "The Legend of Zelda: A Link to the Past",
            // All dungeon achievements needed but can be done in different orders
            progression: [
                '944',   // Eastern Palace
                '2192',  // Desert Palace
                '2282',  // Tower of Hera
                '980',   // Agahnim's Tower
                '2288',  // Palace of Darkness
                '2291',  // Swamp Palace
                '2292',  // Skull Woods
                '2296',  // Thieves' Town
                '2315',  // Ice Palace
                '2336',  // Misery Mire
                '2351',  // Turtle Rock
                '2357',  // Ganon's Tower Floor 1
                '2359',  // Ganon's Tower Floor 2
                '2361',  // Ganon's Tower Floor 3
                '2365',  // Agahnim 2
                '2334',  // Crystal 1
                '2354',  // Crystal 2
                '2368',  // Crystal 3
                '2350',  // Crystal 4
                '2372',  // Crystal 5
                '2387'   // Crystal 6
            ],
            winCondition: ['2389'],  // Defeat Ganon
            requireProgression: false,  // Dungeons can be done in any order
            requireAllWinConditions: true,
            masteryCheck: true
        },
        shadowGame: {
            gameId: "274",
            title: "UN Squadron",
            // Missions must be completed in order
            progression: [
                '6413',  // Mission 1
                '6414',  // Mission 2
                '6415',  // Mission 3
                '6416',  // Mission 4
                '6417',  // Mission 5
                '6418',  // Mission 6
                '6419',  // Mission 7
                '6420',  // Mission 8
                '6421'   // Mission 9
            ],
            winCondition: ['6422'],  // Final Mission
            requireProgression: false,  // Must complete missions in order
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
            
            // Add active flag and ensure all fields are present
            results.push({
                gameId: game.monthlyGame.gameId,
                title: game.monthlyGame.title,
                type: 'MONTHLY',
                month: game.month,
                year: game.year,
                progression: game.monthlyGame.progression || [],
                winCondition: game.monthlyGame.winCondition || [],
                requireProgression: game.monthlyGame.requireProgression || false,
                requireAllWinConditions: game.monthlyGame.requireAllWinConditions || false,
                masteryCheck: game.monthlyGame.masteryCheck || false,
                numAchievements: monthlyInfo.NumAchievements || 0,
                active: true
            });

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Process shadow game
            console.log(`Processing shadow game: ${game.shadowGame.title}`);
            const shadowInfo = await raAPI.getGameInfo(game.shadowGame.gameId);
            console.log(`Got info for shadow game: ${game.shadowGame.title}`);
            
            results.push({
                gameId: game.shadowGame.gameId,
                title: game.shadowGame.title,
                type: 'SHADOW',
                month: game.month,
                year: game.year,
                progression: game.shadowGame.progression || [],
                winCondition: game.shadowGame.winCondition || [],
                requireProgression: game.shadowGame.requireProgression || false,
                requireAllWinConditions: game.shadowGame.requireAllWinConditions || false,
                masteryCheck: game.shadowGame.masteryCheck || false,
                numAchievements: shadowInfo.NumAchievements || 0,
                active: true
            });

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
            achievements: g.numAchievements,
            progressionRequired: g.requireProgression,
            progressionCount: g.progression.length,
            winConditions: g.winCondition.length,
            requireAllWins: g.requireAllWinConditions
        })));

        console.log('Game initialization completed successfully');

    } catch (error) {
        console.error('Error initializing games:', error);
        throw error;
    }
}

module.exports = { initializeGames, games2025 };
