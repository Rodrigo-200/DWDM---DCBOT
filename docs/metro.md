# Metro Lisboa Panel & Interaction Design

## Objectives

- Allow anyone in the Discord server to quickly check the next Metro Lisboa departures through the `/metro publicar` panel.
- Provide a familiar, elegant UX that mirrors the CP panel: users pick a line + station and then a **sentido** (destination) to see the upcoming trains.
- Use official Metro Lisboa APIs with the provided OAuth token so wait times, stations, and destination metadata stay in sync automatically.

## User Flow

1. **Publish panel** – Moderators run `/metro publicar`. The bot fetches the latest station catalog and posts a pinned embed into the configured channel (`METRO_PANEL_CHANNEL_ID`).
2. **Choose line/station** – The panel shows one dropdown per line (Amarela, Verde, Azul, Vermelha). Stations shared between lines appear in both menus. Selecting a station opens an ephemeral response.
3. **Pick sentido** – The ephemeral response contains:
   - A stylish embed (`🚇 {station}`) showing the current line color.
   - A dropdown listing every available `sentido` (destination) returned by `/tempoEspera/Estacao/{id}`.
   - A refresh button to pull the latest data without repeating the station selection.
4. **Review departures** – Each sentido field displays up to three ETAs per platform (converted to minutes/seconds) plus the train identifiers, platform code, and last API timestamp.

## API Strategy

- **Stations** – `GET /infoEstacao/todos`. Parsed once and cached in-memory (24h) so both the panel builder and interaction handler reuse it.
- **Destinations** – `GET /infoDestinos/todos`. Supplies human-readable sentido labels and helps infer the line color by matching the destination name to the station catalog.
- **Wait times** – `GET /tempoEspera/Estacao/{stop_id}`; each row contains:
  - `tempoChegada1..3`: seconds until each upcoming train (or `--`).
  - `comboio1..3`: identifiers for the trains.
  - `destino`: numeric destino id → friendly label.
  - `cais`, `hora`, `UT`, `sairServico`: metadata used for embeds.

All requests use OAuth tokens acquired via the Metro Lisboa Client Credentials flow (see `METRO_CLIENT_ID`/`METRO_CLIENT_SECRET`) and the configurable `METRO_API_BASE_URL` (defaulting to `https://api.metrolisboa.pt:8243/estadoServicoML/1.0.1`).

## Embed Layout

```
🚇 Campo Grande — Linha Verde
Sentido: Telheiras

G14O — comboio 2C
 • em 3 min (203 s)
 • em 12 min (708 s)
 • em 20 min (1213 s)

Atualizado às 13:19:45 • Dados oficiais Metro Lisboa
```

- Color palette per line:
  - Amarela `#F2C037`
  - Verde `#009739`
  - Azul `#0074C7`
  - Vermelha `#E3232C`
- Footer reminds users to double-check physical signage.
- Refresh button label: `Atualizar tempos`.

## Error Handling & Edge Cases

- Missing station/destination → immediate ephemeral error with retry hint.
- API downtime or throttling → log structured warning + user-friendly message.
- No upcoming trains (`tempoChegada` all `--`) → embed states "Sem previsões disponíveis".
- Numbers are resilient to malformed payloads (non-numeric strings, nulls, etc.).

## State & Configuration

- New persistent field `metroPanelMessageId` mirrors `cpPanelMessageId` to allow updates instead of reposts.
- `.env` gains `METRO_API_BASE_URL`, `METRO_TOKEN_URL`, `METRO_CLIENT_ID`, `METRO_CLIENT_SECRET`, `METRO_PANEL_CHANNEL_ID`, the optional `METRO_TLS_REJECT_UNAUTHORIZED`, and `METRO_CA_CERT_PATH` for custom PEM bundles.
- README documents the setup and explains that tokens are refreshed automatically before they expire.
