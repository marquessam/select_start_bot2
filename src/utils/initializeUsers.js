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
        
        // Create bulk operations array
        const operations = validUsers.map(username => ({
            updateOne: {
                filter: { raUsername: username },
                update: { $setOnInsert: { raUsername: username, isActive: true } },
                upsert: true
            }
        }));

        // Execute bulk operations
        const result = await User.bulkWrite(operations);
        
        console.log('User initialization complete!');
        console.log(`Matched: ${result.matchedCount}`);
        console.log(`Modified: ${result.modifiedCount}`);
        console.log(`Upserted: ${result.upsertedCount}`);
    } catch (error) {
        console.error('Error initializing users:', error);
        throw error;
    }
}

module.exports = { initializeUsers, validUsers };
