import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';

mkdirSync('data', { recursive: true });
export const db = new DatabaseSync('data/wrapped.db');

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS plays (
    played_at   TEXT NOT NULL,          -- ISO timestamp (when the play ended)
    track_id    TEXT NOT NULL,          -- spotify track id
    track       TEXT NOT NULL,
    artist      TEXT NOT NULL,          -- primary artist name
    artist_id   TEXT,
    album       TEXT,
    image       TEXT,
    ms_played   INTEGER,
    source      TEXT NOT NULL DEFAULT 'live',   -- 'live' | 'import'
    PRIMARY KEY (played_at, track_id)
  );
  CREATE INDEX IF NOT EXISTS idx_plays_artist ON plays(artist);

  CREATE TABLE IF NOT EXISTS artist_info (
    name    TEXT PRIMARY KEY,
    id      TEXT,
    genres  TEXT NOT NULL DEFAULT '[]',
    image   TEXT,
    checked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS track_meta (
    track_id TEXT PRIMARY KEY,
    year     INTEGER NOT NULL            -- release year; 0 = looked up, unknown
  );

  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
`);

export const getKV = (k) => db.prepare('SELECT value FROM kv WHERE key = ?').get(k)?.value ?? null;
export const setKV = (k, v) =>
  db.prepare('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(k, String(v));
export const delKV = (k) => db.prepare('DELETE FROM kv WHERE key = ?').run(k);
