import mongoose from 'mongoose';
import { User, Award, Game } from '../models/index.js';
import { AwardType } from '../config/config.js';

async function setupTestDb(isConnected = false) {
    try {
        // Only connect if not already connected
        if (!isConnected) {
            await mongoose.connect('mongodb://localhost:27017/select-start-bot-test');
        }

        // Clear existing data
        await User.deleteMany({});
        await Award.deleteMany({});
        await Game.deleteMany({});

        // Create test user
        const user = await User.create({
            raUsername: 'TestUser',
            raUsernameLower: 'testuser',
            discordId: '123456789',
            activityStatus: 'ACTIVE',
            lastActivity: new Date(),
            joinDate: new Date(2025, 0, 1), // January 1st, 2025
            totalPoints: 150,
            yearlyPoints: new Map([['2025', 75]]),
            monthlyPoints: new Map([['2025-2', 25]]), // February 2025
            arcadePoints: [
                {
                    gameId: '1234',
                    gameName: 'Tetris',
                    rank: 1,
                    points: 3,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                }
            ]
        });

        // Create test games
        const games = await Game.create([
            {
                gameId: '1001',
                title: 'Chrono Trigger',
                type: 'MONTHLY',
                month: 2,
                year: 2025,
                progression: ['1', '2', '3'],
                winCondition: ['4', '5'],
                requireProgression: true,
                requireAllWinConditions: false,
                masteryCheck: true,
                active: true
            },
            {
                gameId: '1002',
                title: 'Secret of Mana',
                type: 'SHADOW',
                month: 2,
                year: 2025,
                progression: ['6', '7', '8'],
                winCondition: ['9', '10'],
                requireProgression: true,
                requireAllWinConditions: false,
                masteryCheck: true,
                active: true,
                meta: {
                    pieces: ['piece1', 'piece2'],
                    description: 'Shadow game meta description',
                    revealed: true
                }
            },
            {
                gameId: '2001',
                title: 'Super Mario Bros.',
                type: 'MONTHLY',
                platform: 'NES',
                nominatedBy: 'TestUser',
                votes: 5,
                status: 'APPROVED',
                month: 2,
                year: 2025,
                progression: ['11', '12'],
                winCondition: ['13'],
                requireProgression: false,
                requireAllWinConditions: false,
                masteryCheck: false,
                active: false,
                createdAt: new Date(2025, 1, 1) // February 1st, 2025
            },
            {
                gameId: '2002',
                title: 'Sonic the Hedgehog',
                type: 'MONTHLY',
                platform: 'Genesis',
                nominatedBy: 'TestUser',
                votes: 3,
                status: 'PENDING',
                month: 2,
                year: 2025,
                progression: ['14', '15'],
                winCondition: ['16'],
                requireProgression: false,
                requireAllWinConditions: false,
                masteryCheck: false,
                active: false,
                createdAt: new Date(2025, 1, 2) // February 2nd, 2025
            }
        ]);

        // Create test awards
        await Award.create([
            {
                raUsername: 'testuser',
                gameId: '1001',
                month: 2,
                year: 2025,
                award: AwardType.PARTICIPATION,
                achievementCount: 5,
                totalAchievements: 20,
                userCompletion: '25.0%'
            },
            {
                raUsername: 'testuser',
                gameId: '1002',
                month: 2,
                year: 2025,
                award: AwardType.BEATEN,
                achievementCount: 15,
                totalAchievements: 20,
                userCompletion: '75.0%'
            }
        ]);

        console.log('Test database setup complete!');
        console.log('Created test user:', user.raUsername);
        console.log('Created test games:', games.map(g => g.title).join(', '));

        // Don't disconnect here, let the caller handle it
    } catch (error) {
        console.error('Error setting up test database:', error);
        process.exit(1);
    }
}

// Run setup if this script is run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    setupTestDb();
}

export default setupTestDb;
