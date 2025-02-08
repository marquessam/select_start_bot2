// File: src/commands/nominations.js
const Nomination = require('../models/Nomination');

// Helper to split a message into chunks that are less than 2000 chars (Discord's limit)
function splitMessage(text, max = 2000) {
  const messages = [];
  let start = 0;
  while (start < text.length) {
    messages.push(text.slice(start, start + max));
    start += max;
  }
  return messages;
}

module.exports = {
  name: 'nominations',
  description: 'View the entire nomination list. This displays all nominations over time. Each nomination shows the game title, platform (if provided), who nominated it, and the vote month.',
  async execute(message) {
    try {
      // Fetch all nominations sorted in ascending order by date nominated.
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

      // Discord messages are limited to 2000 characters.
      const chunks = splitMessage(output, 2000);
      for (const chunk of chunks) {
        await message.channel.send(chunk);
      }
    } catch (error) {
      console.error('Error fetching nominations:', error);
      return message.reply('There was an error retrieving the nomination list. Please try again later.');
    }
  }
};
