## Select Start Discord Bot

A Discord bot for managing monthly RetroAchievements challenges, tracking user progress, and maintaining leaderboards.

-----

## 1\. Overview

The Select Start Discord Bot is a comprehensive bot designed to manage a gaming community centered around RetroAchievements. It facilitates monthly gaming challenges, tracks user progress, manages various leaderboards (arcade, racing, yearly), and includes several engagement features like a voting system for game nominations, a suggestion system, an arena for player-vs-player challenges, and a gacha collectibles system. The bot integrates heavily with the RetroAchievements API to fetch game and user data. It uses MongoDB for persistent storage.

-----

## 2\. Directory Structure

```
src/
├── commands/         # Slash command definitions
│   ├── admin/        # Admin-specific commands
│   └── user/         # User-accessible commands
├── config/           # Configuration files (bot settings, API keys, emojis)
├── handlers/         # Interaction handlers (buttons, modals, select menus)
├── models/           # Mongoose schemas for database
├── services/         # Business logic and external API interactions
├── utils/            # Utility functions and helper classes
├── scripts/          # Database maintenance and utility scripts
├── deploy-commands.js # Script to register slash commands with Discord
└── index.js          # Main bot entry point
```

-----

## 3\. Key Components/Modules

### Commands (`src/commands`)

Slash commands are organized into `admin` and `user` subdirectories. Each command file typically exports an object with:

  * `data`: A `SlashCommandBuilder` instance defining the command's name, description, options, and permissions.
  * `execute(interaction)`: An async function that handles the command logic.
  * Optional handlers for buttons, select menus, or modals specific to that command (e.g., `handleButtonInteraction`, `handleModalSubmit`).

**Examples:**

  * `src/commands/admin/adminArcade.js`: Manages arcade, racing, and tiebreaker leaderboards. Includes `TiebreakerBreakerValidation` class for input validation. 
  * `src/commands/user/profile.js`: Displays user profiles, including points and trophy cases. 
  * `src/commands/user/registerUser.js`: Allows users to register in a specific channel. 

### Models (`src/models`)

Mongoose schemas define the structure of data stored in MongoDB. Each model corresponds to a collection in the database.

  * **`User.js`**: Stores user information, including Discord ID, RetroAchievements username, challenge progress (monthly, shadow), GP balance, gacha collection, trophy case, nominations, and various stats. 
  * **`Challenge.js`**: Defines monthly challenges, including game IDs, achievement requirements, and shadow game details. 
  * **`ArcadeBoard.js`**: Manages arcade, racing, and tiebreaker leaderboards, including game details, leaderboard IDs, start/end dates, and tiebreaker-breaker information. 
  * **`Poll.js`**: Stores voting poll information, including selected games, votes, and start/end dates. 
  * **`HistoricalLeaderboard.js`**: Archives finalized monthly leaderboards with detailed participant data and tiebreaker information. 
  * **`Suggestion.js`**: Stores community suggestions for arcade boards, racing challenges, bot improvements, etc. 
  * **`GachaItem.js`**: Defines individual gacha items (name, description, rarity, emoji, drop rate) and `CombinationRule` for crafting new items. 
  * **`NominationSettings.js`**: Configures nomination restrictions, themes, and schedules. 
  * **`ArenaChallenge.js`**: Manages arena battles, participants, wagers, bets, and results. 
  * **`TrophyEmoji.js`**: Stores custom emoji configurations for different trophy types and months. 
  * **`TemporaryMessage.js`**: Tracks messages that should be deleted after a certain time. 
  * **`index.js`**: Initializes and exports all models, and handles the database connection. 

### Services (`src/services`)

