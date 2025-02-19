import chalk from 'chalk';
import { table } from 'table';

/**
 * Format achievements data for terminal display
 * @param {Object} achievements - Achievements data
 * @param {boolean} useColors - Whether to use terminal colors
 * @returns {string} Formatted achievements string
 */
export function formatAchievements(achievements, useColors = true) {
    const c = useColors ? chalk : {
        blue: str => str,
        yellow: str => str,
        green: str => str,
        cyan: str => str,
        gray: str => str,
        bold: str => str
    };

    // Format header
    let output = [
        c.blue('═'.repeat(100)),
        c.blue(`║ ${c.bold(`Recent Achievements for ${achievements.username}`)}`),
        c.blue('═'.repeat(100)),
        ''
    ];

    // Group achievements by type
    const grouped = achievements.achievements.reduce((acc, ach) => {
        acc[ach.type] = acc[ach.type] || [];
        acc[ach.type].push(ach);
        return acc;
    }, {});

    // Format each group
    const types = ['MONTHLY', 'SHADOW', 'OTHER'];
    for (const type of types) {
        if (grouped[type] && grouped[type].length > 0) {
            const typeColor = type === 'MONTHLY' ? c.green :
                            type === 'SHADOW' ? c.cyan :
                            c.yellow;

            const achievementsData = grouped[type].map(ach => [
                new Date(ach.dateEarned).toLocaleString(),
                ach.gameTitle,
                ach.title,
                ach.points.toString(),
                ach.description
            ]);

            const headers = ['Time', 'Game', 'Achievement', 'Points', 'Description'];
            output.push(
                typeColor(`${type} Achievements`),
                table([headers, ...achievementsData], {
                    columns: {
                        0: { alignment: 'left', width: 20 },
                        1: { alignment: 'left', width: 20 },
                        2: { alignment: 'left', width: 25 },
                        3: { alignment: 'right', width: 8 },
                        4: { alignment: 'left', width: 30 }
                    }
                }),
                ''
            );
        }
    }

    // Add summary
    const totalPoints = achievements.achievements.reduce((sum, ach) => sum + ach.points, 0);
    output.push(
        c.yellow('Summary'),
        `Total Achievements: ${achievements.achievements.length}`,
        `Total Points: ${totalPoints}`,
        '',
        c.gray(`Last Updated: ${achievements.timestamp.toLocaleString()}`)
    );

    return output.join('\n');
}

/**
 * Format achievements data as JSON
 * @param {Object} achievements - Achievements data
 * @returns {string} JSON string
 */
export function formatAchievementsJson(achievements) {
    return JSON.stringify(achievements, null, 2);
}
