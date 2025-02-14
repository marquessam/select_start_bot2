import { PermissionFlagsBits } from 'discord.js';
import { config } from '../config/config.js';

/**
 * Check if a user has admin permissions
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} Whether the user has admin permissions
 */
export const isAdmin = (member) => {
    // Check for admin role
    if (config.bot.roles.admin && member.roles.cache.has(config.bot.roles.admin)) {
        return true;
    }

    // Check for Discord administrator permission
    return member.permissions.has(PermissionFlagsBits.Administrator);
};

/**
 * Check if a user can manage nominations
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} Whether the user can manage nominations
 */
export const canManageNominations = (member) => {
    return isAdmin(member);
};

/**
 * Check if a user can manage games
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} Whether the user can manage games
 */
export const canManageGames = (member) => {
    return isAdmin(member);
};

/**
 * Check if a user can manage users
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} Whether the user can manage users
 */
export const canManageUsers = (member) => {
    return isAdmin(member);
};

/**
 * Check if a user can manage awards
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} Whether the user can manage awards
 */
export const canManageAwards = (member) => {
    return isAdmin(member);
};

export default {
    isAdmin,
    canManageNominations,
    canManageGames,
    canManageUsers,
    canManageAwards
};
