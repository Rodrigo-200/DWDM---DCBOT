# DWDM - DCBOT

Discord bot designed for a school server with music playback, command management, and integration with NetPA schedule updates plus the IPLuso announcements feed.

## Features

- Modern Discord slash commands with modular command loader.
- Automated script to register commands globally or per guild.
- Metro Lisboa and CP interactive panels with dropdowns for estação/sentido and real-time wait times.
- Hourly schedule watcher that authenticates against NetPA and keeps the pinned embeds fresh in the configured channel.
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
   - Copy `.env.example` to `.env` and fill in: Discord credentials, NetPA credentials, channel IDs, CP keys (`CP_X_API_KEY`, `CP_CONNECT_ID`, `CP_CONNECT_SECRET`), plus the Metro OAuth credentials (`METRO_CLIENT_ID`, `METRO_CLIENT_SECRET`).
   - `CP_PANEL_CHANNEL_ID` and `METRO_PANEL_CHANNEL_ID` control where the bot posts the interactive panels (use the IDs provided in Discord like `1439603932379873310`).
   - The bot now fetches Metro Lisboa access tokens automatically via the Client Credentials flow. Provide the same client/secret you use on the API portal; optionally tune `METRO_API_BASE_URL`/`METRO_TOKEN_URL`, set `METRO_TLS_REJECT_UNAUTHORIZED=false` to mimic `curl -k`, or point `METRO_CA_CERT_PATH` to a PEM bundle if you have the proper CA chain.
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

## Metro Lisboa Panel

- Run `/metro publicar` (requires the Manage Server permission) after configuring `METRO_PANEL_CHANNEL_ID` to publish or refresh the embed with the dropdown menus per linha.
- Users pick the linha/estação directly from the panel in the configured channel. After selecting, an ephemeral embed appears with another dropdown to choose the **sentido** (destino) and a refresh button.
- Data comes from the official EstadoServicoML APIs (`/infoEstacao/todos`, `/infoDestinos/todos`, `/tempoEspera/Estacao/{id}`) using OAuth tokens requested automatically via `METRO_CLIENT_ID`/`METRO_CLIENT_SECRET`.
- The bot stores the Metro panel message ID in `data/state.json` so subsequent `/metro publicar` executions update the same message instead of creating duplicates.

## Additional Notes

- The NetPA automation uses Playwright with Chromium. On the first run Playwright will download the necessary browser binaries.
- The login flow on `https://secretaria.virtual.ensinolusofona.pt/netpa/page` spawns a popup after you press **Entrar**. The scraper now clicks that button automatically and supports popup or iframe forms, but if the portal markup changes update the selectors in `src/services/scheduleClient.ts`.
- After the bot logs in it navigates directly to `https://secretaria.virtual.ensinolusofona.pt/netpa/page?page?stage=HorarioAlunoSemanal`, pulls the weekly schedule, updates a pinned embed in the configured channel, and only pings `@here` when an actual change is detected.
- Customize the selectors in `src/services/scheduleClient.ts` to match the actual structure of the schedule page after login.
- The announcement watcher uses basic CSS selectors – inspect https://www.ipluso.pt/pt/noticias and adjust the selectors if the markup changes.
- State files are stored in `data/state.json`. Add the `data/` folder to your `.gitignore` if you do not want to track runtime data.
- Some YouTube streams now require cookies to access the ciphered audio URLs. Populate `YOUTUBE_COOKIE` with the `Cookie` header copied from a logged-in browser session if playback returns HTTP 403 errors.
- Revoke and regenerate any existing tokens that were previously stored in `config.json` for security.
