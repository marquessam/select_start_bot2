# Select Start Discord Bot

A Discord bot for managing monthly RetroAchievements challenges, tracking user progress, and maintaining leaderboards.

## Features

### Challenge Management
- Monthly challenges with configurable achievement goals
- Hidden "shadow" challenges for extra engagement
- Automatic leaderboard updates
- Achievement progress tracking and announcements

### User Management
- User registration linking Discord and RetroAchievements accounts
- Profile display with challenge history and awards
- Game nomination system for future challenges

### Automated Systems
- Regular stats updates (every 30 minutes)
- Achievement feed announcements (every 15 minutes)
- Monthly nomination clearing and voting poll creation

## Commands

### Admin Commands
- `/createchallenge` - Create a new monthly challenge
- `/addshadow` - Add a shadow challenge to the current month
- `/toggleshadow` - Toggle the visibility of the current shadow challenge
- `/register` - Register a new user (Discord ID + RA ID)
- `/unregister` - Unregister a user from the system
- `/giveaward` - Give a community award to a user
- `/forceupdate` - Force an immediate update of all user stats and leaderboards
- `/startvoting` - Start a voting poll for next month's challenge

### User Commands
- `/profile` - Display user profile and achievements
- `/nominate` - Nominate a game for the next monthly challenge (max 2 per month)
- `/nominations` - Show all current nominations for the next monthly challenge
- `/leaderboard` - Display the current challenge leaderboard
- `/yearlyboard` - Display the yearly leaderboard

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `sample.env` to `.env` and fill in your configuration values:
   ```
   cp sample.env .env
   ```
4. Start MongoDB (not necessary if you're running on a server that already has a db):
   ```
   ./start_mongodb.sh
   ```
5. Deploy slash commands:
   ```
   node src/deploy-commands.js
   ```
6. Start the bot:
   ```
   node src/index.js
   ```

## Database Maintenance

The application includes a database maintenance script that can be used to check the database status, fix inconsistencies, and perform other maintenance tasks:

```
node src/scripts/dbMaintenance.js [command]
```

Available commands:
- `stats` - Show database statistics (default)
- `fix-date-keys` - Fix inconsistent date keys in user challenge records
- `check-orphaned` - Check for orphaned challenge entries
- `all` - Run all maintenance tasks

## Environment Variables

See `sample.env` for all required and optional environment variables.

## Services

- **Stats Update Service**: Updates user progress in the db at a set interval
- **Achievement Feed Service**: Announces when users earn awards
- **Monthly Tasks Service**: Handles monthly nominations clearing and voting poll creation
- **RetroAPI Service**: Provides access to RetroAchievements API with rate limiting (1 request per second)

## License

MIT
