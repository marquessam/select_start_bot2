#!/usr/bin/env node
import mongoose from 'mongoose';
import { config } from '../config/config.js';
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { withTransaction } from 'dbUtils.js';

// Connect to MongoDB
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.mongodb.uri);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

// Display database statistics
const showStats = async () => {
    console.log('\n=== Database Statistics ===');
    
    const userCount = await User.countDocuments();
    console.log(`Users: ${userCount}`);
    
    const challengeCount = await Challenge.countDocuments();
    console.log(`Challenges: ${challengeCount}`);
    
    // Get current month's challenge
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    const currentChallenge = await Challenge.findOne({
        date: {
            $gte: currentMonthStart,
            $lt: nextMonthStart
        }
    });
    
    if (currentChallenge) {
        console.log('\n=== Current Challenge ===');
        console.log(`Date: ${currentChallenge.date.toISOString().split('T')[0]}`);
        console.log(`Main Game ID: ${currentChallenge.monthly_challange_gameid}`);
        console.log(`Main Goal: ${currentChallenge.monthly_challange_goal}/${currentChallenge.monthly_challange_game_total}`);
        
        if (currentChallenge.shadow_challange_gameid) {
            console.log(`Shadow Game ID: ${currentChallenge.shadow_challange_gameid}`);
            console.log(`Shadow Goal: ${currentChallenge.shadow_challange_goal}/${currentChallenge.shadow_challange_game_total}`);
            console.log(`Shadow Revealed: ${currentChallenge.shadow_challange_revealed ? 'Yes' : 'No'}`);
        } else {
            console.log('No shadow challenge set');
        }
    } else {
        console.log('\nNo current challenge found');
    }
    
    // Get nomination stats
    const usersWithNominations = await User.find({ 'nominations.0': { $exists: true } });
    const nominationCount = usersWithNominations.reduce((total, user) => {
        return total + user.getCurrentNominations().length;
    }, 0);
    
    console.log(`\nCurrent Month Nominations: ${nominationCount}`);
    
    // Get participation stats
    if (currentChallenge) {
        const monthKey = User.formatDateKey(currentChallenge.date);
        
        const participationStats = {
            mastery: 0,
            beaten: 0,
            participation: 0,
            none: 0
        };
        
        const users = await User.find({});
        
        for (const user of users) {
            const progress = user.monthlyChallenges.get(monthKey);
            
            if (!progress) {
                participationStats.none++;
            } else if (progress.progress === 3) {
                participationStats.mastery++;
            } else if (progress.progress === 2) {
                participationStats.beaten++;
            } else if (progress.progress === 1) {
                participationStats.participation++;
            }
        }
        
        console.log('\n=== Current Challenge Participation ===');
        console.log(`Mastery: ${participationStats.mastery}`);
        console.log(`Beaten: ${participationStats.beaten}`);
        console.log(`Participation: ${participationStats.participation}`);
        console.log(`No Progress: ${participationStats.none}`);
    }
};

// Fix inconsistent date keys
const fixDateKeys = async () => {
    console.log('\n=== Fixing Inconsistent Date Keys ===');
    
    const users = await User.find({});
    let fixedCount = 0;
    
    await withTransaction(async (session) => {
        for (const user of users) {
            let modified = false;
            
            // Check monthly challenges
            const monthlyChallenges = new Map();
            for (const [key, value] of user.monthlyChallenges.entries()) {
                try {
                    const date = new Date(key);
                    const formattedKey = User.formatDateKey(date);
                    
                    if (key !== formattedKey) {
                        monthlyChallenges.set(formattedKey, value);
                        modified = true;
                    } else {
                        monthlyChallenges.set(key, value);
                    }
                } catch (error) {
                    console.warn(`Invalid date key for user ${user.raUsername}: ${key}`);
                    // Skip invalid keys
                }
            }
            
            // Check shadow challenges
            const shadowChallenges = new Map();
            for (const [key, value] of user.shadowChallenges.entries()) {
                try {
                    const date = new Date(key);
                    const formattedKey = User.formatDateKey(date);
                    
                    if (key !== formattedKey) {
                        shadowChallenges.set(formattedKey, value);
                        modified = true;
                    } else {
                        shadowChallenges.set(key, value);
                    }
                } catch (error) {
                    console.warn(`Invalid shadow date key for user ${user.raUsername}: ${key}`);
                    // Skip invalid keys
                }
            }
            
            if (modified) {
                user.monthlyChallenges = monthlyChallenges;
                user.shadowChallenges = shadowChallenges;
                await user.save({ session });
                fixedCount++;
            }
        }
    });
    
    console.log(`Fixed date keys for ${fixedCount} users`);
};

// Check for orphaned challenge entries
const checkOrphanedEntries = async () => {
    console.log('\n=== Checking for Orphaned Challenge Entries ===');
    
    const users = await User.find({});
    const challenges = await Challenge.find({});
    
    // Create a set of all valid challenge dates
    const validDates = new Set();
    for (const challenge of challenges) {
        validDates.add(User.formatDateKey(challenge.date));
    }
    
    let orphanedEntries = 0;
    
    for (const user of users) {
        // Check monthly challenges
        for (const key of user.monthlyChallenges.keys()) {
            if (!validDates.has(key)) {
                console.log(`User ${user.raUsername} has orphaned monthly challenge entry: ${key}`);
                orphanedEntries++;
            }
        }
        
        // Check shadow challenges
        for (const key of user.shadowChallenges.keys()) {
            if (!validDates.has(key)) {
                console.log(`User ${user.raUsername} has orphaned shadow challenge entry: ${key}`);
                orphanedEntries++;
            }
        }
    }
    
    console.log(`Found ${orphanedEntries} orphaned challenge entries`);
};

// Main function
const main = async () => {
    await connectDB();
    
    const args = process.argv.slice(2);
    const command = args[0] || 'stats';
    
    switch (command) {
        case 'stats':
            await showStats();
            break;
        case 'fix-date-keys':
            await fixDateKeys();
            break;
        case 'check-orphaned':
            await checkOrphanedEntries();
            break;
        case 'all':
            await showStats();
            await fixDateKeys();
            await checkOrphanedEntries();
            break;
        default:
            console.log('Unknown command. Available commands:');
            console.log('  stats         - Show database statistics');
            console.log('  fix-date-keys - Fix inconsistent date keys');
            console.log('  check-orphaned - Check for orphaned challenge entries');
            console.log('  all           - Run all maintenance tasks');
    }
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\nDatabase maintenance completed');
};

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
