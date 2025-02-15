import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';
import { Game, User } from '../../models/index.js';
import { createErrorEmbed, createSuccessEmbed } from '../../utils/index.js';
import { canManageGames } from '../../utils/permissions.js';
import { getCurrentPeriod } from '../../utils/dateUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shadow-meta')
        .setDescription('Manage shadow game meta features')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up shadow game meta for the month')
                .addStringOption(option =>
                    option.setName('pieces')
                        .setDescription('Comma-separated list of piece identifiers')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description of the meta challenge')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('award-piece')
                .setDescription('Award a meta piece to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Discord user to award the piece to')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('piece')
                        .setDescription('Piece identifier')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check shadow game meta status')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Discord user to check (optional)')
                        .setRequired(false))),

    async execute(interaction) {
        try {
            // Check permissions
            if (!canManageGames(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed(
                        'Permission Denied',
                        'You do not have permission to manage shadow game meta.'
                    )],
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();
            const { month, year } = getCurrentPeriod();
            const monthKey = `${year}-${month.toString().padStart(2, '0')}`;

            switch (subcommand) {
                case 'setup': {
                    // Get current shadow game
                    const shadowGame = await Game.findOne({
                        type: 'SHADOW',
                        month,
                        year,
                        active: true
                    });

                    if (!shadowGame) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(
                                'No Shadow Game',
                                'There is no active shadow game for this month.'
                            )]
                        });
                    }

                    const pieces = interaction.options.getString('pieces').split(',').map(p => p.trim());
                    const description = interaction.options.getString('description');

                    // Store meta info in the game document
                    shadowGame.meta = {
                        pieces,
                        description,
                        revealed: false
                    };
                    await shadowGame.save();

                    const embed = createSuccessEmbed(
                        'Shadow Meta Setup',
                        'Successfully set up shadow game meta challenge'
                    );

                    embed.addFields(
                        { name: 'Required Pieces', value: pieces.join('\n'), inline: false },
                        { name: 'Description', value: description, inline: false }
                    );

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'award-piece': {
                    const discordUser = interaction.options.getUser('user');
                    const piece = interaction.options.getString('piece');

                    const user = await User.findOne({ discordId: discordUser.id });
                    if (!user) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(
                                'User Not Found',
                                'This Discord user is not registered.'
                            )]
                        });
                    }

                    // Get current shadow game
                    const shadowGame = await Game.findOne({
                        type: 'SHADOW',
                        month,
                        year,
                        active: true
                    });

                    if (!shadowGame?.meta?.pieces?.includes(piece)) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(
                                'Invalid Piece',
                                'This piece is not part of the current shadow game meta.'
                            )]
                        });
                    }

                    // Add piece to user's collection
                    const progress = user.shadowGameProgress.get(monthKey) || { pieces: [], completed: false };
                    if (!progress.pieces.includes(piece)) {
                        progress.pieces.push(piece);
                        
                        // Check if all pieces collected
                        if (progress.pieces.length === shadowGame.meta.pieces.length) {
                            progress.completed = true;
                            shadowGame.meta.revealed = true;
                            await shadowGame.save();
                        }

                        user.shadowGameProgress.set(monthKey, progress);
                        await user.save();
                    }

                    const embed = createSuccessEmbed(
                        'Piece Awarded',
                        `Successfully awarded piece "${piece}" to ${user.raUsername}`
                    );

                    if (progress.completed) {
                        embed.addFields({
                            name: '🎉 Challenge Completed!',
                            value: 'All pieces have been collected! The shadow game is now revealed.',
                            inline: false
                        });
                    } else {
                        embed.addFields({
                            name: 'Progress',
                            value: `${progress.pieces.length}/${shadowGame.meta.pieces.length} pieces collected`,
                            inline: false
                        });
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'status': {
                    const discordUser = interaction.options.getUser('user');
                    const shadowGame = await Game.findOne({
                        type: 'SHADOW',
                        month,
                        year,
                        active: true
                    });

                    if (!shadowGame?.meta) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(
                                'No Meta Challenge',
                                'There is no meta challenge set up for this month.'
                            )]
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#9932cc')
                        .setTitle('🎭 Shadow Game Meta Status')
                        .setDescription(shadowGame.meta.description)
                        .setTimestamp();

                    if (discordUser) {
                        // Show specific user's progress
                        const user = await User.findOne({ discordId: discordUser.id });
                        if (!user) {
                            return interaction.editReply({
                                embeds: [createErrorEmbed(
                                    'User Not Found',
                                    'This Discord user is not registered.'
                                )]
                            });
                        }

                        const progress = user.shadowGameProgress.get(monthKey) || { pieces: [], completed: false };
                        
                        embed.addFields(
                            { 
                                name: `${user.raUsername}'s Progress`,
                                value: `Collected ${progress.pieces.length}/${shadowGame.meta.pieces.length} pieces:\n` +
                                    shadowGame.meta.pieces.map(piece => 
                                        `${progress.pieces.includes(piece) ? '✅' : '❌'} ${piece}`
                                    ).join('\n'),
                                inline: false 
                            }
                        );
                    } else {
                        // Show overall status
                        embed.addFields(
                            { 
                                name: 'Required Pieces',
                                value: shadowGame.meta.pieces.join('\n'),
                                inline: false 
                            },
                            {
                                name: 'Status',
                                value: shadowGame.meta.revealed ? '🔓 Revealed' : '🔒 Hidden',
                                inline: true
                            }
                        );
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }
            }
        } catch (error) {
            console.error('Error executing shadow-meta command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while managing shadow game meta. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
