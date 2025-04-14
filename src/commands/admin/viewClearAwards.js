async viewUserAwards(interaction) {
    const username = interaction.options.getString('username');
    
    // Find the user
    const user = await User.findOne({ raUsername: username });
    if (!user) {
        return interaction.editReply('User not found');
    }
    
    // Display all awards
    if (user.communityAwards.length === 0) {
        return interaction.editReply('This user has no awards');
    }
    
    let response = `Awards for ${username}:\n\n`;
    user.communityAwards.forEach((award, index) => {
        response += `${index + 1}. "${award.title}" (${award.points} points) - Awarded by ${award.awardedBy} on ${award.awardedAt.toLocaleDateString()}\n`;
    });
    
    return interaction.editReply(response);
}

async clearUserAward(interaction) {
    const username = interaction.options.getString('username');
    const awardIndex = interaction.options.getInteger('index') - 1; // Convert to 0-based
    
    // Find the user
    const user = await User.findOne({ raUsername: username });
    if (!user) {
        return interaction.editReply('User not found');
    }
    
    // Check if award exists
    if (!user.communityAwards[awardIndex]) {
        return interaction.editReply('Award not found');
    }
    
    // Store award info for confirmation
    const awardTitle = user.communityAwards[awardIndex].title;
    
    // Remove the award
    user.communityAwards.splice(awardIndex, 1);
    await user.save();
    
    return interaction.editReply(`Removed award "${awardTitle}" from ${username}`);
}
