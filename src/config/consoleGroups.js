// src/config/consoleGroups.js

/**
 * Predefined console groups for easy restriction management
 */

export const CONSOLE_GROUPS = {
    NINTENDO: {
        name: 'Nintendo',
        emoji: '🍄',
        color: '#E60012',
        consoles: [
            'Nintendo Entertainment System',
            'NES',
            'Famicom',
            'Super Nintendo Entertainment System', 
            'SNES',
            'Super Famicom',
            'Nintendo 64',
            'N64',
            'GameCube',
            'Game Boy',
            'Game Boy Color',
            'Game Boy Advance',
            'Nintendo DS',
            'Nintendo 3DS'
        ],
        publishers: ['Nintendo'],
        consoleIds: [7, 3, 2, 4, 12, 13, 18, 20] // Add actual console IDs
    },

    SEGA: {
        name: 'SEGA',
        emoji: '🦔',
        color: '#0066CC',
        consoles: [
            'Genesis',
            'Mega Drive',
            'Sega Genesis',
            'Sega Mega Drive',
            'Saturn',
            'Sega Saturn',
            'Dreamcast',
            'Sega Dreamcast',
            'Master System',
            'Sega Master System',
            'Game Gear',
            'Sega Game Gear',
            'Sega CD',
            'Mega-CD',
            'Sega 32X',
            '32X'
        ],
        publishers: ['Sega', 'SEGA'],
        consoleIds: [1, 9, 10, 11, 15] // Add actual console IDs
    },

    SONY: {
        name: 'Sony',
        emoji: '🎮',
        color: '#003087',
        consoles: [
            'PlayStation',
            'PlayStation 2',
            'PlayStation Portable',
            'PSP'
        ],
        publishers: ['Sony', 'Sony Computer Entertainment'],
        consoleIds: [12, 21, 41] // Add actual console IDs
    },

    HANDHELDS: {
        name: 'Handhelds',
        emoji: '📱',
        color: '#8B4513',
        consoles: [
            'Game Boy',
            'Game Boy Color', 
            'Game Boy Advance',
            'Game Gear',
            'Sega Game Gear',
            'Nintendo DS',
            'Nintendo 3DS',
            'PlayStation Portable',
            'PSP',
            'Atari Lynx',
            'Neo Geo Pocket',
            'Neo Geo Pocket Color',
            'WonderSwan',
            'WonderSwan Color'
        ],
        consoleIds: [4, 6, 12, 13, 18, 20, 41, 13, 14, 17, 56, 57] // Add actual console IDs
    },

    ARCADE: {
        name: 'Arcade',
        emoji: '🕹️',
        color: '#FF6600',
        consoles: [
            'Arcade',
            'Neo Geo',
            'Neo Geo CD'
        ],
        consoleIds: [27, 8, 26] // Add actual console IDs
    },

    RETRO_NINTENDO: {
        name: 'Retro Nintendo',
        emoji: '🎯',
        color: '#8B0000',
        consoles: [
            'Nintendo Entertainment System',
            'NES', 
            'Famicom',
            'Super Nintendo Entertainment System',
            'SNES',
            'Super Famicom',
            'Game Boy',
            'Game Boy Color'
        ],
        publishers: ['Nintendo'],
        maxYear: 1999,
        consoleIds: [7, 3, 4, 6] // Add actual console IDs
    },

    MODERN_NINTENDO: {
        name: 'Modern Nintendo',
        emoji: '🌟',
        color: '#0066FF',
        consoles: [
            'Nintendo 64',
            'GameCube',
            'Game Boy Advance',
            'Nintendo DS',
            'Nintendo 3DS'
        ],
        publishers: ['Nintendo'],
        minYear: 1996,
        consoleIds: [2, 4, 12, 18, 20] // Add actual console IDs
    }
};

/**
 * Publisher groups for restriction rules
 */
export const PUBLISHER_GROUPS = {
    NINTENDO: ['Nintendo', 'Nintendo of America', 'Nintendo Co., Ltd.'],
    SEGA: ['Sega', 'SEGA', 'Sega of America', 'Sega Enterprises'],
    CAPCOM: ['Capcom', 'Capcom Co., Ltd.', 'Capcom USA'],
    KONAMI: ['Konami', 'Konami Digital Entertainment'],
    SQUARE: ['Square', 'Square Enix', 'SquareSoft'],
    NAMCO: ['Namco', 'Bandai Namco', 'Namco Bandai'],
    SNK: ['SNK', 'SNK Playmore', 'SNK Corporation'],
    ACTIVISION: ['Activision', 'Activision Blizzard'],
    ATARI: ['Atari', 'Atari Corporation', 'Atari Games']
};