Services encapsulate business logic and interactions with external APIs or complex internal systems.

  * **`retroAPI.js`**: Handles all communication with the RetroAchievements API, including fetching user profiles, game info, achievements, and leaderboards. Uses an `EnhancedRateLimiter` and caching. 
  * **`enhancedRetroAPI.js`**: An extended version of `retroAPI.js` (though it seems to be the primary one used), focusing on detailed game information like publisher, developer, genre, and release dates. 
  * **`statsUpdateService.js`**: Periodically updates user statistics based on their RetroAchievements progress, particularly for monthly and shadow challenges. 
  * **`achievementFeedService.js`**: Monitors users' recent achievements and posts announcements to a designated Discord channel. 
  * **`monthlyTasksService.js`**: Handles scheduled tasks related to monthly cycles, such as clearing nominations and managing tiebreaker expirations/cleanups. 
  * **`arcadeService.js`**: Manages the lifecycle of arcade and racing boards, including awarding points. 
  * **`leaderboardFeedService.js`**: Responsible for generating and updating the main leaderboard feed in Discord, including monthly and yearly standings, and tiebreaker information. 
  * **`arcadeAlertService.js`**: Sends alerts for significant rank changes on arcade leaderboards. 
  * **`arcadeFeedService.js`**: Manages the display of arcade and racing challenge information in a dedicated feed channel. 
  * **`membershipCheckService.js`**: Periodically checks if registered users are still members of the Discord server and unregisters those who have left. 
  * **`arenaService.js`**: Core logic for the Arena system, including challenge creation, acceptance, completion processing, and payouts. 
  * **`arenaAlertService.js`**: Sends alerts related to Arena challenges, such as new challenges or rank changes. 
  * **`arenaFeedService.js`**: Manages the display of active Arena challenges and GP leaderboards in a feed channel. 
  * **`gameAwardService.js`**: Handles logic for determining and announcing game mastery and beaten awards for regular, monthly, and shadow challenges. 
  * **`monthlyGPService.js`**: Manages the automatic monthly grant of Game Points (GP) to users for the Arena system. 
  * **`gachaMachine.js`**: Implements the gacha pull mechanics, interacts with `gachaService` and `combinationService`. 
  * **`gachaService.js`**: Handles the logic for gacha item selection, rarity, and adding items to user collections. 
  * **`combinationService.js`**: Manages the logic for item combinations, checking if users have ingredients and processing combination attempts. Triggers alerts for available combinations. 
  * **`gachaIntegration.js`**: A higher-level service that seems intended to integrate gacha features, like awarding trophies (though the trophy awarding part seems more related to `gameAwardService`). 
  * **`EnhancedRateLimiter.js`**: A utility class used by API services to manage request rates and handle retries for rate-limited API calls. 
  * **`historicalDataService.js`**: Manages the repopulation and checking of historical challenge data for users, using `gameAwardService` for determining past awards. 

### Handlers (`src/handlers`)

These files manage interactions from Discord components like buttons, select menus, and modals. They typically route these interactions to the appropriate command or service.

  * **`arenaHandlers.js`**: Handles button clicks, modal submissions, and select menu choices for the `/arena` command and related features. 
  * **`nominationHandlers.js`**: Manages interactions for the `/nominate` command, including opening forms and processing submissions. 
  * **`restrictionHandlers.js`**: Deals with interactions for the `/restrictions` command, allowing admins to manage nomination themes and rules. 
  * The main `index.js` also contains global interaction handlers that delegate to these specific handlers or directly to command methods like `handleButtonInteraction`, `handleSelectMenuInteraction`, and `handleModalSubmit` if they exist on the command object. 

### Utilities (`src/utils`)

Reusable functions and classes that support various parts of the bot.

  * **`AlertUtils.js`**: Provides a standardized way to send various types of alerts (e.g., achievement, rank change) to designated Discord channels, with support for different alert types and colors. 
  * **`ArenaLeaderboardUtils.js`**: Contains helper functions specifically for refreshing and displaying arena leaderboards. 
  * **`arenaUtils.js`**: General utility functions for the Arena system, such as validating game/leaderboard info and determining winners. 
  * **`FeedManagerBase.js`**: A base class for services that manage persistent messages (feeds) in Discord channels, handling message creation, updates, and clearing. 
  * **`FeedUtils.js`**: Provides constants for embed colors, emojis, and helper functions for formatting (e.g., time remaining, Discord timestamps, creating standard embeds). 
  * **`gpUtils.js`**: Utilities for managing Game Points (GP), including awarding, deducting, fetching leaderboards, and formatting transactions. 
  * **`RetroAPIUtils.js`**: A wrapper around `retroAPI.js` that adds caching capabilities to reduce redundant API calls. 

### Configuration (`src/config`)

  * **`config.js`**: Loads environment variables (API keys, Discord IDs, channel IDs) and exports them as a configuration object. Includes validation for required variables. 
  * **`consoleGroups.js`**: Defines predefined groups for consoles, publishers, and genres, used by the nomination restriction system. Also includes `RestrictionRuleEngine` for evaluating game eligibility against these rules. 
  * **`gachaEmojis.js`**: Manages custom emoji configurations for gacha items, with fallback defaults and caching. 
  * **`trophyEmojis.js`**: Manages custom emoji configurations for challenge trophies, with fallback defaults and caching. 

