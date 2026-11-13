import express from 'express';
import { setKV } from './db.js';
import { api, handleCallback, isConfigured, isLoggedIn, loginUrl, logout } from './spotify.js';
import { enrichArtists, enrichTracks, enrichYears, pollRecentlyPlayed } from './poller.js';
import { computeStats } from './stats.js';

const PORT = Number(process.env.PORT || 3000);
const POLL_MS = Math.max(15, Number(process.env.POLL_SECONDS || 60)) * 1000;
const app = express();
app.use(express.static('public'));

// ---- live updates (Server-Sent Events) ----
const clients = new Set();
const broadcast = (event, data = {}) => {
  for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

// ---- auth ----
app.get('/login', (req, res) => {
  if (!isConfigured()) return res.status(500).send('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env, then restart.');
  res.redirect(loginUrl());
});
app.get('/callback', async (req, res) => {
  try {
    if (req.query.error) throw new Error(req.query.error);
    await handleCallback(req.query.code, req.query.state);
    const me = await api('/me');
    setKV('display_name', me.display_name || me.id);
    tick(); // start collecting right away
    res.redirect('/');
  } catch (e) { res.status(400).send(`Login failed: ${e.message}`); }
});
app.post('/logout', (req, res) => { logout(); res.json({ ok: true }); });

// ---- data ----
app.get('/api/status', (req, res) =>
  res.json({ configured: isConfigured(), loggedIn: isLoggedIn() }));

app.get('/api/stats', (req, res) => res.json(computeStats(String(req.query.range || 'year'))));

app.get('/api/now-playing', async (req, res) => {
  try {
    const d = await api('/me/player/currently-playing');
    const t = d?.item;
    res.json(t && d.is_playing ? {
      playing: true, track: t.name, artist: t.artists.map((a) => a.name).join(', '),
      image: t.album.images?.[1]?.url, progress: d.progress_ms, duration: t.duration_ms,
    } : { playing: false });
  } catch { res.json({ playing: false }); }
});

// Spotify's own affinity ranking. No play counts, but available immediately (useful before history builds up).
app.get('/api/spotify-top/:type', async (req, res) => {
  try {
    const type = req.params.type === 'tracks' ? 'tracks' : 'artists';
    const time_range = ['short_term', 'medium_term', 'long_term'].includes(req.query.time_range) ? req.query.time_range : 'long_term';
    const d = await api(`/me/top/${type}`, { limit: 20, time_range });
    res.json(d.items.map((i) => ({
      name: i.name, sub: type === 'tracks' ? i.artists[0].name : (i.genres || []).slice(0, 2).join(', '),
      image: (type === 'tracks' ? i.album : i).images?.[1]?.url,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- background collection ----
let busy = false;
async function tick() {
  if (busy || !isLoggedIn()) return;
  busy = true;
  try {
    const added = await pollRecentlyPlayed();
    await enrichTracks();
    await enrichArtists();
    await enrichYears();
    if (added) { console.log(`+${added} new plays`); broadcast('update', { added }); }
  } catch (e) { console.error('poll failed:', e.message); }
  finally { busy = false; }
}
setInterval(tick, POLL_MS);
tick();

app.listen(PORT, '127.0.0.1', () => console.log(`Spotify Wrapped Live → http://127.0.0.1:${PORT}`));
