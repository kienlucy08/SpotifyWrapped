# Spotify Wrapped, Live

A personal Wrapped dashboard that stays up to date: top songs (with play counts), top artists, top genres,
top albums, minutes listened, listening by hour/weekday/month, biggest day, best streak, and a now-playing card.

## Setup
1. Create an app at https://developer.spotify.com/dashboard and add the Redirect URI `http://127.0.0.1:3000/callback`
   (Spotify requires the `127.0.0.1` loopback form, not `localhost`).
2. Put the Client ID/Secret in `.env` (copy of `.env.example`).
3. `npm install && npm start`, then open http://127.0.0.1:3000 and log in. Requires Node 22.13+.

## How "live" works
Spotify's API has **no endpoint for play counts**, and `recently-played` only returns your last 50 tracks.
So the server polls every minute, stores each new play in SQLite (`data/wrapped.db`), and computes counts itself.
The page updates instantly via Server-Sent Events whenever new plays land. Keep the server running to avoid gaps
(>50 plays between polls would be lost).

## Backfill the past year
Request "Extended streaming history" at https://www.spotify.com/account/privacy, then:

    npm run import -- path/to/extracted/folder

This loads `Streaming_History_Audio_*.json` (plays under 30s are skipped). Live plays take over from where the export ends.

## Data sources
- Counts, minutes, time charts: your own `plays` table (live + imported).
- Genres/artist photos: Spotify's artist objects, looked up in the background (imported rows are matched by name search).
- "Spotify's own picks": `/me/top/*`. Real ranking, but no counts; shown so the page isn't empty on day one.
