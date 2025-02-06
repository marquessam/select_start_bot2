// File: src/utils/initializeUsers.js
const User = require('../models/User');

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
        
        // Clear existing users
        await User.deleteMany({});
        
        // Create all users
        const users = validUsers.map(username => ({
            raUsername: username,
            isActive: true
        }));

        await User.insertMany(users);
        
        const totalUsers = await User.countDocuments();
        console.log(`Initialized ${totalUsers} users successfully`);
    } catch (error) {
        console.error('Error initializing users:', error);
        throw error;
    }
}

module.exports = { initializeUsers, validUsers };
