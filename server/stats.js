import { db } from './db.js';
import { computeMovie, computePersona } from './persona.js';

/** range: '30d' | '6m' | 'year' (last 365 days, default) | 'all' | '2025' (calendar year) */
function bounds(range) {
  const now = new Date();
  const daysAgo = (d) => new Date(now - d * 864e5).toISOString();
  if (/^\d{4}$/.test(range)) return [`${range}-01-01T00:00:00`, `${+range + 1}-01-01T00:00:00`];
  if (range === '30d') return [daysAgo(30), '9999'];
  if (range === '6m') return [daysAgo(182), '9999'];
  if (range === 'all') return ['0000', '9999'];
  return [daysAgo(365), '9999'];
}

export function computeStats(range = 'year') {
  const [from, to] = bounds(range);
  const w = [from, to];
  const q = (sql) => db.prepare(sql).all(...w);
  const where = 'WHERE played_at >= ? AND played_at < ?';

  const totals = db.prepare(`
    SELECT COUNT(*) plays, COALESCE(SUM(ms_played),0) ms,
           COUNT(DISTINCT track_id) tracks, COUNT(DISTINCT artist) artists, COUNT(DISTINCT album) albums,
           COUNT(DISTINCT date(played_at,'localtime')) days
    FROM plays ${where}`).get(...w);

  const topTracks = q(`
    SELECT track, artist, MAX(image) image, MAX(track_id) id, COUNT(*) plays, SUM(ms_played) ms
    FROM plays ${where} GROUP BY track_id ORDER BY plays DESC, MAX(played_at) DESC LIMIT 25`);

  const topArtists = q(`
    SELECT p.artist name, COUNT(*) plays, SUM(p.ms_played) ms, ai.image
    FROM plays p LEFT JOIN artist_info ai ON ai.name = p.artist
    ${where.replace(/played_at/g, 'p.played_at')}
    GROUP BY p.artist ORDER BY plays DESC LIMIT 25`);

  const topAlbums = q(`
    SELECT album, artist, MAX(image) image, COUNT(*) plays
    FROM plays ${where} AND album IS NOT NULL GROUP BY album, artist ORDER BY plays DESC LIMIT 10`);

  // Genres: each play counts toward every genre of its artist.
  const genreCounts = {};
  let enriched = 0, unenriched = 0;
  for (const r of q(`SELECT ai.genres g, COUNT(*) n, ai.checked c
                     FROM plays p LEFT JOIN artist_info ai ON ai.name = p.artist
                     ${where.replace(/played_at/g, 'p.played_at')} GROUP BY p.artist`)) {
    const genres = JSON.parse(r.g || '[]');
    if (!r.c) unenriched += r.n; else enriched += r.n;
    for (const g of genres) genreCounts[g] = (genreCounts[g] || 0) + r.n;
  }
  const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, plays]) => ({ name, plays }));

  const byHour = Array(24).fill(0);
  for (const r of q(`SELECT CAST(strftime('%H', played_at,'localtime') AS INT) h, COUNT(*) n FROM plays ${where} GROUP BY h`)) byHour[r.h] = r.n;
  const byWeekday = Array(7).fill(0); // 0 = Sunday
  for (const r of q(`SELECT CAST(strftime('%w', played_at,'localtime') AS INT) d, COUNT(*) n FROM plays ${where} GROUP BY d`)) byWeekday[r.d] = r.n;
  const byMonth = q(`SELECT strftime('%Y-%m', played_at,'localtime') m, COUNT(*) plays, SUM(ms_played) ms FROM plays ${where} GROUP BY m ORDER BY m`);

  const topDay = db.prepare(`
    SELECT date(played_at,'localtime') day, COUNT(*) plays, SUM(ms_played) ms
    FROM plays ${where} GROUP BY day ORDER BY ms DESC LIMIT 1`).get(...w) || null;

  // Longest streak of consecutive listening days.
  const days = q(`SELECT DISTINCT date(played_at,'localtime') d FROM plays ${where} ORDER BY d`).map((r) => r.d);
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && (new Date(d) - new Date(prev)) / 864e5 === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  }

  const recent = db.prepare(`SELECT played_at, track, artist, image FROM plays ORDER BY played_at DESC LIMIT 10`).all();
  const span = db.prepare(`SELECT MIN(played_at) first, MAX(played_at) last, COUNT(*) total FROM plays`).get();

  const rs = db.prepare(`SELECT MIN(played_at) f FROM plays ${where}`).get(...w).f;
  const rangeDays = rs ? Math.ceil((Date.now() - new Date(rs)) / 864e5) + 1 : 1;

  // Listening age: median release year of what you play, mapped to the age you'd be if it was music from when you were ~16.
  const yrs = q(`SELECT tm.year y, COUNT(*) n FROM plays p JOIN track_meta tm ON tm.track_id = p.track_id
                 ${where.replace(/played_at/g, 'p.played_at')} AND tm.year > 0 GROUP BY tm.year ORDER BY tm.year`);
  const known = yrs.reduce((a, r) => a + r.n, 0);
  let listeningAge = null;
  if (known >= 20 && known / Math.max(1, totals.plays) >= 0.5) {
    let acc = 0, median = yrs[0].y;
    for (const r of yrs) { acc += r.n; if (acc >= known / 2) { median = r.y; break; } }
    const decades = {};
    for (const r of yrs) { const d = Math.floor(r.y / 10) * 10; decades[d] = (decades[d] || 0) + r.n; }
    listeningAge = {
      age: Math.max(13, Math.min(85, new Date().getFullYear() - median + 16)), medianYear: median,
      oldest: yrs[0].y, newest: yrs.at(-1).y,
      decades: Object.entries(decades).map(([d, n]) => ({ decade: +d, share: n / known })),
    };
  }

  const result = {
    range, totals: { ...totals, minutes: Math.round(totals.ms / 60000) },
    topTracks, topArtists, topAlbums, topGenres,
    genreCoverage: enriched + unenriched ? enriched / (enriched + unenriched) : 1,
    byHour, byWeekday, byMonth, topDay, longestStreak: best, recent, dataSpan: span,
  };
  result.persona = computePersona(result, rangeDays);
  result.movie = computeMovie(result, rangeDays);
  result.listeningAge = listeningAge;
  return result;
}
