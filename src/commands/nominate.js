// File: src/commands/nominate.js
const { MessageCollector, EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const Nomination = require('../models/Nomination');

// Maximum nominations allowed for the current month per user
const MAX_NOMINATIONS_PER_MONTH = 3;
// Number of fuzzy search candidates to show
const CANDIDATE_COUNT = 5;
// Time (milliseconds) to wait for a response to choose a candidate
const RESPONSE_TIMEOUT = 60000;

// Helper to get the current month formatted as "YYYY-MM"
function getCurrentMonth() {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

module.exports = {
  name: 'nominate',
  description: 'Nominate a new game for the monthly vote. Limit: 3 nominations per month. Also displays your current nominations if no game is provided.',
  async execute(message, args) {
    try {
      const currentMonth = getCurrentMonth();
      const userId = message.author.id;

      // If no nomination query is provided, display the current nominations
      if (!args.length) {
        // You could instruct users to use !nominations as well, but here we just show them.
        const nominations = await Nomination.find({ userId, voteMonth: currentMonth });
        if (nominations.length === 0) {
          return message.reply('You have not nominated any games for this month yet. Use `!nominate <game name>` to nominate a game.');
        }
        let output = `**Your Nominations for ${currentMonth}:**\n\n`;
        nominations.forEach((nom, index) => {
          output += `${index + 1}. ${nom.gameTitle}`;
          if (nom.platform) output += ` (Platform: ${nom.platform})`;
          output += `\n`;
        });
        return message.channel.send(output);
      }
      
      // Check if nomination limit is reached for the month.
      const existingNominations = await Nomination.find({ userId, voteMonth: currentMonth });
      if (existingNominations.length >= MAX_NOMINATIONS_PER_MONTH) {
        return message.reply(`You have already nominated ${MAX_NOMINATIONS_PER_MONTH} game(s) this month. You cannot nominate more until next month.`);
      }
      
      const nominationQuery = args.join(' ');
      
      // Search the RetroAchievements API for the nomination query
      const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
      const searchResults = await raAPI.getGameList(nominationQuery);
      
      if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
        return message.reply('No games found matching your query. Please try a different game name.');
      }
      
      // Take the top few candidates for the fuzzy list.
      const candidates = searchResults.slice(0, CANDIDATE_COUNT);
      
      // Build an embed message showing the candidate list.
      let description = 'Please choose the correct game by typing the corresponding number (1-' + candidates.length + '):\n\n';
      candidates.forEach((game, index) => {
        // Assuming the API returns game objects with Title and ID fields.
        description += `**${index + 1}.** ${game.Title} (ID: ${game.ID})\n`;
      });
      
      const embed = new EmbedBuilder()
        .setTitle('Nomination Candidates')
        .setDescription(description)
        .setFooter({ text: 'Enter your choice within 60 seconds.' })
        .setColor('#0099ff');
      
      await message.channel.send({ embeds: [embed] });
      
      // Wait for the user's response using a message collector
      const filter = m => m.author.id === message.author.id;
      const collector = new MessageCollector(message.channel, { filter, time: RESPONSE_TIMEOUT, max: 1 });
      
      collector.on('collect', async collected => {
        const response = collected.content.trim();
        const choice = parseInt(response, 10);
        if (isNaN(choice) || choice < 1 || choice > candidates.length) {
          return message.reply('Invalid selection. Nomination cancelled. Please try again.');
        }
        
        const selectedGame = candidates[choice - 1];
        
        // Save nomination to the database
        const nomination = new Nomination({
          userId,
          gameTitle: selectedGame.Title,
          gameId: selectedGame.ID,
          // Platform can be set later via an admin command, if needed.
          voteMonth: currentMonth,
          nominatedBy: message.author.username
        });
        
        try {
          await nomination.save();
          message.reply(`Your nomination for **${selectedGame.Title}** has been recorded for ${currentMonth}. Thank you!`);
        } catch (err) {
          console.error('Error saving nomination:', err);
          message.reply('There was an error saving your nomination. Please try again later.');
        }
      });
      
      collector.on('end', collected => {
        if (collected.size === 0) {
          message.reply('No response received. Nomination cancelled.');
        }
      });
      
    } catch (error) {
      console.error('Nomination command error:', error);
      message.reply('There was an error processing your nomination. Please try again later.');
    }
  }
};
