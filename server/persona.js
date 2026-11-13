// "Listening Sign": a zodiac-style reading derived deterministically from your stats.
// 1) Turn stats into 0..1 features. 2) Score 12 invented signs by weighting centered features. 3) Best score wins.

const clamp = (x) => Math.max(0, Math.min(1, x));
const sum = (a) => a.reduce((s, x) => s + x, 0);

export const SIGNS = [
  { id: 'moth', name: 'The Midnight Moth', glyph: '☾', element: 'Water', w: { night: 1, intensity: 0.3 },
    tagline: 'Drawn to the glow of 2 AM.',
    reading: ['The world sleeps; your headphones do not. Your best listening happens when nobody is watching.',
      '{topArtist} is your lantern. You circle it every night.'] },
  { id: 'hermit', name: 'The Loop Hermit', glyph: '∞', element: 'Earth', w: { obsession: 1, variety: -0.6 },
    tagline: 'If it works, play it again.',
    reading: ['You do not discover songs, you move in with them. "{topTrack}" has a key to your house.',
      'Others call it repetitive. You call it devotion.'] },
  { id: 'comet', name: 'The Wandering Comet', glyph: '☄', element: 'Fire', w: { variety: 1, breadth: 0.6, loyalty: -0.4 },
    tagline: 'Never the same orbit twice.',
    reading: ['You crossed {tracks} different songs this period and rarely looked back.',
      'Your queue is a map of places nobody else has been.'] },
  { id: 'sparrow', name: 'The Sunrise Sparrow', glyph: '☀', element: 'Air', w: { morning: 1, consistency: 0.3 },
    tagline: 'Soundtrack first, coffee second.',
    reading: ['Your day starts with a song before it starts with a thought.',
      'The early hours are yours, and {topArtist} keeps you company in them.'] },
  { id: 'tide', name: 'The Weekend Tide', glyph: '≈', element: 'Water', w: { weekend: 1, spike: 0.3 },
    tagline: 'Comes in Friday, goes out Monday.',
    reading: ['Your listening swells when the calendar lets it. Weekdays are just waiting.',
      'Saturday-you and Tuesday-you have very different playlists.'] },
  { id: 'metronome', name: 'The Iron Metronome', glyph: '◷', element: 'Earth', w: { consistency: 1, commute: 0.4, spike: -0.3 },
    tagline: 'Same time. Every day.',
    reading: ['You showed up on {days} different days. Music is a habit, and you keep your habits.',
      'Predictable? Reliable. The stars approve.'] },
  { id: 'volcano', name: 'The Binge Volcano', glyph: '▲', element: 'Fire', w: { spike: 1, intensity: 0.6, consistency: -0.3 },
    tagline: 'Silent for days, then everything at once.',
    reading: ['One day alone swallowed hours of your year. When you erupt, you erupt.',
      'Bystanders are advised to bring headphones.'] },
  { id: 'chameleon', name: 'The Genre Chameleon', glyph: '❖', element: 'Air', w: { breadth: 1, variety: 0.4 },
    tagline: 'Fluent in every mood.',
    reading: ['Your taste refuses a single box. {topGenre} is only one of your colors.',
      'You blend in everywhere and belong nowhere, on purpose.'] },
  { id: 'moon', name: 'The Devoted Moon', glyph: '◐', element: 'Water', w: { loyalty: 1, obsession: 0.3 },
    tagline: 'One artist holds your tides.',
    reading: ['{topArtist} is not an artist to you, they are a gravitational force.',
      'You will defend them in the comments section. Twice.'] },
  { id: 'fog', name: 'The Quiet Fog', glyph: '〰', element: 'Aether', w: { intensity: -1, night: 0.2 },
    tagline: 'Music drifts in at the edges.',
    reading: ['You listen lightly: a song here, a song there, never loud about it.',
      'Your library is a whisper. The stars lean in to hear it.'] },
  { id: 'star', name: 'The Commuter Star', glyph: '✦', element: 'Air', w: { commute: 1, consistency: 0.4 },
    tagline: 'Born between two stops.',
    reading: ['Rush hour is your concert hall. The train window is your screen.',
      'Your peak hour is {peakHour}, which is when the city moves and so do you.'] },
  { id: 'garden', name: 'The Chaos Garden', glyph: '❀', element: 'Earth', w: { variety: 0.6, consistency: -0.8, breadth: 0.5 },
    tagline: 'Wild, lovely, unplanned.',
    reading: ['No schedule, no pattern, just blooms. You listen when the mood says so.',
      'Even you could not predict your own year. We tried.'] },
];