/**
 * Genre groups for thematic restrictions
 */
export const GENRE_GROUPS = {
    RPG: {
        name: 'RPG Month',
        emoji: '⚔️',
        color: '#8B008B',
        genres: ['Role-Playing Game', 'RPG', 'JRPG', 'Action RPG']
    },
    ACTION: {
        name: 'Action Month', 
        emoji: '💥',
        color: '#FF4500',
        genres: ['Action', 'Platform', 'Beat \'em Up', 'Fighting']
    },
    PUZZLE: {
        name: 'Puzzle Month',
        emoji: '🧩', 
        color: '#4B0082',
        genres: ['Puzzle', 'Puzzle-Platformer']
    },
    RACING: {
        name: 'Racing Month',
        emoji: '🏎️',
        color: '#FF1493',
        genres: ['Racing', 'Sports']
    },
    SHOOTER: {
        name: 'Shooter Month',
        emoji: '🔫',
        color: '#DC143C',
        genres: ['Shoot \'em Up', 'First-Person Shooter', 'Third-Person Shooter']
    }
};

/**
 * Quick preset configurations
 */
export const QUICK_PRESETS = {
    SEGA_MONTH: {
        name: 'SEGA Month',
        description: 'Only SEGA games (console OR publisher)',
        emoji: '🦔',
        color: '#0066CC',
        rules: {
            type: 'OR',
            conditions: [
                { type: 'CONSOLE_GROUP', value: 'SEGA' },
                { type: 'PUBLISHER_GROUP', value: 'SEGA' }
            ]
        }
    },

    NINTENDO_MONTH: {
        name: 'Nintendo Month', 
        description: 'Only Nintendo games (console OR publisher)',
        emoji: '🍄',
        color: '#E60012',
        rules: {
            type: 'OR',
            conditions: [
                { type: 'CONSOLE_GROUP', value: 'NINTENDO' },
                { type: 'PUBLISHER_GROUP', value: 'NINTENDO' }
            ]
        }
    },

    HANDHELD_MONTH: {
        name: 'Handheld Month',
        description: 'Only handheld console games',
        emoji: '📱',
        color: '#8B4513',
        rules: {
            type: 'AND',
            conditions: [
                { type: 'CONSOLE_GROUP', value: 'HANDHELDS' }
            ]
        }
    },

    RETRO_MONTH: {
        name: 'Retro Month',
        description: 'Games released before 1995',
        emoji: '📺',
        color: '#8B4513',
        rules: {
            type: 'AND',
            conditions: [
                { type: 'MAX_YEAR', value: 1994 }
            ]
        }
    },

    RPG_MONTH: {
        name: 'RPG Month',
        description: 'Role-playing games only',
        emoji: '⚔️', 
        color: '#8B008B',
        rules: {
            type: 'AND',
            conditions: [
                { type: 'GENRE_GROUP', value: 'RPG' }
            ]
        }
    },

    PUBLISHER_FOCUS: {
        name: 'Publisher Focus',
        description: 'Games from specific publishers only',
        emoji: '🏢',
        color: '#4682B4',
        rules: {
            type: 'OR',
            conditions: [
                { type: 'PUBLISHER_GROUP', value: 'CAPCOM' },
                { type: 'PUBLISHER_GROUP', value: 'KONAMI' }
            ]
        }
    }
};

/**
 * Rule evaluation functions
 */
export class RestrictionRuleEngine {
    /**
     * Evaluate if a game passes the restriction rules
     */
    static evaluateGame(gameData, rules) {
        if (!rules || !rules.conditions || rules.conditions.length === 0) {
            return true; // No restrictions = allow all
        }

        const results = rules.conditions.map(condition => 
            this.evaluateCondition(gameData, condition)
        );

        if (rules.type === 'OR') {
            return results.some(result => result);
        } else { // AND
            return results.every(result => result);
        }
    }

