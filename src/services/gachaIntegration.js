// src/services/gachaIntegration.js
import gachaMachine from './gachaMachine.js';
import { GachaItem } from '../models/GachaItem.js';

class GachaIntegration {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Initialize the entire gacha system
     */
    async initialize(client) {
        try {
            console.log('🎰 Initializing Gacha System...');

            // Set client for gacha machine
            gachaMachine.setClient(client);

            // Create sample items if none exist (for testing)
            await this.createSampleItemsIfNeeded();

            // Start the gacha machine
            await gachaMachine.start();

            this.isInitialized = true;
            console.log('✅ Gacha System initialized successfully');

        } catch (error) {
            console.error('❌ Error initializing Gacha System:', error);
        }
    }

    /**
     * Award trophy to user (called from game award service)
     */
    async awardTrophy(user, gameId, gameTitle, awardLevel, challengeType, monthKey) {
        try {
            if (!user.trophyCase) {
                user.trophyCase = [];
            }

            // Check if user already has this trophy
            const existingTrophy = user.trophyCase.find(trophy => 
                trophy.gameId === String(gameId) && 
                trophy.challengeType === challengeType &&
                trophy.monthKey === monthKey
            );

            if (existingTrophy) {
                console.log(`User ${user.raUsername} already has trophy for ${gameTitle} (${challengeType})`);
                return false;
            }

            // Create trophy entry
            const trophy = {
                gameId: String(gameId),
                gameTitle: gameTitle,
                consoleName: 'Unknown', // This should be filled from game info if available
                awardLevel: awardLevel, // 'mastery', 'beaten', 'participation'
                challengeType: challengeType, // 'monthly', 'shadow'
                emojiId: null, // Will be filled when custom emoji is uploaded
                emojiName: this.getTrophyEmoji(awardLevel),
                earnedAt: new Date(),
                monthKey: monthKey
            };

            user.trophyCase.push(trophy);
            await user.save();

            console.log(`✅ Awarded ${awardLevel} trophy to ${user.raUsername} for ${gameTitle}`);
            return true;

        } catch (error) {
            console.error(`Error awarding trophy to ${user.raUsername}:`, error);
            return false;
        }
    }

    /**
     * Get default trophy emoji based on award level
     */
    getTrophyEmoji(awardLevel) {
        const emojiMap = {
            mastery: '✨',
            beaten: '⭐', 
            participation: '🏁'
        };
        return emojiMap[awardLevel] || '🏆';
    }

    /**
     * Create sample items for testing (only if no items exist)
     */
    async createSampleItemsIfNeeded() {
        const existingItems = await GachaItem.countDocuments();
        
        if (existingItems > 0) {
            console.log(`Found ${existingItems} existing gacha items`);
            return;
        }

        console.log('Creating sample gacha items...');

        const sampleItems = [
            // Common trinkets
            {
                itemId: 'coin',
                itemName: 'Gold Coin',
                description: 'A shiny gold coin',
                itemType: 'trinket',
                rarity: 'common',
                dropRate: 25,
                emojiName: '🪙',
                flavorText: 'It\'s-a me, money!',
                maxStack: 99
            },
            {
                itemId: 'mushroom',
                itemName: 'Super Mushroom',
                description: 'A power-up mushroom',
                itemType: 'collectible',
                rarity: 'uncommon',
                dropRate: 15,
                emojiName: '🍄',
                flavorText: 'Eat me to grow bigger!'
            },
            {
                itemId: 'fireflower',
                itemName: 'Fire Flower',
                description: 'Grants fire power',
                itemType: 'collectible',
                rarity: 'rare',
                dropRate: 8,
                emojiName: '🌸',
                flavorText: 'Hot stuff coming through!'
            },

            // Triforce series
            {
                itemId: 'triforce_power',
                itemName: 'Triforce of Power',
                description: 'One third of the legendary Triforce',
                itemType: 'series',
                seriesId: 'triforce',
                rarity: 'rare',
                dropRate: 5,
                emojiName: '🔺',
                flavorText: 'The Triforce of Power, wielded by Ganondorf.',
                completionReward: {
                    itemId: 'complete_triforce',
                    itemName: 'Complete Triforce',
                    emojiName: '⭐'
                }
            },
            {
                itemId: 'triforce_wisdom',
                itemName: 'Triforce of Wisdom',
                description: 'One third of the legendary Triforce',
                itemType: 'series',
                seriesId: 'triforce',
                rarity: 'rare',
                dropRate: 5,
                emojiName: '🔺',
                flavorText: 'The Triforce of Wisdom, held by Princess Zelda.',
                completionReward: {
                    itemId: 'complete_triforce',
                    itemName: 'Complete Triforce',
                    emojiName: '⭐'
                }
            },
            {
                itemId: 'triforce_courage',
                itemName: 'Triforce of Courage',
                description: 'One third of the legendary Triforce',
                itemType: 'series',
                seriesId: 'triforce',
                rarity: 'rare',
                dropRate: 5,
                emojiName: '🔺',
                flavorText: 'The Triforce of Courage, Link\'s source of power.',
                completionReward: {
                    itemId: 'complete_triforce',
                    itemName: 'Complete Triforce',
                    emojiName: '⭐'
                }
            },

            // Special items
            {
                itemId: 'masterball',
                itemName: 'Master Ball',
                description: 'The ultimate Pokéball',
                itemType: 'special',
                rarity: 'legendary',
                dropRate: 1,
                emojiName: '⚪',
                flavorText: 'A ball that will catch any Pokémon without fail.'
            },
            {
                itemId: 'star',
                itemName: 'Super Star',
                description: 'Grants temporary invincibility',
                itemType: 'collectible',
                rarity: 'epic',
                dropRate: 3,
                emojiName: '⭐',
                flavorText: 'You\'re invincible! For a few seconds...',
                maxStack: 5
            }
        ];

        for (const itemData of sampleItems) {
            try {
                const item = new GachaItem({
                    ...itemData,
                    createdBy: 'system',
                    isActive: true
                });
                await item.save();
                console.log(`✅ Created sample item: ${itemData.itemName}`);
            } catch (error) {
                console.error(`❌ Error creating sample item ${itemData.itemName}:`, error);
            }
        }

        console.log('✅ Sample gacha items created');
    }

    /**
     * Update the gacha machine (for maintenance)
     */
    async updateMachine() {
        if (this.isInitialized) {
            await gachaMachine.updateMachine();
        }
    }

    /**
     * Stop the gacha system
     */
    stop() {
        if (this.isInitialized) {
            gachaMachine.stop();
            this.isInitialized = false;
            console.log('Gacha System stopped');
        }
    }
}

export default new GachaIntegration();
