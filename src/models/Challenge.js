import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
    date: {
        type: Date,
        unique: true,
        required: true
    },
    monthly_challange_gameid: {
        type: String,
        required: true
    },
    monthly_challange_achievement_ids: {
        type: [String],
        required: true,
        default: []
    },
    monthly_challange_game_total: {
        type: Number,
        required: true
    },
    monthly_challange_progression_achievements: {
        type: [String],
        required: false,
        default: []
    },
    monthly_challange_win_achievements: {
        type: [String],
        required: false,
        default: []
    },
    shadow_challange_gameid: {
        type: String,
        required: false
    },
    shadow_challange_achievement_ids: {
        type: [String],
        required: false,
        default: []
    },
    shadow_challange_game_total: {
        type: Number,
        required: false
    },
    shadow_challange_progression_achievements: {
        type: [String],
        required: false,
        default: []
    },
    shadow_challange_win_achievements: {
        type: [String],
        required: false,
        default: []
    },
    shadow_challange_revealed: {
        type: Boolean,
        required: true
    },
    // New fields for storing game metadata
    monthly_game_title: {
        type: String
    },
    monthly_game_icon_url: {
        type: String
    },
    monthly_game_console: {
        type: String
    },
    shadow_game_title: {
        type: String
    },
    shadow_game_icon_url: {
        type: String
    },
    shadow_game_console: {
        type: String
    }
});

// Add method to check if shadow game is revealed
challengeSchema.methods.isShadowGameRevealed = function() {
    return this.shadow_challange_revealed === true;
};

// Add methods for game status checks
challengeSchema.methods.isCurrentGame = function() {
    const now = new Date();
    const challengeMonth = this.date.getMonth();
    const challengeYear = this.date.getFullYear();
    return challengeMonth === now.getMonth() && challengeYear === now.getFullYear();
};

// New method to update game metadata
challengeSchema.methods.updateGameMetadata = async function(retroAPI) {
    try {
        // Update monthly game metadata
        if (this.monthly_challange_gameid) {
            const gameInfo = await retroAPI.getGameInfo(this.monthly_challange_gameid);
            if (gameInfo) {
                this.monthly_game_title = gameInfo.title;
                this.monthly_game_icon_url = gameInfo.imageIcon;
                this.monthly_game_console = gameInfo.consoleName;
            }
        }

        // Update shadow game metadata if revealed
        if (this.shadow_challange_gameid && this.shadow_challange_revealed) {
            const shadowGameInfo = await retroAPI.getGameInfo(this.shadow_challange_gameid);
            if (shadowGameInfo) {
                this.shadow_game_title = shadowGameInfo.title;
                this.shadow_game_icon_url = shadowGameInfo.imageIcon;
                this.shadow_game_console = shadowGameInfo.consoleName;
            }
        }
        
        await this.save();
        return true;
    } catch (error) {
        console.error('Error updating game metadata:', error);
        return false;
    }
};

// The date field is already indexed due to unique: true

export const Challenge = mongoose.model('Challenge', challengeSchema);
export default Challenge;
