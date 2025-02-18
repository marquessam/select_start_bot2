import chalk from 'chalk';
import { generateTestProfile } from '../commands/profile.js';
import { generateTestLeaderboard } from '../commands/leaderboard.js';
import { generateTestAchievements } from '../commands/achievements.js';
import { generateTestArcade } from '../commands/arcade.js';
import { generateTestNominations } from '../commands/nominations.js';

/**
 * Run a test scenario
 * @param {string} name - Scenario name
 * @returns {Promise<string>} Formatted scenario output
 */
export async function runScenario(name) {
    const scenario = scenarios[name];
    if (!scenario) {
        throw new Error(`Unknown scenario: ${name}`);
    }

    try {
        return await scenario();
    } catch (error) {
        console.error('Error running scenario:', error);
        throw error;
    }
}

/**
 * Available test scenarios
 */
const scenarios = {
    // Test monthly challenge progression
    'monthly-challenge': async () => {
        const output = [];
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();

        // Initial state
        output.push(
            chalk.blue('═'.repeat(80)),
            chalk.blue('Monthly Challenge Progression Test'),
            chalk.blue('═'.repeat(80)),
            ''
        );

        // Step 1: Show initial leaderboard
        const initialLeaderboard = generateTestLeaderboard('monthly', month, year);
        output.push(
            chalk.yellow('Step 1: Initial Monthly Leaderboard'),
            formatLeaderboardText(initialLeaderboard),
            ''
        );

        // Step 2: Show user starting a new game
        const newPlayer = generateTestProfile('NewPlayer');
        newPlayer.totalPoints = 0;
        newPlayer.monthlyPoints = 0;
        newPlayer.currentProgress = [
            { title: 'Chrono Trigger', completion: '0.0%' }
        ];
        newPlayer.achievements = {
            mastery: 0,
            beaten: 0,
            participation: 0
        };

        output.push(
            chalk.yellow('Step 2: New Player Starting Game'),
            formatProfileText(newPlayer),
            ''
        );

        // Step 3: Show progress after some achievements
        const achievements = generateTestAchievements('NewPlayer', 3);
        output.push(
            chalk.yellow('Step 3: After Earning Some Achievements'),
            formatAchievementsText(achievements),
            ''
        );

        // Step 4: Show updated leaderboard
        const updatedLeaderboard = generateTestLeaderboard('monthly', month, year);
        updatedLeaderboard.rankings.push({
            username: 'NewPlayer',
            points: 1,
            details: '0 🌟 | 0 ⭐ | 1 ✨'
        });
        updatedLeaderboard.rankings.sort((a, b) => b.points - a.points);

        output.push(
            chalk.yellow('Step 4: Updated Monthly Leaderboard'),
            formatLeaderboardText(updatedLeaderboard),
            ''
        );

        return output.join('\n');
    },

    // Test shadow game reveal
    'shadow-game': async () => {
        const output = [];
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();

        output.push(
            chalk.blue('═'.repeat(80)),
            chalk.blue('Shadow Game Reveal Test'),
            chalk.blue('═'.repeat(80)),
            ''
        );

        // Step 1: Initial state (hidden shadow game)
        const initialLeaderboard = generateTestLeaderboard('monthly', month, year);
        initialLeaderboard.currentGames = [
            { type: 'MONTHLY', title: 'Chrono Trigger' }
        ];

        output.push(
            chalk.yellow('Step 1: Initial State (Shadow Game Hidden)'),
            formatLeaderboardText(initialLeaderboard),
            ''
        );

        // Step 2: Community discovers first piece
        output.push(
            chalk.yellow('Step 2: First Meta Piece Found'),
            chalk.cyan('Community discovers: "A mysterious force stirs in time..."'),
            ''
        );

        // Step 3: More pieces found
        output.push(
            chalk.yellow('Step 3: More Meta Pieces Found'),
            chalk.cyan('Additional pieces discovered:'),
            chalk.cyan('- "The year 600 AD calls..."'),
            chalk.cyan('- "Magus\'s lair holds secrets..."'),
            chalk.cyan('- "The Ocean Palace beckons..."'),
            ''
        );

        // Step 4: Final reveal
        const finalLeaderboard = generateTestLeaderboard('monthly', month, year);
        output.push(
            chalk.yellow('Step 4: Shadow Game Revealed'),
            chalk.green('The community has discovered the shadow game!'),
            formatLeaderboardText(finalLeaderboard),
            ''
        );

        return output.join('\n');
    },

    // Test arcade points
    'arcade': async () => {
        const output = [];

        output.push(
            chalk.blue('═'.repeat(80)),
            chalk.blue('Arcade Points Test'),
            chalk.blue('═'.repeat(80)),
            ''
        );

        // Step 1: Initial state
        const player = generateTestProfile('ArcadePlayer');
        player.arcadePoints = 0;

        output.push(
            chalk.yellow('Step 1: Initial State'),
            formatProfileText(player),
            ''
        );

        // Step 2: Player gets high score
        const tetrisArcade = generateTestArcade('1234'); // Tetris game ID
        output.push(
            chalk.yellow('Step 2: Achieved #1 Rank in Tetris'),
            chalk.green('New high score recorded!'),
            formatArcadeText(tetrisArcade),
            ''
        );

        // Step 3: Multiple game rankings
        const multiArcade = generateTestArcade('5678'); // Multiple games
        output.push(
            chalk.yellow('Step 3: Multiple Game Rankings'),
            formatArcadeText(multiArcade),
            ''
        );

        return output.join('\n');
    },

    // Test nominations
    'nominations': async () => {
        const output = [];
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();

        output.push(
            chalk.blue('═'.repeat(80)),
            chalk.blue('Nominations Test'),
            chalk.blue('═'.repeat(80)),
            ''
        );

        // Step 1: Initial nominations
        const nominations = generateTestNominations(month, year);
        output.push(
            chalk.yellow('Step 1: Current Nominations'),
            formatNominationsText(nominations),
            ''
        );

        return output.join('\n');
    }
};

