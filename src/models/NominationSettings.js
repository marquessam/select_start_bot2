// src/models/NominationSettings.js

import mongoose from 'mongoose';
import { RestrictionRuleEngine, CONSOLE_GROUPS, QUICK_PRESETS } from '../config/consoleGroups.js';

const restrictionRuleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    emoji: {
        type: String,
        default: '🎮'
    },
    color: {
        type: String,
        default: '#00FF00'
    },
    enabled: {
        type: Boolean,
        default: true
    },
    // Rule definition using the new rule engine
    rules: {
        type: {
            type: String,
            enum: ['AND', 'OR'],
            default: 'AND'
        },
        conditions: [{
            type: {
                type: String,
                enum: [
                    'CONSOLE_GROUP', 'PUBLISHER_GROUP', 'GENRE_GROUP',
                    'CONSOLE_ID', 'CONSOLE_NAME', 'PUBLISHER', 'DEVELOPER', 
                    'GENRE', 'MIN_YEAR', 'MAX_YEAR', 'YEAR_RANGE'
                ],
                required: true
            },
            value: mongoose.Schema.Types.Mixed, // String, Number, or Object
            min: Number, // For YEAR_RANGE
            max: Number  // For YEAR_RANGE
        }]
    }
}, {
    timestamps: true
});

const monthlyRestrictionSchema = new mongoose.Schema({
    month: {
        type: Number,
        required: true,
        min: 0,
        max: 11
    },
    year: {
        type: Number,
        required: false // If null, applies to all years
    },
    restrictionRule: restrictionRuleSchema,
    enabled: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const nominationSettingsSchema = new mongoose.Schema({
    // Date restrictions
    nominationCloseDays: {
        type: Number,
        default: 8, // Last 8 days of month
        min: 1,
        max: 15
    },
    
    // Global nomination toggle
    nominationsEnabled: {
        type: Boolean,
        default: true
    },
    
    // Default to no restrictions (changed from having default restrictions)
    defaultRestricted: {
        type: Boolean,
        default: false
    },
    
    // Override for specific months
    overrides: [{
        month: Number, // 0-11
        year: Number,
        enabled: Boolean,
        reason: String
    }],
    
    // Always blocked consoles (can still be overridden by rules)
    alwaysBlockedConsoles: [{
        type: String,
        default: [] // Changed: empty by default
    }],
    
    // Monthly restrictions using the new rule engine
    monthlyRestrictions: [monthlyRestrictionSchema],
    
    // Saved rule presets for quick access
    savedRules: [restrictionRuleSchema],
    
    // Last modified info
    lastModifiedBy: {
        discordId: String,
        username: String
    }
}, {
    timestamps: true
});

// Static methods
nominationSettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({
            // Default to no restrictions
            defaultRestricted: false,
            alwaysBlockedConsoles: [],
            nominationCloseDays: 8
        });
    }
    return settings;
};

nominationSettingsSchema.statics.updateSettings = async function(updates, modifiedBy) {
    let settings = await this.getSettings();
    Object.assign(settings, updates);
    settings.lastModifiedBy = modifiedBy;
    await settings.save();
    return settings;
};

// Instance methods
nominationSettingsSchema.methods.areNominationsOpen = function(date = new Date()) {
    // Check global toggle
    if (!this.nominationsEnabled) {
        return false;
    }
    
    // Check month/year specific overrides
    const month = date.getMonth();
    const year = date.getFullYear();
    const override = this.overrides.find(o => o.month === month && o.year === year);
    if (override) {
        return override.enabled;
    }
    
    // Check if we're in the last X days of the month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayOfMonth = date.getDate();
    const closeDaysStart = daysInMonth - this.nominationCloseDays + 1;
    
    return dayOfMonth < closeDaysStart;
};

nominationSettingsSchema.methods.getNextOpeningDate = function(date = new Date()) {
    const currentMonth = date.getMonth();
    const currentYear = date.getFullYear();
    
    // Next month, first day
    return new Date(currentYear, currentMonth + 1, 1);
};

nominationSettingsSchema.methods.getCurrentMonthRestriction = function(date = new Date()) {
    const month = date.getMonth();
    const year = date.getFullYear();
    
    // Find restriction for current month/year or just month
    return this.monthlyRestrictions.find(r => 
        r.enabled && 
        r.month === month && 
        (r.year === year || !r.year)
    ) || null;
};