const FORECASTS = [
  'Next period: a song you forgot will return and ruin your afternoon.',
  'Mercury is in your queue. Expect one unexpected favorite.',
  'A skipped track will be rediscovered at the worst possible moment.',
  'You will say "this is my song" at least three more times.',
  'The stars advise: add one artist you would normally scroll past.',
];

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const hourLabel = (h) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

export function computeFeatures(s, rangeDays) {
  const plays = s.totals.plays || 1;
  const H = s.byHour, share = (hs) => sum(hs.map((h) => H[h])) / plays;
  const wkShare = (s.byWeekday[0] + s.byWeekday[6]) / plays;
  const g = s.topGenres, gt = sum(g.map((x) => x.plays));
  const entropy = gt ? -sum(g.map((x) => (x.plays / gt) * Math.log(x.plays / gt))) / Math.log(Math.max(2, g.length)) : 0.5;
  return {
    night: clamp(share([22, 23, 0, 1, 2, 3, 4]) / 0.3),
    morning: clamp(share([5, 6, 7, 8, 9, 10]) / 0.3),
    commute: clamp(share([7, 8, 9, 16, 17, 18]) / 0.35),
    weekend: clamp(wkShare / 0.45),
    variety: clamp(s.totals.tracks / plays / 0.6),
    loyalty: clamp((s.topArtists[0]?.plays ?? 0) / plays / 0.12),
    obsession: clamp(sum(s.topTracks.slice(0, 5).map((t) => t.plays)) / plays / 0.1),
    consistency: clamp(s.totals.days / Math.max(1, rangeDays)),
    intensity: clamp(s.totals.minutes / Math.max(1, s.totals.days) / 180),
    breadth: clamp((entropy - 0.5) / 0.5),
    spike: clamp(((s.topDay?.ms ?? 0) / Math.max(1, s.totals.ms)) / 0.02),
  };
}

export function computePersona(s, rangeDays) {
  if (s.totals.plays < 20) return null; // not enough signal to read
  const f = computeFeatures(s, rangeDays);
  const scored = SIGNS.map((sign) => {
    const wsum = sum(Object.values(sign.w).map(Math.abs));
    const score = sum(Object.entries(sign.w).map(([k, w]) => w * (f[k] - 0.5))) / wsum;
    return { sign, score };
  }).sort((a, b) => b.score - a.score);

  const peak = s.byHour.indexOf(Math.max(...s.byHour));
  const ctx = {
    topArtist: s.topArtists[0]?.name ?? 'your favorite artist', topTrack: s.topTracks[0]?.track ?? 'that one song',
    topGenre: s.topGenres[0]?.name ?? 'your usual genre', tracks: s.totals.tracks.toLocaleString(),
    days: s.totals.days.toLocaleString(), peakHour: hourLabel(peak),
  };
  const fill = (t) => t.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? '');
  const [win, runner] = scored, last = scored.at(-1);
  const seed = hash(ctx.topArtist + ctx.topTrack);

  return {
    sign: win.sign.name, glyph: win.sign.glyph, element: win.sign.element, tagline: win.sign.tagline,
    reading: win.sign.reading.map(fill),
    forecast: FORECASTS[seed % FORECASTS.length],
    rising: runner.sign.name, rival: last.sign.name,
    luckyNumber: (s.totals.plays % 97) + 1, luckyHour: ctx.peakHour,
    traits: [
      ['Night owl', f.night], ['Explorer', f.variety], ['Devotion', f.loyalty],
      ['Consistency', f.consistency], ['Intensity', f.intensity], ['Genre range', f.breadth],
    ].map(([label, value]) => ({ label, value })),
  };
}

