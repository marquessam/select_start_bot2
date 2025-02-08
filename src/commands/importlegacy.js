// File: src/commands/importlegacy.js
// ONE-TIME COMMAND: This command imports legacy nomination data into the database.
// Restrict this command to trusted users as needed.
// Once the legacy nominations are imported and verified, you can safely remove this file.

const Nomination = require('../models/Nomination');

module.exports = {
  name: 'importlegacy',
  description: 'One-time command to import legacy nomination data into the database. (Do not use again.)',
  async execute(message) {
    try {
      // OPTIONAL: Add permission checks for trusted users.
      
      // Set the legacy voteMonth value.
      const voteMonth = 'legacy';

      // Array of legacy nomination objects based on your historical data.
      const legacyNominations = [
        // PLATFORM: GB
        { platform: 'GB', gameTitle: 'Pokemon Red/Blue', nominatedBy: 'Legacy Import', voteMonth },
        // PLATFORM: GBA
        { platform: 'GBA', gameTitle: 'Pokemon Emerald', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'GBA', gameTitle: 'LOTR: Return of the King', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'GBA', gameTitle: 'Castlevania: Aria of Sorrow', nominatedBy: 'sirvaelion', voteMonth },
        { platform: 'GBA', gameTitle: "Dragon Ball Z: Buu's Fury", nominatedBy: 'royek.', voteMonth },
        // PLATFORM: GBC
        { platform: 'GBC', gameTitle: 'Pokemon Crystal Version', nominatedBy: 'sirvaelion', voteMonth },
        { platform: 'GBC', gameTitle: 'Halo: Combat Devolved', nominatedBy: 'jamie.thul', voteMonth },
        { platform: 'GBC', gameTitle: 'Pokémon Trading Card Game', nominatedBy: 'lucasthebeard', voteMonth },
        // PLATFORM: GENESIS
        { platform: 'GENESIS', gameTitle: 'Castlevania: Bloodlines', nominatedBy: 'Legacy Import', voteMonth },
        // PLATFORM: N64
        { platform: 'N64', gameTitle: 'Zelda: Ocarina of Time', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'N64', gameTitle: "Zelda: Majora's Mask", nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'N64', gameTitle: 'Banjo-Kazooie', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'N64', gameTitle: 'Star Wars Episode 1: Racer', nominatedBy: '.royalsam', voteMonth },
        // PLATFORM: NES
        { platform: 'NES', gameTitle: 'Crystalis', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'NES', gameTitle: 'Battle Kid: Fortress of Peril', nominatedBy: 'sirvaelion', voteMonth },
        { platform: 'NES', gameTitle: 'DuckTales', nominatedBy: 'royek.', voteMonth },
        { platform: 'NES', gameTitle: 'Final Fantasy VII: Advent Children', nominatedBy: 'royek.', voteMonth },
        // PLATFORM: PSX
        { platform: 'PSX', gameTitle: 'Xenogears', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Brigadine', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Mega Man Legends', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Metal Gear Solid', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Spyro the Dragon', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Castlevania: Symphony of the Night', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Glover', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Tail of the Sun', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Incredible Crisis', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Crash Team Racing', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Suikoden 2', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Harvest Moon: Back to Nature', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Croc: Legend of the Gobbos', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'PSX', gameTitle: 'Grandia', nominatedBy: 'supertelos', voteMonth },
        { platform: 'PSX', gameTitle: 'Dino Crisis', nominatedBy: 'quadrangles', voteMonth },
        // PLATFORM: SNES
        { platform: 'SNES', gameTitle: 'Act Raiser', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'SNES', gameTitle: 'Mega Man 2', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'SNES', gameTitle: 'Super Bomberman', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'SNES', gameTitle: "Harley's Humungous Adventure", nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'SNES', gameTitle: 'Donkey Kong Country', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'SNES', gameTitle: 'The Adventures of Batman & Robin', nominatedBy: 'Legacy Import', voteMonth },
        { platform: 'SNES', gameTitle: 'Megaman X', nominatedBy: '.royalsam', voteMonth },
        { platform: 'SNES', gameTitle: 'terranigna', nominatedBy: 'xelxlolox6442', voteMonth },
        { platform: 'SNES', gameTitle: 'Demons Crest', nominatedBy: 'xelxlolox6442', voteMonth },
        { platform: 'SNES', gameTitle: 'Front Mission', nominatedBy: 'supertelos', voteMonth },
        { platform: 'SNES', gameTitle: 'Super Mario RPG', nominatedBy: 'pyrend', voteMonth },
        { platform: 'SNES', gameTitle: 'Final Fantasy VI', nominatedBy: 'pyrend', voteMonth },
        { platform: 'SNES', gameTitle: 'Treasure of the Rudras', nominatedBy: 'pyrend', voteMonth },
      ];

      await Nomination.insertMany(legacyNominations);
      message.reply('Legacy nominations imported successfully. You can now remove this command.');
      console.log('Legacy nominations imported successfully.');
    } catch (error) {
      console.error('Error importing legacy nominations:', error);
      message.reply('There was an error importing legacy nominations. Check the logs for details.');
    }
  }
};
