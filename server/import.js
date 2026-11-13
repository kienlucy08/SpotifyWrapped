// Backfill from Spotify's "Extended streaming history" (Streaming_History_Audio_*.json) or the standard
// account-data export (StreamingHistory_music_*.json, which has no track URIs: ids are synthesized, then
// resolved to real Spotify ids by the server's enrichTracks step).
// Usage: npm run import -- path/to/MyData      (a folder, or one or more .json files)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { db } from './db.js';

const inputs = process.argv.slice(2);
if (!inputs.length) { console.error('Usage: npm run import -- <folder-or-json-files>'); process.exit(1); }

const files = inputs.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p, { recursive: true }).map(String).filter((f) => /(Streaming_History_Audio|StreamingHistory_music).*\.json$/.test(f)).map((f) => join(p, f))
    : [p]);
if (!files.length) { console.error('No Streaming_History_Audio_*.json or StreamingHistory_music_*.json files found.'); process.exit(1); }

// Don't overlap with plays we've already captured live.
const firstLive = db.prepare("SELECT MIN(played_at) t FROM plays WHERE source='live'").get().t;
const ins = db.prepare(`INSERT OR IGNORE INTO plays
  (played_at, track_id, track, artist, album, ms_played, source) VALUES (?,?,?,?,?,?, 'import')`);

/** Map either export format to { ts (ISO UTC), id, track, artist, album, ms }, or null if not a music play. */
function normalize(r) {
  if (r.endTime) { // standard export: "2025-11-12 01:41" (UTC), no URI
    if (!r.trackName || !r.artistName) return null;
    const id = 'x:' + createHash('sha1').update(`${r.artistName}\u0000${r.trackName}`.toLowerCase()).digest('hex').slice(0, 20);
    return { ts: r.endTime.replace(' ', 'T') + ':00.000Z', id, track: r.trackName, artist: r.artistName, album: null, ms: r.msPlayed };
  }
  const uri = r.spotify_track_uri;
  if (!uri || !r.master_metadata_track_name) return null;
  return { ts: r.ts, id: uri.split(':').pop(), track: r.master_metadata_track_name,
    artist: r.master_metadata_album_artist_name, album: r.master_metadata_album_album_name, ms: r.ms_played };
}

let added = 0, skipped = 0;
db.exec('BEGIN');
for (const f of files) {
  for (const raw of JSON.parse(readFileSync(f, 'utf8'))) {
    const r = normalize(raw);
    if (!r || r.ms < 30_000 || (firstLive && r.ts >= firstLive)) { skipped++; continue; }
    added += Number(ins.run(r.ts, r.id, r.track, r.artist, r.album, r.ms).changes);
  }
  console.log(`read ${f}`);
}
db.exec('COMMIT');
console.log(`Imported ${added} plays (skipped ${skipped}: <30s, podcasts, or already covered live).`);
console.log('Artist genres/images fill in automatically the next time the server runs.');