// ---- "Your year as a movie" ----
const MOVIES = [
  { genre: 'Heist Thriller', kw: ['hip hop', 'rap', 'trap', 'drill'], w: { intensity: 0.5, spike: 0.3 },
    title: 'The {topTrack} Job', tagline: 'One last run. Everyone has a role.' },
  { genre: 'Romantic Comedy', kw: ['pop', 'r&b', 'soul'], w: { weekend: 0.4, loyalty: 0.4 },
    title: '{topArtist}, Actually', tagline: 'Boy meets song. Song gets played 400 times.' },
  { genre: 'Coming-of-Age Indie', kw: ['indie', 'folk', 'singer-songwriter', 'bedroom', 'alt'], w: { night: 0.4, loyalty: 0.3, variety: 0.2 },
    title: 'Summer of {topTrack}', tagline: 'Everything changed. Mostly the playlist.' },
  { genre: 'Sci-Fi Epic', kw: ['electro', 'edm', 'house', 'techno', 'synth', 'ambient', 'trance', 'dance'], w: { variety: 0.4, night: 0.4 },
    title: '{topArtist}: Neon Frontier', tagline: 'In space, no one can skip your song.' },
  { genre: 'Psychological Horror', kw: ['metal', 'punk', 'hardcore', 'goth', 'emo'], w: { night: 0.5, intensity: 0.5 },
    title: 'It Follows (Your Queue)', tagline: 'The call is coming from inside the headphones.' },
  { genre: 'Road Movie', kw: ['country', 'americana', 'bluegrass', 'rock'], w: { commute: 0.5, consistency: 0.3 },
    title: 'Highway {topArtist}', tagline: 'Windows down. Volume up. No destination.' },
  { genre: 'Film Noir', kw: ['jazz', 'blues', 'lo-fi', 'trip hop', 'bossa'], w: { night: 0.6, intensity: -0.3 },
    title: 'The Long Goodbye to {topTrack}', tagline: 'It was raining. It was always raining.' },
  { genre: 'Historical Epic', kw: ['classical', 'soundtrack', 'score', 'orchestra', 'cinematic', 'post-rock'], w: { obsession: 0.3, intensity: 0.3 },
    title: 'The {topArtist} Chronicles', tagline: 'A story told in three-hour movements.' },
  { genre: 'Musical', kw: ['k-pop', 'broadway', 'show tunes', 'latin', 'j-pop', 'disco'], w: { weekend: 0.3, breadth: 0.4 },
    title: '{topArtist}! The Musical', tagline: 'Everyone starts singing. Nobody asks why.' },
  { genre: 'Sports Drama', kw: ['workout', 'edm', 'trap'], w: { morning: 0.6, consistency: 0.5 },
    title: 'Rise: The {topTrack} Story', tagline: 'Every montage starts with an alarm.' },
  { genre: 'Fantasy Adventure', kw: ['prog', 'celtic', 'power metal', 'dream pop', 'shoegaze', 'new age'], w: { breadth: 0.4, variety: 0.3 },
    title: '{topArtist} and the Forgotten Playlist', tagline: 'A quest across seventeen genres.' },
  { genre: 'Slice-of-Life Documentary', kw: [], w: { consistency: 0.6, intensity: -0.3 },
    title: 'A Year with {topArtist}', tagline: 'Quiet, steady, quietly devastating.' },
];

export function computeMovie(s, rangeDays) {
  if (s.totals.plays < 20) return null;
  const f = computeFeatures(s, rangeDays);
  const gt = sum(s.topGenres.map((g) => g.plays)) || 1;
  const scored = MOVIES.map((m) => {
    const kw = sum(s.topGenres.filter((g) => m.kw.some((k) => g.name.includes(k))).map((g) => g.plays)) / gt;
    const wsum = sum(Object.values(m.w).map(Math.abs));
    return { m, score: 2 * kw + sum(Object.entries(m.w).map(([k, w]) => w * (f[k] - 0.5))) / wsum };
  }).sort((a, b) => b.score - a.score);
  const m = scored[0].m;
  const ctx = { topArtist: s.topArtists[0]?.name ?? 'Untitled', topTrack: s.topTracks[0]?.track ?? 'Untitled' };
  const mins = Math.round(s.totals.minutes / Math.max(1, s.totals.days));
  const reasons = [['obsession', 'extreme repetition'], ['night', 'late-night behavior'], ['variety', 'reckless genre hopping'], ['intensity', 'sustained binge listening'], ['loyalty', 'unhealthy artist devotion']];
  const top = reasons.sort((a, b) => f[b[0]] - f[a[0]])[0];
  const rating = f.intensity > 0.7 || f.night > 0.7 ? 'R' : f.intensity < 0.3 && f.night < 0.3 ? 'PG' : 'PG-13';
  return {
    genre: m.genre, title: m.title.replace(/\{(\w+)\}/g, (_, k) => ctx[k]), tagline: m.tagline,
    rated: `Rated ${rating} for ${top[1]}`, runtime: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`,
    starring: s.topArtists.slice(0, 3).map((a) => a.name),
  };
}
