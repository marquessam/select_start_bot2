import { Game, User } from '../models/index.js';
import { EmbedBuilder } from 'discord.js';

class ShadowGameService {
    constructor(client) {
        this.client = client;
        this.shadowChannel = null;
        this.metaConditions = new Map(); // Stores current meta conditions for each month
    }

    /**
     * Initialize the shadow game channel
     * @param {string} channelId - Discord channel ID for shadow game announcements
     */
    setShadowChannel(channelId) {
        if (channelId) {
            this.shadowChannel = this.client.channels.cache.get(channelId);
            if (!this.shadowChannel) {
                console.warn(`Warning: Shadow game channel ${channelId} not found`);
            }
        }
    }

    /**
     * Set meta conditions for a shadow game
     * @param {string} gameId - Game ID
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     * @param {Object} conditions - Meta conditions configuration
     */
    async setMetaConditions(gameId, month, year, conditions) {
        try {
            const game = await Game.findOne({
                gameId,
                month,
                year,
                type: 'SHADOW'
            });

            if (!game) {
                throw new Error('Shadow game not found');
            }

            const monthKey = `${year}-${month}`;
            this.metaConditions.set(monthKey, {
                gameId,
                conditions: conditions.map(c => ({
                    ...c,
                    completed: false,
                    completedBy: null
                })),
                revealed: false
            });

            // Update game status
            game.active = false; // Hide the game until conditions are met
            await game.save();

            await this.announceMetaChallenge(month, year);
        } catch (error) {
            console.error('Error setting meta conditions:', error);
            throw error;
        }
    }

    /**
     * Check a meta condition
     * @param {string} input - User input to check against condition
     * @param {string} username - RetroAchievements username
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     * @returns {Promise<boolean>} Whether any conditions were completed
     */
    async checkMetaCondition(input, username, month, year) {
        try {
            const monthKey = `${year}-${month}`;
            const meta = this.metaConditions.get(monthKey);
            if (!meta || meta.revealed) return false;

            let conditionCompleted = false;
            
            // Check each uncompleted condition
            meta.conditions.forEach(condition => {
                if (!condition.completed && this.validateCondition(input, condition)) {
                    condition.completed = true;
                    condition.completedBy = username;
                    conditionCompleted = true;
                }
            });

            if (conditionCompleted) {
                // Check if all conditions are completed
                const allCompleted = meta.conditions.every(c => c.completed);
                if (allCompleted) {
                    await this.revealShadowGame(month, year);
                } else {
                    await this.announceProgress(month, year);
                }
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error checking meta condition:', error);
            return false;
        }
    }

    /**
     * Validate a condition against user input
     * @param {string} input - User input
     * @param {Object} condition - Condition to validate
     * @returns {boolean} Whether the condition is met
     */
    validateCondition(input, condition) {
        switch (condition.type) {
            case 'EXACT_MATCH':
                return input.toLowerCase() === condition.value.toLowerCase();
            case 'REGEX':
                return new RegExp(condition.value, 'i').test(input);
            case 'CONTAINS':
                return input.toLowerCase().includes(condition.value.toLowerCase());
            default:
                return false;
        }
    }

    /**
     * Reveal the shadow game
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     */
    async revealShadowGame(month, year) {
        try {
            const monthKey = `${year}-${month}`;
            const meta = this.metaConditions.get(monthKey);
            if (!meta) return;

            // Activate the shadow game
            const game = await Game.findOne({
                gameId: meta.gameId,
                month,
                year,
                type: 'SHADOW'
            });

            if (game) {
                game.active = true;
                await game.save();
            }

            meta.revealed = true;

            // Create reveal announcement
            const embed = new EmbedBuilder()
                .setColor('#9932CC')
                .setTitle('🎭 Shadow Game Revealed!')
                .setDescription(`The community has solved all meta conditions!`)
                .addFields(
                    { 
                        name: 'Game', 
                        value: game ? game.title : 'Unknown Game',
                        inline: false 
                    },
                    {
                        name: 'Contributors',
                        value: meta.conditions
                            .map(c => `${c.description}: ${c.completedBy}`)
                            .join('\n'),
                        inline: false
                    }
                )
                .setTimestamp();

            if (this.shadowChannel) {
                await this.shadowChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error revealing shadow game:', error);
        }
    }

    /**
     * Announce meta challenge
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     */
    async announceMetaChallenge(month, year) {
        if (!this.shadowChannel) return;

        try {
            const monthKey = `${year}-${month}`;
            const meta = this.metaConditions.get(monthKey);
            if (!meta) return;

            const monthName = new Date(year, month - 1)
                .toLocaleString('default', { month: 'long' });

            const embed = new EmbedBuilder()
                .setColor('#9932CC')
                .setTitle(`🎭 Shadow Game Meta Challenge - ${monthName} ${year}`)
                .setDescription('A new shadow game awaits! Solve these mysteries to reveal it:')
                .addFields(
                    meta.conditions.map(c => ({
                        name: c.completed ? '✅ Solved!' : '❓ Unsolved',
                        value: c.hint || 'No hint available',
                        inline: false
                    }))
                )
                .setTimestamp();

            await this.shadowChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error announcing meta challenge:', error);
        }
    }

    /**
     * Announce progress on meta conditions
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     */
    async announceProgress(month, year) {
        if (!this.shadowChannel) return;

        try {
            const monthKey = `${year}-${month}`;
            const meta = this.metaConditions.get(monthKey);
            if (!meta) return;

            const completedCount = meta.conditions.filter(c => c.completed).length;
            const totalCount = meta.conditions.length;

            const embed = new EmbedBuilder()
                .setColor('#9932CC')
                .setTitle('🎭 Meta Challenge Progress')
                .setDescription(`A condition has been solved! (${completedCount}/${totalCount} complete)`)
                .addFields(
                    meta.conditions.map(c => ({
                        name: c.completed ? `✅ Solved by ${c.completedBy}` : '❓ Unsolved',
                        value: c.hint || 'No hint available',
                        inline: false
                    }))
                )
                .setTimestamp();

            await this.shadowChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error announcing progress:', error);
        }
    }

    /**
     * Get current meta challenge status
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     * @returns {Object|null} Current meta challenge status
     */
    getMetaStatus(month, year) {
        const monthKey = `${year}-${month}`;
        return this.metaConditions.get(monthKey) || null;
    }
}

// Create and export singleton instance
const shadowGameService = new ShadowGameService();
export default shadowGameService;
