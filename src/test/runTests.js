#!/usr/bin/env node
import mongoose from 'mongoose';
import setupTestDb from './setupTestDb.js';
import { User, Award, Game, Nomination, PlayerProgress } from '../models/index.js';
import { AwardType } from '../config/config.js';
import achievementTracker from '../services/achievementTracker.js';
import leaderboardService from '../services/leaderboardService.js';
import arcadeService from '../services/arcadeService.js';
import shadowGameService from '../services/shadowGameService.js';
import nominationService from '../services/nominationService.js';
import retroAPI from '../services/retroAPI.js';

class TestRunner {
    constructor() {
        this.tests = new Map();
        this.results = {
            passed: 0,
            failed: 0,
            skipped: 0
        };
    }

    addTest(name, fn, skip = false) {
        this.tests.set(name, { fn, skip });
    }

    async runTests() {
        console.log('\n Starting test suite...\n');

        try {
            await mongoose.connect('mongodb://localhost:27017/select-start-bot-test');
            await setupTestDb(true);

            for (const [name, test] of this.tests) {
                if (test.skip) {
                    console.log(`⚪ SKIPPED: ${name}`);
                    this.results.skipped++;
                    continue;
                }

                try {
                    await test.fn();
                    console.log(`✅ PASSED: ${name}`);
                    this.results.passed++;
                } catch (error) {
                    console.log(`❌ FAILED: ${name}`);
                    console.error('  Error:', error.message);
                    this.results.failed++;
                }
            }
        } catch (error) {
            console.error('❌ Test suite failed:', error);
        } finally {
            try {
                await mongoose.connection.close();
            } catch (error) {
                console.error('Error closing database connection:', error);
            }
            this.printResults();
        }
    }

    printResults() {
        console.log('\n📊 Test Results:');
        console.log(`Passed: ${this.results.passed} ✅`);
        console.log(`Failed: ${this.results.failed} ❌`);
        console.log(`Skipped: ${this.results.skipped} ⚪`);
        console.log(`Total: ${this.tests.size} 🧪\n`);
    }
}

const runner = new TestRunner();

// User Registration
runner.addTest('User Registration', async () => {
    const newUsername = 'NewTestUser';
    const discordId = '987654321';
    
    const user = new User({
        raUsername: newUsername,
        raUsernameLower: newUsername.toLowerCase(),
        discordId,
        activityTier: 'ACTIVE',
        lastActivity: new Date()
    });
    
    await user.save();
    
    const savedUser = await User.findByRAUsername(newUsername);
    if (!savedUser) throw new Error('User registration failed');
    if (savedUser.activityTier !== 'ACTIVE') throw new Error('Initial activity tier incorrect');
});

// Activity Tracking
runner.addTest('Activity Tracking', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    
    user.achievementStats.dailyCount = 10;
    user.achievementStats.weeklyCount = 20;
    user.achievementStats.monthlyCount = 50;
    user.achievementStats.lastAchievement = new Date();
    
    user.updateActivityTier();
    await user.save();
    
    const updatedUser = await User.findOne({ raUsername: 'TestUser' });
    if (updatedUser.activityTier !== 'VERY_ACTIVE') {
        throw new Error('Activity tier not updated correctly');
    }
});

// Profile Generation
runner.addTest('Profile Generation', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    const profile = await leaderboardService.generateUserProfile(user.raUsername);
    
    if (!profile) throw new Error('Failed to generate profile');
    if (!profile.data.fields.some(f => f.name === 'Total Points')) {
        throw new Error('Profile missing points information');
    }
});

// Awards - Mastery Award
runner.addTest('Awards - Mastery Award', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    const game = await Game.findOne({ gameId: '1001' });
    
    // Ensure game is configured for mastery
    game.masteryCheck = true;
    await game.save();
    
    // Clear any existing progress
    await PlayerProgress.deleteOne({ 
        raUsername: user.raUsername,
        gameId: game.gameId
    });
    
    // Create new progress with 100% completion
    const progress = new PlayerProgress({
        raUsername: user.raUsername,
        gameId: game.gameId,
        currentAchievements: 20,
        totalGameAchievements: 20,
        winConditionsCompleted: game.winCondition
    });
    
    await progress.save();
    await achievementTracker.updateAward(user.raUsername, game, progress);
    
    const award = await Award.findOne({
        raUsername: user.raUsername.toLowerCase(),
        gameId: game.gameId,
        award: AwardType.MASTERY
    });
    
    if (!award) throw new Error('Mastery award not created');
});

// Time Window Validation
runner.addTest('Time Window Validation', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    const game = await Game.findOne({ gameId: '1001' });
    
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    
    const award = new Award({
        raUsername: user.raUsername,
        gameId: game.gameId,
        month: futureDate.getMonth() + 1,
        year: futureDate.getFullYear(),
        award: AwardType.PARTICIPATION,
        startDate: futureDate,
        endDate: new Date(futureDate.getTime() + 24 * 60 * 60 * 1000)
    });
    
    try {
        await award.validateEligibility();
        throw new Error('Should not allow awards for future months');
    } catch (error) {
        if (!error.message.includes('future months')) {
            throw error;
        }
    }
});

// Shadow Game Reveal
runner.addTest('Shadow Game Reveal', async () => {
    const game = await Game.findOne({ type: 'SHADOW' });
    
    const conditions = game.meta.pieces.map(piece => ({
        id: piece,
        type: 'EXACT_MATCH',
        value: piece
    }));
    
    await shadowGameService.setMetaConditions(
        game.gameId,
        game.month,
        game.year,
        conditions
    );
    
    for (const piece of game.meta.pieces) {
        await shadowGameService.checkMetaCondition(
            piece,
            'TestUser',
            game.month,
            game.year
        );
    }
    
    const updatedGame = await Game.findOne({ type: 'SHADOW' });
    if (!updatedGame.active) {
        throw new Error('Shadow game not revealed after completing conditions');
    }
});

