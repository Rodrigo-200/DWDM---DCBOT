# DWDM - DCBOT

Discord bot designed for a school server with music playback, command management, and integration with NetPA schedule updates plus the IPLuso announcements feed.

## Features

- Modern Discord slash commands with modular command loader.
- Automated script to register commands globally or per guild.
- Music system with high quality audio streaming, queue management, and playback controls.
- Interactive now playing embed with pause/skip/loop buttons.
- Hourly schedule watcher that authenticates against the NetPA portal and posts updates when changes are detected.
- Announcement watcher that polls the IPLuso news page for new posts.
- Persistent JSON storage for last known schedule and announcements.

## Setup

1. **Install dependencies**
   ```pwsh
   npm install
   ```

2. **Install Playwright browsers** (first run only)
   ```pwsh
   npx playwright install chromium
   ```

3. **Environment variables**
   - Copy `.env.example` to `.env` and fill in your Discord bot token, application client ID, optional guild ID, NetPA credentials, and target channel IDs.
   - Provide `YOUTUBE_COOKIE` if you want to pass your YouTube session cookies to the music subsystem (recommended for region-restricted videos).
   - Flip `ENABLE_SCHEDULE_WATCHER` or `ENABLE_ANNOUNCEMENTS_WATCHER` to `false` while developing if you do not want Playwright scrapers to run.
   - Never commit your `.env` file or tokens.

4. **Running the bot locally**
   ```pwsh
   npm run dev
   ```

5. **Building for production**
   ```pwsh
   npm run build
   npm start
   ```

6. **Slash command deployment**
   ```pwsh
   npm run register:commands
   ```

## Additional Notes

- The NetPA automation uses Playwright with Chromium. On the first run Playwright will download the necessary browser binaries.
- The login flow on `https://secretaria.virtual.ensinolusofona.pt/netpa/page` spawns a popup after you press **Entrar**. The scraper now clicks that button automatically and supports popup or iframe forms, but if the portal markup changes update the selectors in `src/services/scheduleClient.ts`.
- After the bot logs in it navigates directly to `https://secretaria.virtual.ensinolusofona.pt/netpa/page?page?stage=HorarioAlunoSemanal`, pulls the weekly schedule, updates a pinned embed in the configured channel, and only pings `@here` when an actual change is detected.
- Customize the selectors in `src/services/scheduleClient.ts` to match the actual structure of the schedule page after login.
- The announcement watcher uses basic CSS selectors – inspect https://www.ipluso.pt/pt/noticias and adjust the selectors if the markup changes.
- State files are stored in `data/state.json`. Add the `data/` folder to your `.gitignore` if you do not want to track runtime data.
- Some YouTube streams now require cookies to access the ciphered audio URLs. Populate `YOUTUBE_COOKIE` with the `Cookie` header copied from a logged-in browser session if playback returns HTTP 403 errors.
- Revoke and regenerate any existing tokens that were previously stored in `config.json` for security.