### Main Entry Point (`src/index.js`)

The `src/index.js` file is the heart of the bot:

  * Initializes the Discord client with necessary intents.
  * Loads all slash commands from the `src/commands` directory.
  * Connects to MongoDB. 
  * Sets up global event handlers for:
      * `Events.InteractionCreate`: Routes slash commands, button clicks, select menu interactions, and modal submissions to their respective handlers. 
      * `Events.ClientReady`: Logs when the bot is ready, initializes services, and schedules cron jobs. 
      * `Events.Error`: Handles Discord client errors. 
  * Sets up cron jobs for various automated tasks like stats updates, achievement feeds, monthly tasks (nomination clearing, leaderboard finalization, tiebreaker management), arcade service runs, arena checks, and membership checks. 
  * Handles graceful shutdown. 

### Deployment (`src/deploy-commands.js`)

This script is run separately to register or update the bot's slash commands with Discord. It reads command definitions from the `src/commands` directory and uses the Discord API to deploy them to the specified guild. 

### Database Scripts (`src/scripts`)

  * **`dbMaintenance.js`**: Contains scripts for database maintenance tasks like fixing inconsistent date keys in user challenge data and checking for orphaned entries. 
  * **`dbUtils.js`**: Provides utility functions for database operations, such as `withTransaction` for atomic operations and `withRetry` for resilient database calls. 

-----

## 4\. Core Features & Logic

### User Registration & Management

  * Users can register via `/register` in a specific channel. 
  * Registration links a Discord ID with a RetroAchievements username.
  * The `User` model stores profiles, challenge progress, awards, GP, gacha items, etc. 
  * `membershipCheckService` ensures users are still in the server. 

### Monthly Challenges & Shadow Games

  * Admins create monthly challenges (`/adminchallenge create`) specifying a game and achievement requirements. 
  * Shadow games are hidden bonus challenges (`/adminchallenge shadow`). 
  * The `Challenge` model stores these details. 
  * `statsUpdateService` and `gameAwardService` track user progress and award points (Participation, Beaten, Mastery). 
  * Shadow games are capped at "Beaten" status. 
  * `leaderboardFeedService` displays current challenge progress. 

### Arcade & Racing Leaderboards

  * Admins manage these via `/adminarcade`. This includes creating boards, awarding points, and announcing them. 
  * `ArcadeBoard` model stores board details (type: arcade, racing, tiebreaker), game IDs, leaderboard IDs, and for racing, monthKeys and results. 
  * Arcade boards are year-long; racing challenges are monthly. 
  * `arcadeService` handles automated tasks like awarding racing points. 
  * `arcadeFeedService` and `arcadeAlertService` display info and rank changes. 
  * Tiebreakers are special boards to resolve ties in monthly challenges, potentially with their own "tiebreaker-breakers". 
  * `monthlyTasksService` handles tiebreaker expiration and cleanup. 

### Arena System

  * Users access via `/arena`; admins via `/adminarena`. 
  * Allows users to create direct or open challenges against others on RetroAchievements leaderboards, wagering Game Points (GP).
  * `ArenaChallenge` model stores challenge details, participants, wagers, and bets. 
  * `arenaService` manages the lifecycle: creation, acceptance, completion, timeouts, and payouts. 
  * `gpUtils` handles GP transactions. 
  * `arenaFeedService` displays active challenges; `arenaAlertService` notifies of updates. 
  * Monthly GP (1000 GP) is granted automatically by `monthlyGPService`. 

### Gacha System

  * Users interact via `/gacha` (implicitly, as `gachaMachine.js` is referenced in `index.js` but no user command is directly shown in the provided files, though `gacha-admin` exists). The `gachaMachine` posts an interactive message.
  * Admins manage items and combinations via `/gacha-admin`. 
  * `GachaItem` model defines items (rarity, drop rate, emoji) and `CombinationRule` for crafting. 
  * `gachaService` handles pull logic (selecting items based on drop rates). 
  * `combinationService` checks for and processes item combinations, now with user confirmation alerts instead of automatic combining. 
  * Users can view their collection with `/collection` and give items to others. 
  * `gachaEmojis.js` manages emoji display for gacha items. 