    /**
     * Evaluate a single condition
     */
    static evaluateCondition(gameData, condition) {
        switch (condition.type) {
            case 'CONSOLE_GROUP':
                return this.checkConsoleGroup(gameData, condition.value);
            
            case 'PUBLISHER_GROUP':
                return this.checkPublisherGroup(gameData, condition.value);
            
            case 'GENRE_GROUP':
                return this.checkGenreGroup(gameData, condition.value);
            
            case 'CONSOLE_ID':
                return gameData.consoleId === condition.value;
            
            case 'CONSOLE_NAME':
                return this.matchConsole(gameData.consoleName, [condition.value]);
            
            case 'PUBLISHER':
                return this.matchPublisher(gameData.publisher, [condition.value]);
            
            case 'DEVELOPER':
                return this.matchDeveloper(gameData.developer, [condition.value]);
            
            case 'GENRE':
                return this.matchGenre(gameData.genre, [condition.value]);
            
            case 'MIN_YEAR':
                return this.getGameYear(gameData) >= condition.value;
            
            case 'MAX_YEAR':
                return this.getGameYear(gameData) <= condition.value;
            
            case 'YEAR_RANGE':
                const year = this.getGameYear(gameData);
                return year >= condition.min && year <= condition.max;
            
            default:
                console.warn(`Unknown condition type: ${condition.type}`);
                return false;
        }
    }

    /**
     * Check if game matches console group
     */
    static checkConsoleGroup(gameData, groupName) {
        const group = CONSOLE_GROUPS[groupName];
        if (!group) return false;

        // Check by console ID if available
        if (group.consoleIds && gameData.consoleId) {
            if (group.consoleIds.includes(gameData.consoleId)) {
                return true;
            }
        }

        // Check by console name
        if (gameData.consoleName) {
            return this.matchConsole(gameData.consoleName, group.consoles);
        }

        return false;
    }

    /**
     * Check if game matches publisher group
     */
    static checkPublisherGroup(gameData, groupName) {
        const publishers = PUBLISHER_GROUPS[groupName];
        if (!publishers || !gameData.publisher) return false;

        return this.matchPublisher(gameData.publisher, publishers);
    }

    /**
     * Check if game matches genre group
     */
    static checkGenreGroup(gameData, groupName) {
        const group = GENRE_GROUPS[groupName];
        if (!group || !gameData.genre) return false;

        return this.matchGenre(gameData.genre, group.genres);
    }

    /**
     * Match console name against list with fuzzy matching
     */
    static matchConsole(consoleName, consoleList) {
        if (!consoleName) return false;
        
        const lowerName = consoleName.toLowerCase();
        return consoleList.some(console => 
            lowerName.includes(console.toLowerCase()) ||
            console.toLowerCase().includes(lowerName)
        );
    }

    /**
     * Match publisher with fuzzy matching
     */
    static matchPublisher(publisher, publisherList) {
        if (!publisher) return false;
        
        const lowerPublisher = publisher.toLowerCase();
        return publisherList.some(pub => 
            lowerPublisher.includes(pub.toLowerCase()) ||
            pub.toLowerCase().includes(lowerPublisher)
        );
    }

    /**
     * Match developer with fuzzy matching
     */
    static matchDeveloper(developer, developerList) {
        if (!developer) return false;
        
        const lowerDeveloper = developer.toLowerCase();
        return developerList.some(dev => 
            lowerDeveloper.includes(dev.toLowerCase()) ||
            dev.toLowerCase().includes(lowerDeveloper)
        );
    }

    /**
     * Match genre with fuzzy matching
     */
    static matchGenre(genre, genreList) {
        if (!genre) return false;
        
        const lowerGenre = genre.toLowerCase();
        return genreList.some(g => 
            lowerGenre.includes(g.toLowerCase()) ||
            g.toLowerCase().includes(lowerGenre)
        );
    }

    /**
     * Extract year from game release date
     */
    static getGameYear(gameData) {
        if (!gameData.released) return null;
        
        try {
            const date = new Date(gameData.released);
            return date.getFullYear();
        } catch (error) {
            console.warn('Invalid release date:', gameData.released);
            return null;
        }
    }
}

/**
 * Helper functions for building rules
 */
export const RuleBuilder = {
    consoleGroup(groupName) {
        return { type: 'CONSOLE_GROUP', value: groupName };
    },

    publisherGroup(groupName) {
        return { type: 'PUBLISHER_GROUP', value: groupName };
    },

    genreGroup(groupName) {
        return { type: 'GENRE_GROUP', value: groupName };
    },

    consoleId(id) {
        return { type: 'CONSOLE_ID', value: id };
    },

    publisher(name) {
        return { type: 'PUBLISHER', value: name };
    },

    developer(name) {
        return { type: 'DEVELOPER', value: name };
    },

    yearRange(min, max) {
        return { type: 'YEAR_RANGE', min, max };
    },

    beforeYear(year) {
        return { type: 'MAX_YEAR', value: year };
    },

    afterYear(year) {
        return { type: 'MIN_YEAR', value: year };
    },

    and(...conditions) {
        return { type: 'AND', conditions };
    },

    or(...conditions) {
        return { type: 'OR', conditions };
    }
};
