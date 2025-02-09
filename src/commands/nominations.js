// File: src/commands/nominations.js
const { EmbedBuilder } = require('discord.js');
const Nomination = require('../models/Nomination');

/**
 * Splits a text string into chunks that are each no longer than maxLength.
 * Splitting is done on newline boundaries.
 * @param {string} text - The text to split.
 * @param {number} maxLength - The maximum length per chunk.
 * @returns {string[]} - An array of text chunks.
 */
function splitIntoChunks(text, maxLength = 1024) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = '';
  for (const line of lines) {
    // +1 accounts for the newline character.
    if (currentChunk.length + line.length + 1 > maxLength) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n' + line : line;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

module.exports = {
  name: 'nominations',
  description: 'View the entire nomination list organized by platform. Each nomination shows the game title, nominated by, and the vote month.',
  async execute(message) {
    try {
      // Fetch all nominations sorted in ascending order by date nominated.
      const nominations = await Nomination.find({}).sort({ dateNominated: 1 });

      if (!nominations || nominations.length === 0) {
        return message.reply('There are no nominations in the list yet.');
      }

      // Group nominations by platform (normalized to lowercase)
      const groups = {};
      nominations.forEach((nom, index) => {
        const platform = nom.platform ? nom.platform.toLowerCase() : 'unknown';
        if (!groups[platform]) groups[platform] = [];
        // Build a line for this nomination.
        let line = `${index + 1}. ${nom.gameTitle} - nominated by: ${nom.nominatedBy}`;
        if (nom.voteMonth) {
          line += ` [${nom.voteMonth}]`;
        }
        groups[platform].push(line);
      });

      // Build embed fields for each platform group.
      const fields = [];
      for (const platform in groups) {
        // Combine the lines for the platform group.
        const text = groups[platform].join('\n');
        // Split the text into chunks if it exceeds Discord's 1024-character limit.
        const chunks = splitIntoChunks(text, 1013); // 1013 + code block markers ~1024
        chunks.forEach((chunk, idx) => {
          const fieldName = idx === 0 ? platform : `${platform} (Part ${idx + 1})`;
          fields.push({ name: fieldName, value: '```ml\n' + chunk + '\n```' });
        });
      }

      // Create the embed.
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Nomination List')
        .setDescription('All nominations organized by platform')
        .setTimestamp();

      if (fields.length > 0) {
        embed.addFields(fields);
      }

      // Send the embed.
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching nominations:', error);
      return message.reply('There was an error retrieving the nomination list. Please try again later.');
    }
  }
};