### Voting System

  * Admins start voting polls via `/adminvote start` for the next month's challenge. 
  * `Poll` model stores poll details, selected games, and votes. 
  * Users vote via `/vote`. 
  * `monthlyTasksService` handles automated poll creation and vote counting/announcement. 

### Suggestion System

  * Users submit suggestions via `/suggest` (for arcade, racing, bot improvements, other). 
  * Admins manage suggestions via `/suggestadmin`. 
  * `Suggestion` model stores suggestion details, type, status, and admin responses. 

### Points & Awards System

  * Points are awarded for:
      * Monthly Challenges: Participation (1), Beaten (+3), Mastery (+3). 
      * Shadow Challenges: Participation (1), Beaten (+3) (capped at Beaten). 
      * Racing Challenges: 1st (3), 2nd (2), 3rd (1), awarded monthly. 
      * Arcade Leaderboards: 1st (3), 2nd (2), 3rd (1), awarded annually on Dec 1st. 
  * `User` model tracks points in `monthlyChallenges`, `shadowChallenges`, and `communityAwards`. 
  * `gameAwardService` determines and announces mastery/beaten awards. 
  * `/adminaward` allows manual community award granting. 
  * `yearlyLeaderboard` command displays annual point totals, with an option for comprehensive API sync. 
  * Custom trophy emojis are managed via `/managetrophyemojis` and `TrophyEmoji` model. 

### Automated Tasks & Feeds

Scheduled via `cron` in `index.js`:

  * **Stats Updates (`statsUpdateService`):** Every 30 mins.
  * **Achievement Feed (`achievementFeedService`):** Every 15 mins.
  * **Weekly Comprehensive Yearly Sync (`yearlyLeaderboard` logic):** Sundays at 3 AM.
  * **Monthly Tasks (`monthlyTasksService`):** Nomination clearing (1st of month), Tiebreaker expiration (last 4 days of month), Tiebreaker cleanup (1st of month), Leaderboard finalization (1st of month), Voting poll creation (8 days before month end), Vote counting (1 day before month end).
  * **Arcade Service (`arcadeService`):** Daily checks for completed racing challenges, awards arcade points on Dec 1st.
  * **Leaderboard Feed (`leaderboardFeedService`):** Updates main leaderboard display every 15 mins.
  * **Arcade Alerts (`arcadeAlertService`):** Checks for rank changes hourly.
  * **Arcade Feed (`arcadeFeedService`):** Updates arcade/racing info feed hourly.
  * **Arena Checks (`arenaService`, `arenaAlertService`, `arenaFeedService`):** Various intervals for completed challenges, timeouts, alerts, and feed updates.
  * **Membership Check (`membershipCheckService`):** Daily.
  * **Monthly GP Grant (`monthlyGPService`):** Daily check, grants on 1st.
  * **Gacha Machine (`gachaMachine`):** Pins/updates its message.

### Nomination Restrictions

  * Admins manage via `/restrictions`. 
  * `NominationSettings` model stores global settings and monthly rules. 
  * `consoleGroups.js` defines `CONSOLE_GROUPS`, `PUBLISHER_GROUPS`, `GENRE_GROUPS`, and `QUICK_PRESETS`. It also includes `RestrictionRuleEngine` to evaluate if a game meets complex criteria (AND/OR logic for console, publisher, genre, year). 

-----

## 5\. Data Flow Examples (Conceptual)

### User Command Execution

1.  User types `/profile username:JohnDoe`.
2.  `index.js` `InteractionCreate` event listener receives the command.
3.  It finds the `profile` command module in `client.commands`.
4.  `profile.execute(interaction)` is called.
5.  The command fetches `User` data from MongoDB.
6.  It calls `retroAPI.getUserInfo()` (which might use `RetroAPIUtils` for caching) to get data from RetroAchievements.
7.  Points are calculated using `User` model methods and data from `Challenge` model.
8.  An embed is constructed and sent as a reply.
9.  If buttons are present (e.g., "Trophy Case"), `handleButtonInteraction` in `profile.js` (or a global handler) would manage subsequent clicks.

### Automated Stat Update