nominationSettingsSchema.methods.isGameAllowed = function(gameData, date = new Date()) {
    // If default is not restricted and no specific restrictions, allow
    if (!this.defaultRestricted) {
        const restriction = this.getCurrentMonthRestriction(date);
        if (!restriction) {
            // Check always blocked consoles (legacy support)
            if (this.alwaysBlockedConsoles.length > 0 && gameData.consoleName) {
                return !this.alwaysBlockedConsoles.includes(gameData.consoleName);
            }
            return true;
        }
        
        // Evaluate the restriction rule
        return RestrictionRuleEngine.evaluateGame(gameData, restriction.restrictionRule.rules);
    }
    
    // If default restricted, need explicit allow rule
    const restriction = this.getCurrentMonthRestriction(date);
    if (!restriction) {
        return false; // Default restricted, no allow rule
    }
    
    return RestrictionRuleEngine.evaluateGame(gameData, restriction.restrictionRule.rules);
};

nominationSettingsSchema.methods.getRestrictionMessage = function(gameData, date = new Date()) {
    // Check always blocked consoles first
    if (this.alwaysBlockedConsoles.includes(gameData.consoleName)) {
        return `Games for ${gameData.consoleName} are not eligible for nomination.`;
    }
    
    const restriction = this.getCurrentMonthRestriction(date);
    if (!restriction) {
        if (this.defaultRestricted) {
            return `No games are currently allowed for nomination.`;
        }
        return `Games for ${gameData.consoleName} are not eligible for nomination.`;
    }
    
    const monthName = date.toLocaleString('default', { month: 'long' });
    
    return `${restriction.restrictionRule.emoji} **${monthName} ${restriction.restrictionRule.name}!**\n\n` +
           `${restriction.restrictionRule.description}\n\n` +
           `**Your game:** ${gameData.title} *(${gameData.consoleName})*\n` +
           `**Publisher:** ${gameData.publisher || 'Unknown'}\n` +
           `**Genre:** ${gameData.genre || 'Unknown'}\n\n` +
           `Please nominate a game that meets the current restrictions! ${restriction.restrictionRule.emoji}`;
};

nominationSettingsSchema.methods.addMonthlyRestriction = function(month, year, restrictionRule) {
    // Remove existing restriction for this month/year
    this.monthlyRestrictions = this.monthlyRestrictions.filter(r => 
        !(r.month === month && (r.year === year || (!r.year && !year)))
    );
    
    // Add new restriction
    this.monthlyRestrictions.push({
        month,
        year,
        restrictionRule,
        enabled: true
    });
};

nominationSettingsSchema.methods.removeMonthlyRestriction = function(month, year) {
    const originalLength = this.monthlyRestrictions.length;
    this.monthlyRestrictions = this.monthlyRestrictions.filter(r => 
        !(r.month === month && (r.year === year || (!r.year && !year)))
    );
    return this.monthlyRestrictions.length < originalLength;
};

nominationSettingsSchema.methods.toggleMonthlyRestriction = function(month, year, enabled) {
    const restriction = this.monthlyRestrictions.find(r => 
        r.month === month && (r.year === year || (!r.year && !year))
    );
    
    if (restriction) {
        restriction.enabled = enabled;
        return true;
    }
    return false;
};

nominationSettingsSchema.methods.applyQuickPreset = function(month, year, presetName) {
    const preset = QUICK_PRESETS[presetName];
    if (!preset) {
        throw new Error(`Preset "${presetName}" not found`);
    }
    
    const restrictionRule = {
        name: preset.name,
        description: preset.description,
        emoji: preset.emoji,
        color: preset.color,
        enabled: true,
        rules: preset.rules
    };
    
    this.addMonthlyRestriction(month, year, restrictionRule);
};

nominationSettingsSchema.methods.saveRule = function(ruleName, ruleData) {
    // Remove existing rule with same name
    this.savedRules = this.savedRules.filter(r => r.name !== ruleName);
    
    // Add new rule
    this.savedRules.push({
        name: ruleName,
        ...ruleData
    });
};

nominationSettingsSchema.methods.getSavedRule = function(ruleName) {
    return this.savedRules.find(r => r.name === ruleName);
};

// Pre-save validation
nominationSettingsSchema.pre('save', function(next) {
    // Validate monthly restrictions
    this.monthlyRestrictions.forEach(restriction => {
        if (restriction.month < 0 || restriction.month > 11) {
            throw new Error('Month must be between 0 and 11');
        }
        
        if (!restriction.restrictionRule || !restriction.restrictionRule.rules) {
            throw new Error('Monthly restriction must have valid rules');
        }
    });
    
    next();
});

export const NominationSettings = mongoose.model('NominationSettings', nominationSettingsSchema);
