# Select Start Discord Bot

A Discord bot for managing the Select Start gaming community's RetroAchievements monthly challenges.

## Features

- Monthly and Shadow game challenges
- Achievement tracking and announcements
- Point-based leaderboard system
- Game nomination and voting system
- User profiles and progress tracking
- Admin commands for managing games, users, and awards

## Requirements

- Node.js 16.9.0 or higher
- MongoDB 4.0 or higher
- Discord Bot Token
- RetroAchievements API Key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/select-start-bot.git
cd select-start-bot
```

2. Install dependencies:
```bash
npm install
```

3. Copy the example environment file and fill in your values:
```bash
cp .env.example .env
```

4. Configure your environment variables in the `.env` file:
- `DISCORD_TOKEN`: Your Discord bot token
- `DISCORD_CLIENT_ID`: Your Discord application client ID
- `DISCORD_GUILD_ID`: Your Discord server ID
- `ACHIEVEMENT_CHANNEL`: Channel ID for achievement announcements
- `ADMIN_ROLE_ID`: Role ID for admin permissions
- `RA_USERNAME`: Your RetroAchievements username
- `RA_API_KEY`: Your RetroAchievements API key
- `MONGODB_URI`: Your MongoDB connection string

## Usage

1. Deploy slash commands:
```bash
npm run deploy
```

2. Start the bot:
```bash
npm start
```

## Commands

### User Commands
- `/profile [username]` - View user profile and stats
- `/leaderboard [monthly|yearly]` - View current rankings
- `/games` - View current monthly and shadow games
- `/nominate <game>` - Nominate a game for next month
- `/vote <game>` - Vote for a nominated game

### Admin Commands
- `/add-game [monthly|shadow] <gameId>` - Add a new game challenge
- `/register-user <username>` - Register a RetroAchievements user
- `/remove-user <username>` - Remove a registered user
- `/update-points <username> <points>` - Manually adjust user points
- `/approve-nomination <gameId>` - Approve a game nomination
- `/reject-nomination <gameId>` - Reject a game nomination
- `/select-winners` - Select monthly and shadow games from nominations

## Point System

- Participation (1 point): Earn any achievement in a monthly or shadow game
- Beaten (3 points): Complete progression and win condition achievements
- Mastery (3 points): Earn 100% of achievements in a monthly game

## Development

The bot is structured as follows:

```
src/
├── commands/           # Discord slash commands
│   ├── admin/         # Admin-only commands
│   └── user/          # General user commands
├── config/            # Configuration files
├── models/            # MongoDB models
├── services/          # Core services
└── utils/             # Utility functions
```

### Key Components

- **Achievement Tracker**: Monitors user progress and announces achievements
- **Leaderboard Service**: Manages point calculations and rankings
- **Nomination Service**: Handles game nominations and voting
- **RetroAPI Service**: Interfaces with the RetroAchievements API

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [discord.js](https://discord.js.org/)
- [RetroAchievements](https://retroachievements.org/)
- [mongoose](https://mongoosejs.com/)

## Support

For support, join our Discord server or open an issue on GitHub.
