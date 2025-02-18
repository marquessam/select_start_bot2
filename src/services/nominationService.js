import { EmbedBuilder } from 'discord.js';
import { Nomination, Game } from '../models/index.js';
import retroAPI from './retroAPI.js';

class NominationService {
    /**
     * Create a new nomination
     * @param {string} userId - Discord user ID
     * @param {string} gameTitle - Game title
     * @param {number} gameId - RetroAchievements game ID
     * @param {string} nominatedBy - Discord username
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     * @returns {Promise<Nomination>} Created nomination
     */
    async createNomination(userId, gameTitle, gameId, nominatedBy, month, year) {
        try {
            // Verify game exists in RetroAchievements
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                throw new Error('Game not found in RetroAchievements');
            }

            // Check if game was already nominated this month
            const voteMonth = `${year}-${month.toString().padStart(2, '0')}`;
            const existingNomination = await Nomination.findOne({
                gameId,
                voteMonth,
                status: { $in: ['PENDING', 'APPROVED'] }
            });

            if (existingNomination) {
                throw new Error('This game has already been nominated this month');
            }

            // Check user's monthly nomination limit
            const userNominations = await Nomination.countDocuments({
                userId,
                voteMonth,
                status: { $in: ['PENDING', 'APPROVED', 'SELECTED'] }
            });

            if (userNominations >= 2) {
                throw new Error('Monthly nomination limit reached');
            }

            // Create new nomination
            const nomination = new Nomination({
                userId,
                gameTitle,
                gameId,
                platform: gameInfo.consoleName,
                nominatedBy,
                voteMonth,
                status: 'PENDING'
            });

            await nomination.save();
            return nomination;
        } catch (error) {
            console.error('Error creating nomination:', error);
            throw error;
        }
    }

    /**
     * Update nomination status
     * @param {string} nominationId - Nomination document ID
     * @param {string} status - New status
     * @param {string} notes - Optional admin notes
     * @returns {Promise<Nomination>} Updated nomination
     */
    async updateNominationStatus(nominationId, status, notes = '') {
        try {
            const nomination = await Nomination.findById(nominationId);
            if (!nomination) {
                throw new Error('Nomination not found');
            }

            nomination.status = status;
            if (notes) nomination.notes = notes;
            await nomination.save();

            return nomination;
        } catch (error) {
            console.error('Error updating nomination status:', error);
            throw error;
        }
    }

    /**
     * Add or remove a vote for a nomination
     * @param {string} nominationId - Nomination document ID
     * @param {string} userId - Discord user ID
     * @param {boolean} isAdding - Whether adding or removing vote
     * @returns {Promise<Nomination>} Updated nomination
     */
    async toggleVote(nominationId, userId, isAdding) {
        try {
            const nomination = await Nomination.findById(nominationId);
            if (!nomination) {
                throw new Error('Nomination not found');
            }

            if (nomination.status !== 'APPROVED') {
                throw new Error('This nomination is not available for voting');
            }

            if (isAdding) {
                nomination.addVote(userId);
            } else {
                nomination.removeVote(userId);
            }

            await nomination.save();
            return nomination;
        } catch (error) {
            console.error('Error toggling vote:', error);
            throw error;
        }
    }

    /**
     * Select winners for the month
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     * @returns {Promise<Array>} Selected games
     */
    async selectWinners(month, year) {
        try {
            const voteMonth = `${year}-${month.toString().padStart(2, '0')}`;
            
            // Get approved nominations sorted by votes
            const nominations = await Nomination.find({
                voteMonth,
                status: 'APPROVED'
            }).sort({ votes: -1 });

            if (nominations.length < 2) {
                throw new Error('Not enough approved nominations to select winners');
            }

            // Select monthly and shadow games
            const monthlyGame = nominations[0];
            const shadowGame = nominations[1];

            // Update nomination status
            await Promise.all([
                this.updateNominationStatus(monthlyGame._id, 'SELECTED'),
                this.updateNominationStatus(shadowGame._id, 'SELECTED')
            ]);

            // Create game entries
            const games = await Promise.all([
                new Game({
                    gameId: monthlyGame.gameId.toString(),
                    title: monthlyGame.gameTitle,
                    type: 'MONTHLY',
                    month,
                    year,
                    progression: [],  // To be set by admin
                    winCondition: [], // To be set by admin
                    active: true
                }).save(),
                new Game({
                    gameId: shadowGame.gameId.toString(),
                    title: shadowGame.gameTitle,
                    type: 'SHADOW',
                    month,
                    year,
                    progression: [],  // To be set by admin
                    winCondition: [], // To be set by admin
                    active: true
                }).save()
            ]);

            return games;
        } catch (error) {
            console.error('Error selecting winners:', error);
            throw error;
        }
    }

    /**
     * Generate nominations embed
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     * @returns {Promise<EmbedBuilder>} Discord embed with nominations
     */
    async generateNominationsEmbed(month, year) {
        try {
            const voteMonth = `${year}-${month.toString().padStart(2, '0')}`;
            const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

            const nominations = await Nomination.find({
                voteMonth,
                status: { $in: ['PENDING', 'APPROVED'] }
            }).sort({ votes: -1, dateNominated: 1 });

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle(`🎮 Game Nominations - ${monthName} ${year}`)
                .setDescription('Current nominations and their votes:')
                .setTimestamp();

            if (nominations.length > 0) {
                const nominationsList = nominations.map(nom => {
                    const status = nom.status === 'APPROVED' ? '✅' : '⏳';
                    const votes = nom.status === 'APPROVED' ? ` - ${nom.votes} votes` : '';
                    return `${status} ${nom.gameTitle} (${nom.platform}) - by ${nom.nominatedBy}${votes}`;
                }).join('\n');

                embed.addFields({ 
                    name: 'Nominations', 
                    value: nominationsList,
                    inline: false 
                });
            } else {
                embed.addFields({ 
                    name: 'Nominations', 
                    value: 'No nominations yet for this month',
                    inline: false 
                });
            }

            return embed;
        } catch (error) {
            console.error('Error generating nominations embed:', error);
            throw error;
        }
    }
}

// Create and export singleton instance
const nominationService = new NominationService();
export default nominationService;