// Simple text formatters for test output
function formatProfileText(profile) {
    return [
        `Username: ${profile.username}`,
        `Total Points: ${profile.totalPoints}`,
        `Yearly Points: ${profile.yearlyPoints}`,
        `Monthly Points: ${profile.monthlyPoints}`,
        `Arcade Points: ${profile.arcadePoints}`,
        `Status: ${profile.activityStatus}`,
        '',
        'Current Progress:',
        ...profile.currentProgress.map(p => `${p.title}: ${p.completion}`),
        '',
        'Achievements:',
        `Mastery: ${profile.achievements.mastery} 🌟`,
        `Beaten: ${profile.achievements.beaten} ⭐`,
        `Participation: ${profile.achievements.participation} ✨`
    ].join('\n');
}

function formatLeaderboardText(leaderboard) {
    const lines = [
        leaderboard.title,
        '',
        'Current Games:'
    ];

    leaderboard.currentGames.forEach(game => {
        lines.push(`${game.type === 'MONTHLY' ? '🎮' : '👻'} ${game.title}`);
    });

    lines.push('', 'Rankings:');
    leaderboard.rankings.forEach((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▫️';
        lines.push(`${medal} ${entry.username}: ${entry.points} points ${entry.details || ''}`);
    });

    lines.push(
        '',
        'Statistics:',
        `Total Games: ${leaderboard.statistics.totalGames}`,
        `Total Participants: ${leaderboard.statistics.totalParticipants}`
    );

    return lines.join('\n');
}

function formatAchievementsText(achievements) {
    const lines = [
        `Recent Achievements for ${achievements.username}`,
        ''
    ];

    achievements.achievements.forEach(ach => {
        lines.push(
            `${ach.type === 'MONTHLY' ? '🎮' : ach.type === 'SHADOW' ? '👻' : '🎯'} ${ach.title}`,
            `Game: ${ach.gameTitle}`,
            `Points: ${ach.points}`,
            `Description: ${ach.description}`,
            `Earned: ${ach.dateEarned.toLocaleString()}`,
            ''
        );
    });

    return lines.join('\n');
}

function formatArcadeText(arcade) {
    const lines = [
        `Arcade Leaderboard - Game #${arcade.gameId}`,
        ''
    ];

    arcade.rankings.forEach((entry, index) => {
        const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : ' ';
        lines.push(
            `${medal} ${entry.username}`,
            `Rank: ${entry.rank}`,
            `Score: ${entry.score.toLocaleString()}`,
            `Points: ${entry.points ? `+${entry.points}` : '-'}`,
            ''
        );
    });

    return lines.join('\n');
}

function formatNominationsText(nominations) {
    const lines = [
        `Game Nominations - ${new Date(nominations.year, nominations.month - 1).toLocaleString('default', { month: 'long' })} ${nominations.year}`,
        ''
    ];

    nominations.nominations.forEach(nom => {
        const status = nom.status === 'APPROVED' ? '✓' :
                      nom.status === 'PENDING' ? '⋯' :
                      nom.status === 'REJECTED' ? '✗' : ' ';
        
        lines.push(
            `${status} ${nom.gameTitle}`,
            `Platform: ${nom.platform}`,
            `Nominated By: ${nom.nominatedBy}`,
            `Votes: ${nom.votes}`,
            `Date: ${new Date(nom.dateNominated).toLocaleDateString()}`,
            ''
        );
    });

    return lines.join('\n');
}
