// File: src/commands/nominate.js
const { MessageCollector, EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const Nomination = require('../models/Nomination');
const moment = require('moment'); // For formatting date/month

const MAX_NOMINATIONS_PER_MONTH = 3;
const CANDIDATE_COUNT = 5; // Number of fuzzy search candidates to show
const RESPONSE_TIMEOUT = 60000; // 60 seconds

module.exports = {
  name: 'nominate',
  description: 'Nominate a new game for the monthly vote. Limit: 3 nominations per month. The command searches for the game and returns a fuzzy list of options for you to choose from.',
  async execute(message, args) {
    try {
      // Ensure nomination text is provided
      if (!args.length) {
        return message.reply('Please provide the game name you want to nominate.');
      }
      
      const nominationQuery = args.join(' ');
      const userId = message.author.id;
      const currentMonth = moment().format('YYYY-MM');
      
      // Check if the user has already reached the nomination limit for this month
      const existingNominations = await Nomination.find({ userId, voteMonth: currentMonth });
      if (existingNominations.length >= MAX_NOMINATIONS_PER_MONTH) {
        return message.reply(`You have already nominated ${MAX_NOMINATIONS_PER_MONTH} game(s) this month. Please try again next month.`);
      }
      
      // Search the RetroAchievements API for the given nomination query
      const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
      const searchResults = await raAPI.getGameList(nominationQuery);
      
      if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
        return message.reply('No games found matching your query. Please try a different game name.');
      }
      
      // Fuzzy filter: We'll take the top CANDIDATE_COUNT results.
      const candidates = searchResults.slice(0, CANDIDATE_COUNT);
      
      // Prepare an embed message to display the candidate list
      let description = 'Please choose the correct game by typing the corresponding number (1-' + candidates.length + '):\n\n';
      candidates.forEach((game, index) => {
        // Assuming the API returns game objects with ID and Title fields.
        description += `**${index + 1}.** ${game.Title} (ID: ${game.ID})\n`;
      });
      
      const embed = new EmbedBuilder()
        .setTitle('Nomination Candidates')
        .setDescription(description)
        .setFooter({ text: 'Please enter your choice within 60 seconds.' })
        .setColor('#0099ff');
      
      await message.channel.send({ embeds: [embed] });
      
      // Create a message collector for the user's response.
      const filter = m => m.author.id === message.author.id;
      const collector = new MessageCollector(message.channel, { filter, time: RESPONSE_TIMEOUT, max: 1 });
      
      collector.on('collect', async collected => {
        const response = collected.content.trim();
        const choice = parseInt(response, 10);
        if (isNaN(choice) || choice < 1 || choice > candidates.length) {
          message.reply('Invalid selection. Nomination cancelled. Please try again.');
          return;
        }
        
        const selectedGame = candidates[choice - 1];
        
        // Save nomination to database
        const nomination = new Nomination({
          userId,
          gameTitle: selectedGame.Title,
          gameId: selectedGame.ID,
          voteMonth: currentMonth
        });
        
        try {
          await nomination.save();
          message.reply(`Your nomination for **${selectedGame.Title}** has been recorded. Thank you!`);
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
