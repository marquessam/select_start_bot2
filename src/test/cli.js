#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { runScenario } from './scenarios/scenarioRunner.js';
import { generateTestProfile } from './commands/profile.js';
import { generateTestLeaderboard } from './commands/leaderboard.js';
import { generateTestArcade } from './commands/arcade.js';
import { generateTestNominations } from './commands/nominations.js';
import { generateTestAchievements } from './commands/achievements.js';
import { formatProfile } from './formatters/profileFormatter.js';
import { formatLeaderboard } from './formatters/leaderboardFormatter.js';
import { formatArcade } from './formatters/arcadeFormatter.js';
import { formatNominations } from './formatters/nominationsFormatter.js';
import { formatAchievements } from './formatters/achievementsFormatter.js';

// Set up CLI program
program
    .name('select-start-bot-test')
    .description('CLI testing tool for Select Start Bot')
    .version('1.0.0');

// Profile command
program
    .command('profile')
    .description('Test profile display for a user')
    .argument('<username>', 'RetroAchievements username')
    .option('-s, --save', 'Save output to file')
    .action(async (username, options) => {
        try {
            console.log(chalk.blue(`Testing profile for user: ${username}`));
            const profile = generateTestProfile(username);
            const output = formatProfile(profile);
            console.log(output);
            
            if (options.save) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                await saveOutput(`profile_${username}_${timestamp}`, output);
            }
        } catch (error) {
            console.error(chalk.red('Error testing profile:'), error);
        }
    });

// Leaderboard command
program
    .command('leaderboard')
    .description('Test leaderboard display')
    .argument('<type>', 'Type of leaderboard (monthly/yearly)')
    .option('-m, --month <number>', 'Month number (1-12)', String)
    .option('-y, --year <number>', 'Year', String)
    .option('-s, --save', 'Save output to file')
    .action(async (type, options) => {
        try {
            const month = options.month || new Date().getMonth() + 1;
            const year = options.year || new Date().getFullYear();
            
            console.log(chalk.blue(`Testing ${type} leaderboard for ${month}/${year}`));
            const leaderboard = generateTestLeaderboard(type, month, year);
            const output = formatLeaderboard(leaderboard);
            console.log(output);
            
            if (options.save) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                await saveOutput(`leaderboard_${type}_${month}_${year}_${timestamp}`, output);
            }
        } catch (error) {
            console.error(chalk.red('Error testing leaderboard:'), error);
        }
    });

// Arcade command
program
    .command('arcade')
    .description('Test arcade leaderboard for a game')
    .argument('<gameId>', 'RetroAchievements game ID')
    .option('-s, --save', 'Save output to file')
    .action(async (gameId, options) => {
        try {
            console.log(chalk.blue(`Testing arcade leaderboard for game: ${gameId}`));
            const arcade = generateTestArcade(gameId);
            const output = formatArcade(arcade);
            console.log(output);
            
            if (options.save) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                await saveOutput(`arcade_${gameId}_${timestamp}`, output);
            }
        } catch (error) {
            console.error(chalk.red('Error testing arcade:'), error);
        }
    });

// Nominations command
program
    .command('nominations')
    .description('Test nominations system')
    .option('-m, --month <number>', 'Month number (1-12)', String)
    .option('-y, --year <number>', 'Year', String)
    .option('-s, --save', 'Save output to file')
    .action(async (options) => {
        try {
            const month = options.month || new Date().getMonth() + 1;
            const year = options.year || new Date().getFullYear();
            
            console.log(chalk.blue(`Testing nominations for ${month}/${year}`));
            const nominations = generateTestNominations(month, year);
            const output = formatNominations(nominations);
            console.log(output);
            
            if (options.save) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                await saveOutput(`nominations_${month}_${year}_${timestamp}`, output);
            }
        } catch (error) {
            console.error(chalk.red('Error testing nominations:'), error);
        }
    });

// Achievement feed command
program
    .command('achievements')
    .description('Test achievement feed')
    .argument('<username>', 'RetroAchievements username')
    .option('-c, --count <number>', 'Number of achievements to fetch', '10')
    .option('-s, --save', 'Save output to file')
    .action(async (username, options) => {
        try {
            console.log(chalk.blue(`Testing achievement feed for user: ${username}`));
            const achievements = generateTestAchievements(username, parseInt(options.count));
            const output = formatAchievements(achievements);
            console.log(output);
            
            if (options.save) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                await saveOutput(`achievements_${username}_${timestamp}`, output);
            }
        } catch (error) {
            console.error(chalk.red('Error testing achievements:'), error);
        }
    });

// Scenario command
program
    .command('scenario')
    .description('Run a test scenario')
    .argument('<name>', 'Scenario name')
    .option('-s, --save', 'Save output to file')
    .action(async (name, options) => {
        try {
            console.log(chalk.blue(`Running test scenario: ${name}`));
            const result = await runScenario(name);
            console.log(result);
            
            if (options.save) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                await saveOutput(`scenario_${name}_${timestamp}`, result);
            }
        } catch (error) {
            console.error(chalk.red('Error running scenario:'), error);
        }
    });

// Helper function to save output to file
async function saveOutput(filename, content) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
        // Create test-outputs directory if it doesn't exist
        await fs.mkdir('test-outputs', { recursive: true });
        
        const filepath = path.join('test-outputs', `${filename}.txt`);
        await fs.writeFile(filepath, content);
        console.log(chalk.green(`Output saved to: ${filepath}`));
    } catch (error) {
        console.error(chalk.red('Error saving output:'), error);
    }
}

program.parse();
