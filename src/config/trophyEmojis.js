// src/config/trophyEmojis.js - Central emoji configuration
export const TROPHY_EMOJIS = {
    // Monthly Challenge Emojis (MC-month format)
    monthly: {
        '2025-01': { name: 'MC_jan', id: null }, // Will be updated with actual emoji ID
        '2025-02': { name: 'MC_feb', id: null },
        '2025-03': { name: 'MC_mar', id: null },
        '2025-04': { name: 'MC_apr', id: null },
        '2025-05': { name: 'MC_may', id: null },
        '2025-06': { name: 'MC_jun', id: null },
        '2025-07': { name: 'MC_jul', id: null },
        '2025-08': { name: 'MC_aug', id: null },
        '2025-09': { name: 'MC_sep', id: null },
        '2025-10': { name: 'MC_oct', id: null },
        '2025-11': { name: 'MC_nov', id: null },
        '2025-12': { name: 'MC_dec', id: null }
    },
    
    // Shadow Challenge Emojis (SG-month format)
    shadow: {
        '2025-01': { name: 'SG_jan', id: null },
        '2025-02': { name: 'SG_feb', id: null },
        '2025-03': { name: 'SG_mar', id: null },
        '2025-04': { name: 'SG_apr', id: null },
        '2025-05': { name: 'SG_may', id: null },
        '2025-06': { name: 'SG_jun', id: null },
        '2025-07': { name: 'SG_jul', id: null },
        '2025-08': { name: 'SG_aug', id: null },
        '2025-09': { name: 'SG_sep', id: null },
        '2025-10': { name: 'SG_oct', id: null },
        '2025-11': { name: 'SG_nov', id: null },
        '2025-12': { name: 'SG_dec', id: null }
    },
    
    // Default fallback emojis by award level
    defaults: {
        mastery: '✨',
        beaten: '⭐', 
        participation: '🏁',
        special: '🎖️'
    }
};

// Helper function to get trophy emoji
export function getTrophyEmoji(challengeType, monthKey, awardLevel) {
    // Try to get custom emoji first
    if (challengeType === 'monthly' && TROPHY_EMOJIS.monthly[monthKey]) {
        const emoji = TROPHY_EMOJIS.monthly[monthKey];
        if (emoji.id) {
            return {
                emojiId: emoji.id,
                emojiName: emoji.name
            };
        }
    }
    
    if (challengeType === 'shadow' && TROPHY_EMOJIS.shadow[monthKey]) {
        const emoji = TROPHY_EMOJIS.shadow[monthKey];
        if (emoji.id) {
            return {
                emojiId: emoji.id,
                emojiName: emoji.name
            };
        }
    }
    
    // Fall back to default emoji
    return {
        emojiId: null,
        emojiName: TROPHY_EMOJIS.defaults[awardLevel] || '🏆'
    };
}

// Utility function to format emoji for display
export function formatTrophyEmoji(emojiId, emojiName) {
    if (emojiId) {
        return `<:${emojiName}:${emojiId}>`;
    }
    return emojiName || '🏆';
}
