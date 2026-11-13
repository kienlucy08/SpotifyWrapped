const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
let range = 'year';
let spotifyTop = { type: 'artists', time_range: 'long_term' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n).toLocaleString();
const hours = (ms) => (ms / 36e5).toFixed(ms >= 36e6 ? 0 : 1);
const img = (src) => (src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '<div class="ph"></div>');
const rows = (items, { artist = false } = {}) => `<ol>${items.map((x, i) => `
  <li class="row ${artist ? 'artist' : ''} ${i === 0 ? 'first' : ''}">${img(x.image)}
    <div class="t"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></div>
    <div class="n">${x.n != null ? `${fmt(x.n)} <small>plays</small>` : ''}</div></li>`).join('')}</ol>`;

async function json(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(r.status); return r.json(); }

async function render(flash = false) {
  const status = await json('/api/status');
  if (!status.configured) return (app.innerHTML = `<div class="card"><h2>Setup needed</h2>
    <p>Add <code>SPOTIFY_CLIENT_ID</code> and <code>SPOTIFY_CLIENT_SECRET</code> to <code>.env</code> and restart the server. See the README.</p></div>`);
  if (!status.loggedIn) return (app.innerHTML = `<div class="card hero"><h2>Welcome</h2>
    <div class="big">Connect Spotify</div><p>We'll start recording every play from the moment you connect.</p>
    <a class="cta" href="/login">Log in with Spotify</a></div>`);

  const s = await json(`/api/stats?range=${range}`);
  const t = s.totals;
  const sparse = s.dataSpan.total < 50;
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const max = (a) => Math.max(1, ...a);
  const mx = max(s.byMonth.map((m) => m.plays));
  const topGenre = s.topGenres[0];

  app.innerHTML = `
    ${sparse ? `<div class="note card">Only ${s.dataSpan.total} plays recorded so far. Spotify's API exposes just your last 50 plays, so full counts build up from today onward.
      Import your Spotify data export (<code>npm run import</code>) to backfill the past year. Meanwhile, see Spotify's own rankings below.</div>` : ''}

    <section class="card hero s8 ${flash ? 'flash' : ''}">
      <h2>You listened for</h2>
      <div class="big">${fmt(t.minutes)}</div><div>minutes · ${hours(t.ms)} hours</div>
      <div class="stats">
        <div class="stat"><b>${fmt(t.plays)}</b><span>plays</span></div>
        <div class="stat"><b>${fmt(t.tracks)}</b><span>different songs</span></div>
        <div class="stat"><b>${fmt(t.artists)}</b><span>artists</span></div>
        <div class="stat"><b>${fmt(t.days)}</b><span>days listened</span></div>
        <div class="stat"><b>${s.longestStreak}</b><span>day best streak</span></div>
      </div>
    </section>

    <section class="card s4"><h2>Now playing</h2><div id="now" class="muted">Nothing playing</div>
      <h2 style="margin-top:24px">Top genre</h2>
      <div class="big" style="font-size:34px;letter-spacing:-1px">${topGenre ? esc(topGenre.name) : '—'}</div></section>

    <section class="card s6"><h2>Top songs</h2>
      ${s.topTracks.length ? rows(s.topTracks.slice(0, 10).map((x) => ({ title: x.track, sub: x.artist, image: x.image, n: x.plays }))) : '<p class="muted">No plays yet.</p>'}</section>

    <section class="card s6"><h2>Top artists</h2>
      ${s.topArtists.length ? rows(s.topArtists.slice(0, 10).map((x) => ({ title: x.name, sub: `${hours(x.ms)} hrs`, image: x.image, n: x.plays })), { artist: true }) : '<p class="muted">No plays yet.</p>'}</section>

    <section class="card s6"><h2>Top genres</h2>
      ${s.topGenres.map((g) => `<div class="genre"><div style="display:flex;justify-content:space-between"><span>${esc(g.name)}</span><span class="muted">${fmt(g.plays)}</span></div>
        <div class="bar" style="width:${(g.plays / s.topGenres[0].plays) * 100}%"></div></div>`).join('') || '<p class="muted">Genres appear once artists are looked up.</p>'}
      ${s.genreCoverage < 0.9 ? `<p class="muted">Genre data covers ${(s.genreCoverage * 100).toFixed(0)}% of plays so far (still looking up artists).</p>` : ''}</section>

    <section class="card s6"><h2>Top albums</h2>
      ${s.topAlbums.length ? rows(s.topAlbums.slice(0, 5).map((x) => ({ title: x.album, sub: x.artist, image: x.image, n: x.plays }))) : '<p class="muted">No plays yet.</p>'}</section>

    <section class="card s6"><h2>When you listen · hour of day</h2>
      <div class="bars">${s.byHour.map((n) => `<div title="${n}" style="height:${(n / max(s.byHour)) * 100}%"></div>`).join('')}</div>
      <div class="axis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div></section>

    <section class="card s6"><h2>Day of week</h2>
      <div class="bars green">${s.byWeekday.map((n) => `<div title="${n}" style="height:${(n / max(s.byWeekday)) * 100}%"></div>`).join('')}</div>
      <div class="axis">${dayLabels.map((d) => `<span>${d}</span>`).join('')}</div></section>

    <section class="card s8"><h2>Month by month</h2>
      <div class="bars">${s.byMonth.map((m) => `<div title="${m.m}: ${m.plays} plays" style="height:${(m.plays / mx) * 100}%"></div>`).join('')}</div>
      <div class="axis"><span>${s.byMonth[0]?.m ?? ''}</span><span>${s.byMonth.at(-1)?.m ?? ''}</span></div></section>

    <section class="card s4"><h2>Biggest day</h2>
      ${s.topDay ? `<div class="big" style="font-size:40px">${esc(s.topDay.day)}</div><p>${hours(s.topDay.ms)} hours · ${fmt(s.topDay.plays)} plays</p>` : '<p class="muted">—</p>'}</section>

    <section class="card s6"><h2>Spotify's own picks <span class="tabs" id="sTabs"></span></h2><div id="sTop" class="muted">Loading…</div></section>

    <section class="card s6"><h2>Recently played</h2>
      ${rows(s.recent.map((x) => ({ title: x.track, sub: x.artist, image: x.image }))).replace(/<li class="row/g, '<li class="row').replace(/counter/g, 'counter')}</section>

    <p class="muted" style="grid-column:1/-1">Recording since ${s.dataSpan.first ? new Date(s.dataSpan.first).toLocaleDateString() : '—'} ·
      <a href="#" id="logout" class="muted">disconnect</a></p>`;

  $('#logout').onclick = async (e) => { e.preventDefault(); await fetch('/logout', { method: 'POST' }); render(); };
  renderSpotifyTop();
  pollNow();
}

async function renderSpotifyTop() {
  const tabs = $('#sTabs'); if (!tabs) return;
  const mk = (label, key, val) => `<button data-k="${key}" data-v="${val}" class="${spotifyTop[key] === val ? 'on' : ''}">${label}</button>`;
  tabs.innerHTML = mk('Artists', 'type', 'artists') + mk('Tracks', 'type', 'tracks') + ' · ' +
    mk('4 wks', 'time_range', 'short_term') + mk('6 mo', 'time_range', 'medium_term') + mk('1 yr', 'time_range', 'long_term');
  tabs.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; spotifyTop[b.dataset.k] = b.dataset.v; renderSpotifyTop(); };
  try {
    const items = await json(`/api/spotify-top/${spotifyTop.type}?time_range=${spotifyTop.time_range}`);
    $('#sTop').innerHTML = rows(items.slice(0, 10).map((x) => ({ title: x.name, sub: x.sub, image: x.image })), { artist: spotifyTop.type === 'artists' });
  } catch { $('#sTop').textContent = 'Could not load.'; }
}

async function pollNow() {
  const el = $('#now'); if (!el) return;
  try {
    const n = await json('/api/now-playing');
    el.innerHTML = n.playing ? `<div class="now">${img(n.image)}<div class="t" style="flex:1"><b>${esc(n.track)}</b><span>${esc(n.artist)}</span>
      <div class="prog"><i style="width:${(n.progress / n.duration) * 100}%"></i></div></div></div>` : 'Nothing playing';
  } catch { /* ignore */ }
}
setInterval(pollNow, 10_000);

$('#ranges').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  range = b.dataset.r;
  $('#storyLink').href = `/story.html?range=${range}`;
  document.querySelectorAll('#ranges button').forEach((x) => x.classList.toggle('on', x === b));
  render();
};

// Live updates: the server pushes an event whenever the poller stores new plays.
const es = new EventSource('/api/events');
es.onopen = () => $('#liveDot').classList.add('live');
es.onerror = () => $('#liveDot').classList.remove('live');
es.addEventListener('update', () => render(true));

render();
