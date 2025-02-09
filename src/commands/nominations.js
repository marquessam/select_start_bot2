// File: src/commands/nominations.js
const { EmbedBuilder } = require('discord.js');
const Nomination = require('../models/Nomination');

// Mapping for platform shorthand to full names.
const platformNames = {
  'gb': 'Gameboy',
  'gbc': 'Gameboy Color',
  'snes': 'Super Nintendo',
  'nes': 'Nintendo Entertainment System',
  'n64': 'Nintendo 64',
  'ps': 'PlayStation',
  'ps2': 'PlayStation 2',
  'xbox': 'Xbox',
  'wii': 'Wii',
  'ds': 'Nintendo DS'
  // Add other mappings as needed.
};

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
  description: 'View the entire nomination list organized by full platform names. Each nomination shows the game title and the nominator in two columns.',
  async execute(message) {
    try {
      // Fetch all nominations sorted in ascending order by date nominated.
      const nominations = await Nomination.find({}).sort({ dateNominated: 1 });

      if (!nominations || nominations.length === 0) {
        return message.reply('There are no nominations in the list yet.');
      }

      // Group nominations by platform full name.
      const groups = {};
      nominations.forEach(nom => {
        let platformRaw = nom.platform ? nom.platform.toLowerCase() : 'unknown';
        // Get full platform name; if not found, use the raw value.
        const platformFull = platformNames[platformRaw] || platformRaw;
        if (!groups[platformFull]) groups[platformFull] = [];
        // Build a row with two columns: game title and nominated by.
        // We assume nom.nominatedBy exists; if not, it can be left blank.
        groups[platformFull].push({
          gameTitle: nom.gameTitle,
          nominatedBy: nom.nominatedBy || ''
        });
      });

      // Build embed fields for each platform group.
      const fields = [];
      for (const platform in groups) {
        // For each platform, build a table with two columns.
        const rows = groups[platform];
        // Determine maximum length for game titles for alignment.
        const maxTitleLength = Math.max(...rows.map(r => r.gameTitle.length));
        // Build table rows: left column is game title padded to maxTitleLength, right column is nominator.
        const lines = rows.map(row => {
          return row.gameTitle.padEnd(maxTitleLength, ' ') + '   ' + row.nominatedBy;
        });
        const text = lines.join('\n');
        // Split the text into chunks if necessary.
        const chunks = splitIntoChunks(text, 1013); // 1013 + code block markers ≈ 1024 chars
        chunks.forEach((chunk, idx) => {
          const fieldName = idx === 0 ? platform : `${platform} (Part ${idx + 1})`;
          fields.push({ name: fieldName, value: '```ml\n' + chunk + '\n```' });
        });
      }

      // Create the embed.
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Nomination List')
        .setDescription('All nominations organized by platform (full names)')
        .setTimestamp();

      if (fields.length > 0) {
        embed.addFields(fields);
      }

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching nominations:', error);
      return message.reply('There was an error retrieving the nomination list. Please try again later.');
    }
  }
};
