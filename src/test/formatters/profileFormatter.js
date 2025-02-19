import chalk from 'chalk';
import { table } from 'table';

/**
 * Format profile data for terminal display
 * @param {Object} profile - Profile data
 * @param {boolean} useColors - Whether to use terminal colors
 * @returns {string} Formatted profile string
 */
export function formatProfile(profile, useColors = true) {
    const c = useColors ? chalk : { 
        blue: str => str,
        green: str => str,
        yellow: str => str,
        cyan: str => str,
        gray: str => str,
        bold: str => str
    };

    // Format header
    let output = [
        c.blue('═'.repeat(50)),
        c.blue(`║ ${c.bold(profile.username)}'s Profile`),
        c.blue('═'.repeat(50)),
        ''
    ];

    // Format points section
    const pointsData = [
        ['Total Points', profile.totalPoints],
        ['Yearly Points', profile.yearlyPoints],
        ['Monthly Points', profile.monthlyPoints],
        ['Arcade Points', profile.arcadePoints]
    ];

    output.push(
        c.green('Points Summary'),
        table(pointsData, {
            columns: {
                0: { alignment: 'left' },
                1: { alignment: 'right' }
            }
        })
    );

    // Format current progress
    if (profile.currentProgress && profile.currentProgress.length > 0) {
        output.push(
            c.yellow('Current Progress'),
            ...profile.currentProgress.map(game => 
                `${game.title}: ${game.completion}%`
            ),
            ''
        );
    }

    // Format achievement breakdown
    if (profile.achievements) {
        output.push(
            c.cyan('Achievement Breakdown'),
            `Mastery: ${profile.achievements.mastery} 🌟`,
            `Beaten: ${profile.achievements.beaten} ⭐`,
            `Participation: ${profile.achievements.participation} ✨`,
            ''
        );
    }

    // Format activity info
    output.push(
        c.gray('Activity Info'),
        `Status: ${profile.activityStatus}`,
        `Last Active: ${new Date(profile.lastActivity).toLocaleString()}`,
        `Member Since: ${new Date(profile.joinDate).toLocaleString()}`
    );

    return output.join('\n');
}

/**
 * Format profile data as JSON
 * @param {Object} profile - Profile data
 * @returns {string} JSON string
 */
export function formatProfileJson(profile) {
    return JSON.stringify(profile, null, 2);
}
