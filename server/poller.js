import { db, getKV, setKV } from './db.js';
import { api, isLoggedIn } from './spotify.js';

const insertYear = db.prepare('INSERT OR IGNORE INTO track_meta(track_id, year) VALUES (?, ?)');
const insertPlay = db.prepare(`
  INSERT OR IGNORE INTO plays (played_at, track_id, track, artist, artist_id, album, image, ms_played, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live')`);

/** Pull plays newer than our cursor. Returns how many new rows were stored. */
export async function pollRecentlyPlayed() {
  if (!isLoggedIn()) return 0;
  const after = getKV('recent_cursor');
  const data = await api('/me/player/recently-played', { limit: 50, ...(after && { after }) });
  const items = data?.items ?? [];
  let added = 0;
  db.exec('BEGIN');
  try {
    for (const { track, played_at } of items) {
      if (!track?.id) continue; // local files / podcasts without ids
      const r = insertPlay.run(
        played_at, track.id, track.name,
        track.artists[0].name, track.artists[0].id,
        track.album?.name ?? null,
        track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url ?? null,
        track.duration_ms,
      );
      added += Number(r.changes);
      const y = parseInt(track.album?.release_date ?? '', 10);
      if (y) insertYear.run(track.id, y);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  if (data?.cursors?.after) setKV('recent_cursor', data.cursors.after);
  return added;
}

/** Fill in genres/images for artists we've seen but never looked up (most-played first). */
export async function enrichArtists(limit = 50) {
  if (!isLoggedIn()) return;
  db.exec(`INSERT OR IGNORE INTO artist_info(name, id)
           SELECT artist, MAX(artist_id) FROM plays GROUP BY artist`);
  const rows = db.prepare(`
    SELECT ai.name, ai.id FROM artist_info ai
    JOIN (SELECT artist, COUNT(*) n FROM plays GROUP BY artist) p ON p.artist = ai.name
    WHERE ai.checked = 0 ORDER BY p.n DESC LIMIT ?`).all(limit);
  const upd = db.prepare('UPDATE artist_info SET id=?, genres=?, image=?, checked=1 WHERE name=?');

  // Rows with an id can be batched 50 at a time; the rest (imported history) need a search.
  const withId = rows.filter((r) => r.id);
  for (let i = 0; i < withId.length; i += 50) {
    const chunk = withId.slice(i, i + 50);
    const { artists } = await api('/artists', { ids: chunk.map((c) => c.id).join(',') });
    for (const [j, a] of artists.entries()) {
      if (a) upd.run(a.id, JSON.stringify(a.genres ?? []), a.images?.[1]?.url ?? a.images?.[0]?.url ?? null, chunk[j].name);
    }
  }
  for (const r of rows.filter((r) => !r.id)) {
    const res = await api('/search', { q: `artist:"${r.name.replace(/"/g, '')}"`, type: 'artist', limit: 1 });
    const a = res?.artists?.items?.[0];
    if (a) upd.run(a.id, JSON.stringify(a.genres ?? []), a.images?.[1]?.url ?? a.images?.[0]?.url ?? null, r.name);
    else db.prepare('UPDATE artist_info SET checked=1 WHERE name=?').run(r.name);
  }
}

/** Look up release years for tracks we only know by id (imported history). ~250 tracks per call. */
export async function enrichYears(batches = 5) {
  if (!isLoggedIn()) return;
  for (let b = 0; b < batches; b++) {
    const ids = db.prepare(`SELECT DISTINCT track_id id FROM plays
      WHERE length(track_id) = 22 AND track_id NOT IN (SELECT track_id FROM track_meta) LIMIT 50`).all().map((r) => r.id);
    if (!ids.length) return;
    const { tracks } = await api('/tracks', { ids: ids.join(',') });
    db.exec('BEGIN');
    ids.forEach((id, i) => insertYear.run(id, parseInt(tracks[i]?.album?.release_date ?? '', 10) || 0));
    db.exec('COMMIT');
  }
}

/** Imported plays from the standard export only have synthetic ids ('x:...'). Resolve the most-played ones to real
 *  Spotify tracks via search to get album, art, artist id and release year. Rewrites ids so they merge with live plays. */
export async function enrichTracks(limit = 40) {
  if (!isLoggedIn()) return;
  const rows = db.prepare(`SELECT track_id id, track, artist, COUNT(*) n FROM plays WHERE track_id LIKE 'x:%'
    GROUP BY track_id ORDER BY n DESC LIMIT ?`).all(limit);
  const upd = db.prepare(`UPDATE OR IGNORE plays SET track_id=?, album=?, image=?, artist_id=? WHERE track_id=?`);
  const clean = (x) => x.replace(/["\\]/g, ' ');
  for (const r of rows) {
    let t = null;
    try {
      const q = `track:"${clean(r.track)}" artist:"${clean(r.artist)}"`;
      t = (await api('/search', { q, type: 'track', limit: 1 }))?.tracks?.items?.[0];
      if (!t) t = (await api('/search', { q: `${r.track} ${r.artist}`, type: 'track', limit: 1 }))?.tracks?.items?.[0];
    } catch (e) { console.error('track lookup failed:', e.message); return; }
    if (!t) { // not found: keep the row but stop retrying it
      db.prepare(`UPDATE plays SET track_id=? WHERE track_id=?`).run('n:' + r.id.slice(2), r.id);
      continue;
    }
    upd.run(t.id, t.album?.name ?? null, t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? null,
      t.artists[0]?.id ?? null, r.id);
    const y = parseInt(t.album?.release_date ?? '', 10);
    if (y) insertYear.run(t.id, y);
  }
}
