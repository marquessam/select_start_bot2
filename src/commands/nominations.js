// File: src/commands/nominations.js
const Nomination = require('../models/Nomination');

module.exports = {
  name: 'nominations',
  description: 'View the entire nomination list (all history). Each nomination shows the game title, platform (if provided), who nominated it, and the vote month.',
  async execute(message) {
    try {
      // Fetch all nominations sorted by date of nomination in ascending order.
      const nominations = await Nomination.find({}).sort({ dateNominated: 1 });
      
      if (!nominations || nominations.length === 0) {
        return message.reply('There are no nominations in the list yet.');
      }
      
      let output = '**Entire Nomination List:**\n\n';
      nominations.forEach((nom, index) => {
        output += `${index + 1}. ${nom.gameTitle}`;
        if (nom.platform) {
          output += ` (Platform: ${nom.platform})`;
        }
        if (nom.nominatedBy) {
          output += ` - Nominated by: ${nom.nominatedBy}`;
        }
        if (nom.voteMonth) {
          output += ` [${nom.voteMonth}]`;
        }
        output += '\n';
      });
      
      return message.channel.send(output);
    } catch (error) {
      console.error('Error fetching nominations:', error);
      return message.reply('There was an error retrieving the nomination list. Please try again later.');
    }
  }
};
