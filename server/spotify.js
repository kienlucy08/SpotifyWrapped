import { randomBytes } from 'node:crypto';
import { getKV, setKV, delKV } from './db.js';

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
export const REDIRECT_URI = process.env.REDIRECT_URI || 'http://127.0.0.1:3000/callback';
const SCOPES = [
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-top-read',
  'user-read-private',
].join(' ');

const basic = () =>
  'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

export const isConfigured = () => Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
export const isLoggedIn = () => Boolean(getKV('refresh_token'));

export function loginUrl() {
  const state = randomBytes(8).toString('hex');
  setKV('oauth_state', state);
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `https://accounts.spotify.com/authorize?${p}`;
}

async function tokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token error: ${json.error_description || json.error}`);
  setKV('access_token', json.access_token);
  setKV('expires_at', Date.now() + (json.expires_in - 60) * 1000);
  if (json.refresh_token) setKV('refresh_token', json.refresh_token);
}

export async function handleCallback(code, state) {
  if (!state || state !== getKV('oauth_state')) throw new Error('State mismatch');
  delKV('oauth_state');
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI });
}

export function logout() {
  ['access_token', 'expires_at', 'refresh_token'].forEach(delKV);
}

async function accessToken() {
  if (Date.now() < Number(getKV('expires_at') || 0)) return getKV('access_token');
  const refresh = getKV('refresh_token');
  if (!refresh) throw new Error('Not logged in');
  await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  return getKV('access_token');
}

/** Authenticated GET against the Web API. Handles 429 rate limits with one retry. */
export async function api(path, params = {}, retry = true) {
  const url = new URL(path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (res.status === 204) return null;
  if (res.status === 429 && retry) {
    const wait = Number(res.headers.get('retry-after') || 2);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return api(path, params, false);
  }
  if (!res.ok) throw new Error(`Spotify ${res.status} on ${url.pathname}: ${await res.text()}`);
  return res.json();
}