1.  Cron job in `index.js` triggers `statsUpdateService.start()`.
2.  `statsUpdateService.updateAllUserStats()` fetches all `User`s and the current `Challenge`.
3.  For each user, it calls `retroAPI.getUserGameProgress()` for the monthly and shadow challenge games.
4.  It calculates points based on achievements earned *during the challenge month*.
5.  Updates `user.monthlyChallenges` and `user.shadowChallenges` Maps in the `User` document and saves it to MongoDB.
6.  Notifies an external API to refresh its cache.

-----

## 6\. Key Libraries Used

  * **`discord.js`**: Core library for interacting with the Discord API.
  * **`mongoose`**: ODM for MongoDB, used for database schema definition and interaction.
  * **`dotenv`**: Loads environment variables from a `.env` file.
  * **`node-cron`**: Schedules automated tasks.
  * **`@retroachievements/api`**: Official JavaScript library for the RetroAchievements API.

-----

## 7\. TODOs & Potential Improvements

### General Codebase & Structure

  * **TODO**: Standardize error handling across all services and commands. Implement a global error handler or a more consistent error response pattern.
  * **TODO**: Review and consolidate API call rate limiting. While `EnhancedRateLimiter` is used, ensure all direct `fetch` calls to external APIs also respect appropriate limits or are routed through a rate-limited service.
  * **TODO**: Improve modularity of large command files (e.g., `adminArcade.js`, `adminVote.js`, `leaderboard.js`, `suggestAdmin.js`). Break down complex `execute` functions or `handleButtonInteraction` into smaller, more manageable private methods or helper classes/services.
  * **TODO**: Add more comprehensive JSDoc comments to all functions and classes, especially for complex services and models.
  * **TODO**: Implement unit and integration tests for critical services (e.g., points calculation, Arena logic, Gacha pulls, RetroAPI interactions).
  * **TODO**: Consider a more centralized interaction handling mechanism instead of having `handleButtonInteraction`, `handleModalSubmit`, etc., in many individual command files. A dispatcher in `index.js` or a dedicated interaction router service could simplify this.
  * **TODO**: Review `src/services/gachaIntegration.js` - its purpose seems to overlap with `gameAwardService` for trophy awarding. Clarify its role or merge functionality. 
  * **TODO**: The `EnhancedRateLimiter` has a `retryDelay` that increases with retries. Ensure this doesn't lead to excessively long waits for frequently rate-limited endpoints. Consider exponential backoff with jitter.
  * **TODO**: The `src/index.js` file is very large due to numerous cron job setups and event handlers. Explore ways to modularize cron job definitions or event handling logic.

### Configuration

  * **TODO**: Centralize all magic strings and IDs (like role IDs, channel IDs not already in `config.js`) into the `config.js` file or dedicated constants files. Example: `MEMBER_ROLE_ID` in `adminUser.js` and `registerUser.js`. 
  * **TODO**: The `config.discord.leaderboardFeedChannelId` and `rankAlertsChannelId` default to the same channel (`1371350718505811989`).  This is fine, but ensure this is intentional and document it if so. If they are meant to be distinct, update defaults or ensure setup guide mentions this.

### Database & Models

  * **TODO**: Review Mongoose schema validation. Add more specific validation rules (e.g., regex for IDs, min/max for numbers where appropriate) to ensure data integrity at the database level.
  * **TODO**: The `ArcadeBoard.js` model has an `expiredAt` index commented out. Investigate if this sparse index is still needed or if the schema definition itself handles it. 
  * **TODO**: In `User.js`, `announcedAchievements` and `announcedAwards` are simple arrays of strings. For `announcedAwards`, consider storing more structured data if advanced querying or duplicate prevention logic becomes more complex than simple string matching. 
  * **TODO**: The `User.js` model has a virtual `gp` field for backward compatibility with `gpBalance`.  Plan to phase out the `gp` virtual field and update all code to use `gpBalance` directly to reduce complexity.
  * **TODO**: `dbMaintenance.js` script seems useful. Consider integrating its checks (especially `check-orphaned`) into a periodic automated task or an admin command for easier access. 

