// File: src/commands/nominations.js
const Nomination = require('../models/Nomination');

// Helper to get the current month formatted as "YYYY-MM"
function getCurrentMonth() {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

module.exports = {
  name: 'nominations',
  description: 'View your nominations for the current month.',
  async execute(message) {
    try {
      const currentMonth = getCurrentMonth();
      const userId = message.author.id;
      const nominations = await Nomination.find({ userId, voteMonth: currentMonth });
      
      if (!nominations || nominations.length === 0) {
        return message.reply('You have not nominated any games for this month.');
      }
      
      let output = `**Your Nominations for ${currentMonth}:**\n\n`;
      nominations.forEach((nom, index) => {
        output += `${index + 1}. ${nom.gameTitle}`;
        if (nom.platform) output += ` (Platform: ${nom.platform})`;
        output += ` (Nominated by: ${nom.nominatedBy})\n`;
      });
      message.channel.send(output);
    } catch (error) {
      console.error('Error fetching nominations:', error);
      message.reply('There was an error retrieving your nominations. Please try again later.');
    }
  }
};
