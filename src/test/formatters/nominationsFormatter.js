import chalk from 'chalk';
import { table } from 'table';

/**
 * Format nominations data for terminal display
 * @param {Object} nominations - Nominations data
 * @param {boolean} useColors - Whether to use terminal colors
 * @returns {string} Formatted nominations string
 */
export function formatNominations(nominations, useColors = true) {
    const c = useColors ? chalk : {
        blue: str => str,
        yellow: str => str,
        green: str => str,
        red: str => str,
        gray: str => str,
        bold: str => str
    };

    const monthName = new Date(nominations.year, nominations.month - 1)
        .toLocaleString('default', { month: 'long' });

    // Format header
    let output = [
        c.blue('═'.repeat(80)),
        c.blue(`║ ${c.bold(`Game Nominations - ${monthName} ${nominations.year}`)}`),
        c.blue('═'.repeat(80)),
        ''
    ];

    // Format nominations
    if (nominations.nominations && nominations.nominations.length > 0) {
        const nominationsData = nominations.nominations.map(nom => {
            const status = nom.status === 'APPROVED' ? c.green('✓') :
                          nom.status === 'PENDING' ? c.yellow('⋯') :
                          nom.status === 'REJECTED' ? c.red('✗') : ' ';
            
            return [
                status,
                nom.gameTitle,
                nom.platform,
                nom.nominatedBy,
                nom.votes.toString(),
                new Date(nom.dateNominated).toLocaleDateString()
            ];
        });

        const headers = ['', 'Game', 'Platform', 'Nominated By', 'Votes', 'Date'];
        output.push(
            c.yellow('Current Nominations'),
            table([headers, ...nominationsData], {
                columns: {
                    0: { alignment: 'center', width: 3 },
                    1: { alignment: 'left', width: 30 },
                    2: { alignment: 'left', width: 10 },
                    3: { alignment: 'left', width: 15 },
                    4: { alignment: 'right', width: 7 },
                    5: { alignment: 'right', width: 12 }
                }
            })
        );

        // Add status legend
        output.push(
            '',
            'Status:',
            `${c.green('✓')} Approved    ${c.yellow('⋯')} Pending    ${c.red('✗')} Rejected`
        );
    } else {
        output.push(c.gray('No nominations available'));
    }

    // Format timestamp
    output.push(
        '',
        c.gray(`Last Updated: ${nominations.timestamp.toLocaleString()}`)
    );

    return output.join('\n');
}

/**
 * Format nominations data as JSON
 * @param {Object} nominations - Nominations data
 * @returns {string} JSON string
 */
export function formatNominationsJson(nominations) {
    return JSON.stringify(nominations, null, 2);
}
