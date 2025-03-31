#!/usr/bin/env node
import { connect } from 'mongoose';
import { Challenge } from '../models/Challenge.js';
import retroAPI from '../services/retroAPI.js';
import { config } from '../config/config.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await connect(config.mongodb.uri);
    console.log('MongoDB Connected');
    return true;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    return false;
  }
};

const createHistoricalChallenge = async (year, month, gameId, progressionAchievements, winAchievements, shadowGameId, shadowProgressionAchievements, shadowWinAchievements) => {
  try {
    // Format date for first day of the month
    const challengeDate = new Date(year, month - 1, 1);
    
    // Check if challenge already exists for this month
    const existingChallenge = await Challenge.findOne({
      date: {
        $gte: challengeDate,
        $lt: new Date(year, month, 1) // First day of next month
      }
    });

    if (existingChallenge) {
      console.log(`Challenge already exists for ${month}/${year}. Skipping.`);
      return false;
    }

    // Get main game info
    const gameInfo = await retroAPI.getGameInfoExtended(gameId);
    if (!gameInfo) {
      console.error(`Game ID ${gameId} not found. Skipping.`);
      return false;
    }
    
    // Get total achievements for main game
    const mainTotalAchievements = Object.keys(gameInfo.achievements).length;
    
    // Create shadow game variables
    let shadowTotalAchievements = 0;
    let shadowGameRevealed = true; // Historical shadow games should be revealed
    
    // If shadow game exists, get its info
    if (shadowGameId) {
      try {
        const shadowGameInfo = await retroAPI.getGameInfoExtended(shadowGameId);
        if (shadowGameInfo) {
          shadowTotalAchievements = Object.keys(shadowGameInfo.achievements).length;
        } else {
          console.warn(`Shadow game ID ${shadowGameId} not found. Shadow game will be incomplete.`);
        }
      } catch (error) {
        console.error(`Error fetching shadow game info: ${error.message}`);
      }
    }

    // Create the challenge
    const challenge = new Challenge({
      date: challengeDate,
      monthly_challange_gameid: gameId,
      monthly_challange_progression_achievements: progressionAchievements,
      monthly_challange_win_achievements: winAchievements,
      monthly_challange_game_total: mainTotalAchievements,
      shadow_challange_gameid: shadowGameId || null,
      shadow_challange_progression_achievements: shadowProgressionAchievements || [],
      shadow_challange_win_achievements: shadowWinAchievements || [],
      shadow_challange_game_total: shadowTotalAchievements,
      shadow_challange_revealed: shadowGameRevealed
    });

    await challenge.save();
    console.log(`Challenge created for ${month}/${year}: ${gameInfo.title}`);
    
    if (shadowGameId) {
      console.log(`Shadow challenge for ${month}/${year}: Game ID ${shadowGameId}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error creating challenge for ${month}/${year}: ${error.message}`);
    return false;
  }
};

// Main function
const importHistoricalChallenges = async () => {
  // Connect to the database
  const connected = await connectDB();
  if (!connected) {
    process.exit(1);
  }

  console.log('Starting import of historical challenges...');
  
  // January 2025
  await createHistoricalChallenge(
    2025, 1, // Year, Month
    319, // Chrono Trigger
    [2080, 2081, 2085, 2090, 2191, 2100, 2108, 2129, 2133], // Progression
    [2266, 2281], // Win Condition
    10024, // Shadow Game: Mario Tennis
    [], // Shadow Progression (empty array - you may need to fill this)
    [48411, 48412] // Shadow Win Condition
  );
  
  // February 2025
  await createHistoricalChallenge(
    2025, 2, // Year, Month
    355, // A Link to the Past
    [944, 2192, 2282, 980, 2288, 2291, 2292, 2296, 2315, 2336, 2351, 2357, 2359, 2361, 2365, 2334, 2354, 2368, 2350, 2372, 2387], // Progression
    [2389], // Win Condition
    274, // Shadow Game: UN Squadron
    [6413, 6414, 6415, 6416, 6417, 6418, 6419, 6420, 6421], // Shadow Progression
    [6422] // Shadow Win Condition
  );
  
  console.log('Import completed.');
  process.exit(0);
};

// Run the import
importHistoricalChallenges();
