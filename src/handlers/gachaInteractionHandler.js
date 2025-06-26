// src/handlers/gachaInteractionHandler.js - NEW FILE for handling gacha machine and store interactions
import { User } from '../models/User.js';
import gachaMachine from '../services/gachaMachine.js';

class GachaInteractionHandler {
    constructor() {
        this.validInteractions = [
            'gacha_single_pull',
            'gacha_multi_pull', 
            'gacha_collection',
            'gacha_store_purchase'
        ];
    }

    /**
     * Check if this handler should process the interaction
     */
    canHandle(interaction) {
        if (interaction.isButton()) {
            return ['gacha_single_pull', 'gacha_multi_pull', 'gacha_collection'].includes(interaction.customId);
        }
        
        if (interaction.isStringSelectMenu()) {
            return interaction.customId === 'gacha_store_purchase' || 
                   (interaction.values && interaction.values[0] && interaction.values[0].startsWith('store_buy_'));
        }
        
        return false;
    }

    /**
     * Handle gacha-related interactions
     */
    async handleInteraction(interaction) {
        try {
            // Get user from database
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.reply({
                    content: '❌ You are not registered. Please ask an admin to register you first.',
                    ephemeral: true
                });
            }

            // Handle button interactions
            if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction, user);
            }

            // Handle select menu interactions (store purchases)
            if (interaction.isStringSelectMenu()) {
                await this.handleSelectMenuInteraction(interaction, user);
            }

        } catch (error) {
            console.error('Error in gacha interaction handler:', error);
            
            const errorMessage = `❌ An error occurred: ${error.message}`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }

    /**
     * Handle button interactions (gacha pulls and collection)
     */
    async handleButtonInteraction(interaction, user) {
        const { customId } = interaction;

        // Defer reply for all button interactions
        await interaction.deferReply({ ephemeral: true });

        switch (customId) {
            case 'gacha_single_pull':
                await gachaMachine.handlePull(interaction, user, 'single');
                break;

            case 'gacha_multi_pull':
                await gachaMachine.handlePull(interaction, user, 'multi');
                break;

            case 'gacha_collection':
                await gachaMachine.handleCollection(interaction, user);
                break;

            default:
                await interaction.editReply({
                    content: '❌ Unknown gacha action.',
                    ephemeral: true
                });
        }
    }

    /**
     * Handle select menu interactions (store purchases)
     */
    async handleSelectMenuInteraction(interaction, user) {
        if (interaction.customId === 'gacha_store_purchase') {
            const selectedValue = interaction.values[0];
            
            // Extract item ID from selection value (format: store_buy_itemId)
            if (selectedValue.startsWith('store_buy_')) {
                const itemId = selectedValue.replace('store_buy_', '');
                await gachaMachine.handleStorePurchase(interaction, user, itemId);
            } else {
                await interaction.reply({
                    content: '❌ Invalid store selection.',
                    ephemeral: true
                });
            }
        }
    }

    /**
     * Get handler name for logging
     */
    getName() {
        return 'GachaInteractionHandler';
    }
}

export default new GachaInteractionHandler();