// Nomination Limits
runner.addTest('Nomination Limits', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    const month = 2;
    const year = 2025;
    
    // Clear existing nominations
    await Nomination.deleteMany({
        userId: user.discordId,
        voteMonth: `${year}-${month.toString().padStart(2, '0')}`
    });
    
    // Create max nominations
    for (let i = 0; i < 2; i++) {
        await nominationService.createNomination(
            user.discordId,
            `Test Game ${i}`,
            `9999${i}`,
            user.raUsername,
            month,
            year
        );
    }
    
    // Try to create one more
    let limitError = false;
    try {
        await nominationService.createNomination(
            user.discordId,
            'Extra Game',
            '99999',
            user.raUsername,
            month,
            year
        );
    } catch (error) {
        if (error.message.includes('already nominated') || 
            error.message.includes('nomination limit')) {
            limitError = true;
        } else {
            throw error;
        }
    }

    if (!limitError) {
        throw new Error('Should not allow more than 2 nominations per month');
    }
});

// Awards - Participation Award
runner.addTest('Awards - Participation Award', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    const game = await Game.findOne({ gameId: '1001' });
    
    // Clear any existing progress
    await PlayerProgress.deleteOne({ 
        raUsername: user.raUsername,
        gameId: game.gameId
    });
    
    // Simulate earning first achievement
    const progress = new PlayerProgress({
        raUsername: user.raUsername,
        gameId: game.gameId,
        currentAchievements: 1,
        totalGameAchievements: 20
    });
    
    await progress.save();
    await achievementTracker.updateAward(user.raUsername, game, progress);
    
    const award = await Award.findOne({
        raUsername: user.raUsername.toLowerCase(),
        gameId: game.gameId,
        award: AwardType.PARTICIPATION
    });
    
    if (!award) throw new Error('Participation award not created');
});

// Awards - Beaten Award
runner.addTest('Awards - Beaten Award', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    const game = await Game.findOne({ gameId: '1001' });
    
    // Clear any existing progress
    await PlayerProgress.deleteOne({ 
        raUsername: user.raUsername,
        gameId: game.gameId
    });
    
    // Create new progress with completed win conditions
    const progress = new PlayerProgress({
        raUsername: user.raUsername,
        gameId: game.gameId,
        currentAchievements: 10,
        totalGameAchievements: 20,
        progressionCompleted: game.progression,
        winConditionsCompleted: game.winCondition
    });
    
    await progress.save();
    await achievementTracker.updateAward(user.raUsername, game, progress);
    
    const award = await Award.findOne({
        raUsername: user.raUsername.toLowerCase(),
        gameId: game.gameId,
        award: AwardType.BEATEN
    });
    
    if (!award) throw new Error('Beaten award not created');
});

// Leaderboard Generation
runner.addTest('Leaderboard Generation', async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    
    const monthlyEmbed = await leaderboardService.generateMonthlyLeaderboard(month, year);
    const yearlyEmbed = await leaderboardService.generateYearlyLeaderboard(year);
    
    if (!monthlyEmbed || !yearlyEmbed) {
        throw new Error('Failed to generate leaderboard embeds');
    }
});

// Arcade Points
runner.addTest('Arcade Points', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    
    // Clear existing arcade points
    user.arcadePoints = [];
    await user.save();
    
    // Mock the RetroAchievements API response
    const mockLeaderboard = [
        { user: user.raUsername, rank: 1, score: 1000000 }
    ];
    
    // Store original function
    const originalGetGameRankAndScore = retroAPI.getGameRankAndScore;
    
    // Mock the function
    retroAPI.getGameRankAndScore = async () => mockLeaderboard;
    
    try {
        // Add new arcade points
        await arcadeService.updateLeaderboardPoints('5678', 'Pac-Man');
        
        // Verify points were added
        const updatedUser = await User.findOne({ raUsername: 'TestUser' });
        const arcadePoints = updatedUser.getCurrentArcadePoints();
        
        if (arcadePoints !== 3) { // First place should give 3 points
            throw new Error(`Expected 3 arcade points for first place, got ${arcadePoints}`);
        }
    } finally {
        // Restore original function
        retroAPI.getGameRankAndScore = originalGetGameRankAndScore;
    }
});

// Shadow Game Meta
runner.addTest('Shadow Game Meta', async () => {
    const game = await Game.findOne({ type: 'SHADOW' });
    
    // Test meta condition checking
    const result = await shadowGameService.checkMetaCondition(
        'piece1',
        'TestUser',
        game.month,
        game.year
    );
    
    if (game.meta.revealed !== true) {
        throw new Error('Shadow game meta not working correctly');
    }
});

// Nominations
runner.addTest('Nominations', async () => {
    const user = await User.findOne({ raUsername: 'TestUser' });
    
    // Clear existing nominations for this user
    await Nomination.deleteMany({
        userId: user.discordId,
        voteMonth: '2025-02'
    });
    
    // Test nomination creation
    const nomination = await nominationService.createNomination(
        user.discordId,
        'Test Game',
        '9999',
        user.raUsername,
        2,
        2025
    );
    
    if (!nomination) throw new Error('Failed to create nomination');
    
    // Approve the nomination before voting
    nomination.status = 'APPROVED';
    await nomination.save();
    
    // Test voting
    await nominationService.toggleVote(nomination._id, user.discordId, true);
    
    const updatedNom = await Nomination.findById(nomination._id);
    if (updatedNom.votes !== 1) {
        throw new Error('Voting system not working correctly');
    }
});

// Run the tests
runner.runTests().catch(console.error);