### Services & Logic

  * **TODO**: Refactor `achievementFeedService.js` and `gameAwardService.js`. There's significant overlap in fetching user progress and game info. Consolidate common logic. The distinction between "regular" achievements and "monthly/shadow" awards could be clearer.
  * **TODO**: `gameAwardService.js` and `statsUpdateService.js` both calculate points/awards for monthly/shadow challenges. Ensure their logic is consistent or consolidated to avoid discrepancies. `statsUpdateService`'s point calculation for mastery/beaten/participation is based on achievement counts within the month These should align or have a clear reason for differing.
  * **TODO**: The `retroAPI.js` and `enhancedRetroAPI.js` have overlapping functionality (e.g., `getGameInfo`). Consolidate into a single, comprehensive RetroAchievements API service. `enhancedRetroAPI` seems more feature-rich. 
  * **TODO**: The `EnhancedRateLimiter` in `retroAPI.js` is hardcoded to 1 request per 1.2 seconds.  RetroAchievements API has different rate limits for different endpoints (e.g., user summary vs. game info). A more sophisticated rate limiter could handle this.
  * **TODO**: `leaderboardFeedService.js` has complex logic for `assignRanks` including tiebreakers and tiebreaker-breakers. 
  * **TODO**: The `leaderboardFeedService.js` method `generateYearlyLeaderboardEmbeds` fetches user data and then looks for `annualRecords`. If `sync:true` is used with `/yearlyboard`, `syncAndCalculatePoints` populates these `annualRecords`. Ensure the non-sync path correctly displays data if `annualRecords` aren't fresh. 
  * **TODO**: In `leaderboard.js`, the `finalizePreviousMonth` function fetches user progress directly from the API to finalize.  It should ideally use the already processed and stored data from `User.monthlyChallenges` (populated by `statsUpdateService`) for consistency, or clearly document why fresh API calls are necessary for finalization.
  * **TODO**: `adminSystem.js` command `scan-achievements` and `check-mastery`  partially duplicate logic found in `achievementFeedService.js` and `gameAwardService.js`. These admin commands could call methods from those services.
  * **TODO**: Review the handling of `lastAchievementCheck` in `User.js` and `achievementFeedService.js`. Ensure the timestamp updates correctly to prevent re-announcing old achievements after bot restarts. The +2000ms buffer is a heuristic. 
  * **TODO**: The `gachaService.js` `addItemToUser` has detailed logging for emoji data transfer issues.  and gacha item creation/editing (`gacha-admin.js`) fully resolve these.
  * **TODO**: In `arenaHandlers.js` and other interaction handlers, there's a pattern of `interaction.deferUpdate()` followed by logic. If the subsequent logic involves showing a modal (which consumes the interaction), `deferUpdate()` isn't needed and can cause issues. Review all interaction handlers for correct `deferUpdate`/`showModal` usage. Some fixes are noted in comments (e.g., `suggestAdmin.js`). 

### Commands & User Experience

  * **TODO**: The `/yearlyboard` command has a `sync` option described as "admin only, very slow".  Consider making the admin-only nature more explicit in permissions or add a confirmation step due to its resource intensity.
  * **TODO**: `/adminchallenge create` requires manual input of progression/win achievement IDs.  The system can use official RA awards if left blank. This is good, but consider an option to automatically fetch *all* achievements for a game and let the admin select from a list for progression/win, if feasible via API.
  * **TODO**: Many admin commands that perform destructive actions (e.g., `adminarena system reset_system`) have a `confirm_reset: True` option. This is good. Ensure all such commands have robust confirmation.
  * **TODO**: The `/collection` command  seem to have slightly different display logic/features. Standardize or ensure differences are intentional.
  * **TODO**: The help commands (`/adminhelp`) use select menus to navigate categories. Ensure these are kept up-to-date as commands are added or changed.
  * **TODO**: The `adminArcade.js` command has a `TiebreakerBreakerValidation` class.  This is a good pattern. Consider if other complex validation logic in commands could be extracted into similar helper classes for clarity and reusability.

### Feed & Alert Services

  * **TODO**: The `FeedManagerBase.js` `clearChannel` method has a hardcoded list of `ALLOWED_FEED_CHANNELS`.  This should ideally be configurable or derived more dynamically to prevent accidental clearing of unintended channels if channel IDs change.
  * **TODO**: `AlertUtils.js` has default channel IDs.  Ensure these defaults make sense or are always overridden by specific service configurations or `config.js`.
  * **TODO**: Review the necessity of separate "Alert" and "Feed" services for Arcade and Arena. There might be an opportunity to consolidate if their functionalities heavily overlap (e.g., `arcadeAlertService` and `arcadeFeedService`).


## License

MIT
