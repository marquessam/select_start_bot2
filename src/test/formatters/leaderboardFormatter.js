import chalk from 'chalk';
import { table } from 'table';

/**
 * Format leaderboard data for terminal display
 * @param {Object} leaderboard - Leaderboard data
 * @param {boolean} useColors - Whether to use terminal colors
 * @returns {string} Formatted leaderboard string
 */
export function formatLeaderboard(leaderboard, useColors = true) {
    const c = useColors ? chalk : {
        blue: str => str,
        yellow: str => str,
        green: str => str,
        gray: str => str,
        bold: str => str
    };

    // Format header
    let output = [
        c.blue('═'.repeat(60)),
        c.blue(`║ ${c.bold(leaderboard.title)}`),
        c.blue('═'.repeat(60)),
        ''
    ];

    // Format current games section if present
    if (leaderboard.currentGames && leaderboard.currentGames.length > 0) {
        output.push(
            c.yellow('Current Games'),
            ...leaderboard.currentGames.map(game => 
                `${game.type === 'MONTHLY' ? '🎮' : '👻'} ${game.title}`
            ),
            ''
        );
    }

    // Format rankings
    if (leaderboard.rankings && leaderboard.rankings.length > 0) {
        const rankingsData = leaderboard.rankings.map((entry, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ' ';
            return [
                medal,
                entry.username,
                entry.points.toString(),
                entry.details || ''
            ];
        });

        output.push(
            c.green('Rankings'),
            table(rankingsData, {
                columns: {
                    0: { alignment: 'center', width: 3 },
                    1: { alignment: 'left', width: 20 },
                    2: { alignment: 'right', width: 8 },
                    3: { alignment: 'left' }
                }
            })
        );
    } else {
        output.push(c.gray('No rankings available'));
    }

    // Format statistics if present
    if (leaderboard.statistics) {
        output.push(
            '',
            c.yellow('Statistics'),
            `Total Games: ${leaderboard.statistics.totalGames}`,
            `Total Participants: ${leaderboard.statistics.totalParticipants}`
        );
    }

    // Format timestamp
    output.push(
        '',
        c.gray(`Last Updated: ${new Date().toLocaleString()}`)
    );

    return output.join('\n');
}

/**
 * Format leaderboard data as JSON
 * @param {Object} leaderboard - Leaderboard data
 * @returns {string} JSON string
 */
export function formatLeaderboardJson(leaderboard) {
    return JSON.stringify(leaderboard, null, 2);
}
