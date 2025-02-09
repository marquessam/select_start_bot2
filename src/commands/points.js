const { EmbedBuilder } = require('discord.js');
const Award = require('../models/Award');
const { AwardType } = require('../enums/AwardType');

module.exports = {
  name: 'points',
  description: 'Manually add points (as an award) to a user’s profile',
  async execute(client, message, args) {
    // Only allow the command invoker to answer prompts.
    const filter = (m) => m.author.id === message.author.id;

    try {
      // Step 1: Ask for the RA username.
      await message.channel.send("Please enter the RA username:");
      const usernameCollected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 30000,
        errors: ["time"]
      });
      const username = usernameCollected.first().content.trim().toLowerCase();

      // Step 2: Ask for the point amount.
      await message.channel.send("Please enter the point amount:");
      const pointsCollected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 30000,
        errors: ["time"]
      });
      const pointAmount = parseInt(pointsCollected.first().content.trim(), 10);
      if (isNaN(pointAmount)) {
        return message.channel.send("Invalid point amount. Command cancelled.");
      }

      // Step 3: Ask for the reason behind adding these points.
      await message.channel.send("Please enter the reason for this points addition (e.g., 'Beta Member'):");
      const reasonCollected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 60000,
        errors: ["time"]
      });
      const reason = reasonCollected.first().content.trim();

      // Step 4: Ask for confirmation.
      const confirmEmbed = new EmbedBuilder()
        .setTitle("Confirm Points Award")
        .setDescription(
          `Please verify the following details:\n\n` +
          `Username: **${username}**\n` +
          `Points: **${pointAmount}**\n` +
          `Reason: **${reason}**\n\n` +
          `Type \`confirm\` to proceed or anything else to cancel.`
        )
        .setColor("BLUE");
      await message.channel.send({ embeds: [confirmEmbed] });

      const confirmCollected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 30000,
        errors: ["time"]
      });
      if (confirmCollected.first().content.trim().toLowerCase() !== "confirm") {
        return message.channel.send("Points addition cancelled.");
      }

      // Step 5: Create a new Award document.
      const now = new Date();
      const month = now.getMonth() + 1; // Months are zero-indexed.
      const year = now.getFullYear();

      // Here we use "manual" as the gameId to indicate a manual/other award.
      // We also repurpose the userCompletion field to hold the reason text so that
      // your profile command (which lists awards) can display it.
      // If you prefer to have a dedicated field for the reason, consider updating your Award model accordingly.
      const newAward = new Award({
        raUsername: username,
        gameId: "manual",
        month,
        year,
        award: AwardType.MANUAL || AwardType.NONE, // Use MANUAL if defined, else fallback.
        achievementCount: 0,
        totalAchievements: pointAmount,
        userCompletion: reason, // repurposed to store the reason/description.
        lastChecked: now
      });

      await newAward.save();

      await message.channel.send(`Successfully added **${pointAmount}** point(s) for **${username}** with reason: ${reason}`);
    } catch (error) {
      console.error("Error in points command:", error);
      message.channel.send("An error occurred or you ran out of time. Please try again.");
    }
  }
};
