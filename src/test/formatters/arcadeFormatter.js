import chalk from 'chalk';
import { table } from 'table';

/**
 * Format arcade data for terminal display
 * @param {Object} arcade - Arcade data
 * @param {boolean} useColors - Whether to use terminal colors
 * @returns {string} Formatted arcade string
 */
export function formatArcade(arcade, useColors = true) {
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
        c.blue(`║ ${c.bold(`Arcade Leaderboard - Game #${arcade.gameId}`)}`),
        c.blue('═'.repeat(60)),
        ''
    ];

    // Format rankings
    if (arcade.rankings && arcade.rankings.length > 0) {
        const rankingsData = arcade.rankings.map(entry => {
            const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : ' ';
            return [
                medal,
                entry.username,
                entry.rank.toString(),
                entry.score.toLocaleString(),
                entry.points ? `+${entry.points}` : '-'
            ];
        });

        const headers = ['', 'Player', 'Rank', 'Score', 'Points'];
        output.push(
            c.green('Rankings'),
            table([headers, ...rankingsData], {
                columns: {
                    0: { alignment: 'center', width: 3 },
                    1: { alignment: 'left', width: 20 },
                    2: { alignment: 'right', width: 6 },
                    3: { alignment: 'right', width: 12 },
                    4: { alignment: 'center', width: 8 }
                }
            })
        );
    } else {
        output.push(c.gray('No rankings available'));
    }

    // Format timestamp
    output.push(
        '',
        c.gray(`Last Updated: ${arcade.timestamp.toLocaleString()}`)
    );

    return output.join('\n');
}

/**
 * Format arcade data as JSON
 * @param {Object} arcade - Arcade data
 * @returns {string} JSON string
 */
export function formatArcadeJson(arcade) {
    return JSON.stringify(arcade, null, 2);
}
