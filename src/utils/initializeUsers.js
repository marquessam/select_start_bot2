// File: src/utils/initializeUsers.js
const User = require('../models/User');
const { cleanupDatabase } = require('./cleanupDatabase');

const validUsers = [
    "SirVaelion", "jvmunduruca", "xelxlolox", "EmsiRG", "Dangeel",
    "hyperlincs", "BlackZWolf", "punchdrunkpengin", "Shigarui", "RuySan",
    "LucasTheBeard", "royek", "NiterZ7", "thardwardy", "nxsnexus",
    "Newtim", "R3dEagle", "JRevo", "MuttonchopMac", "joebobdead",
    "zckttck", "tragicnostalgic", "Magus508", "ShminalShmantasy", "lowaims",
    "ParanoidPunky", "Audex", "Xsiverx", "Marquessam", "Dest404",
    "wastelanderone", "Lyubphim", "DearYou"
];

async function initializeUsers() {
    try {
        console.log('Starting user initialization...');
        
        // First, remove ALL existing users
        await User.deleteMany({});
        console.log('Cleared existing users');
        
        // Create new users
        const userPromises = validUsers.map(username => {
            return User.findOneAndUpdate(
                { raUsername: { $regex: new RegExp(`^${username}$`, 'i') } },
                { 
                    raUsername: username,  // Keep original case
                    isActive: true 
                },
                { upsert: true }
            );
        });

        await Promise.all(userPromises);
        
        const totalUsers = await User.countDocuments();
        console.log(`Initialized ${totalUsers} users successfully`);
    } catch (error) {
        console.error('Error initializing users:', error);
        throw error;
    }
}

module.exports = { initializeUsers, validUsers };
