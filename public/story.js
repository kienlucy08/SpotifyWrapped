const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const range = params.get('range') || 'year';
const LABEL = { '30d': 'the last 30 days', '6m': 'the last 6 months', year: 'the past year', all: 'all time' };
const when = LABEL[range] || `${range}`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n).toLocaleString();
const hourLabel = (h) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
const cover = (src, round) => (src ? `<img class="cover ${round ? 'round' : ''}" src="${esc(src)}" alt="">` : '');
const list = (items, round) => `<ol>${items.map((x, i) => `<li style="--i:${i}" class="${round ? 'round' : ''}">
  ${x.image ? `<img src="${esc(x.image)}" alt="">` : '<img alt="">'}<div class="t"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></div>
  <div class="n">${fmt(x.n)}×</div></li>`).join('')}</ol>`;
const countUp = (n) => `<span data-count="${n}">0</span>`;

function buildSlides(s) {
  const t = s.totals, slides = [];
  const hrs = s.byHour, peak = hrs.indexOf(Math.max(...hrs));
  const type = peak < 5 || peak >= 22 ? 'Night owl' : peak < 11 ? 'Early bird' : peak < 17 ? 'Afternoon wanderer' : 'Evening listener';

  slides.push({ bg: ['#1db954', '#0b3d2e'], html: `
    <div class="kicker">Your Wrapped</div><div class="huge">${esc(when.replace('the ', ''))}</div>
    <div class="title">in music.</div><div class="sub">Tap to begin →</div>` });

  slides.push({ bg: ['#7c3aed', '#1e1b4b'], html: `
    <div class="kicker">You listened for</div><div class="huge">${countUp(t.minutes)}</div>
    <div class="title">minutes.</div><div class="sub">${fmt(t.plays)} plays across ${fmt(t.days)} days.<br>That's about ${(t.ms / 36e5).toFixed(0)} hours of your life, well spent.</div>` });

  if (s.topTracks[0]) {
    const x = s.topTracks[0];
    slides.push({ bg: ['#ff4d8d', '#4a0d2b'], html: `
      <div class="kicker">Your #1 song</div>${cover(x.image)}
      <div class="title">${esc(x.track)}</div><div class="sub">${esc(x.artist)}</div>
      <div class="sub">You played it <b>${countUp(x.plays)}</b> times.</div>` });
  }
  if (s.topTracks.length > 1) slides.push({ bg: ['#f97316', '#431407'], html: `
    <div class="kicker">Your top songs</div>${list(s.topTracks.slice(0, 5).map((x) => ({ title: x.track, sub: x.artist, image: x.image, n: x.plays })))}` });

  if (s.topArtists[0]) {
    const a = s.topArtists[0];
    slides.push({ bg: ['#06b6d4', '#083344'], html: `
      <div class="kicker">Your top artist</div>${cover(a.image, true)}
      <div class="title">${esc(a.name)}</div>
      <div class="sub">${countUp(a.plays)} plays · ${(a.ms / 36e5).toFixed(1)} hours</div>` });
  }
  if (s.topArtists.length > 1) slides.push({ bg: ['#eab308', '#422006'], html: `
    <div class="kicker">Your top artists</div>${list(s.topArtists.slice(0, 5).map((x) => ({ title: x.name, sub: `${(x.ms / 36e5).toFixed(1)} hours`, image: x.image, n: x.plays })), true)}` });

  if (s.topGenres[0]) slides.push({ bg: ['#22c55e', '#052e16'], html: `
    <div class="kicker">Your top genre</div><div class="huge" style="font-size:clamp(40px,14vw,84px);letter-spacing:-2px">${esc(s.topGenres[0].name)}</div>
    <div class="sub">Also on repeat:</div><div>${s.topGenres.slice(1, 7).map((g) => `<span class="pill">${esc(g.name)}</span>`).join('')}</div>` });

  if (t.plays) slides.push({ bg: ['#3b82f6', '#172554'], html: `
    <div class="kicker">When you listen</div><div class="title">${type}.</div>
    <div class="bars">${hrs.map((n, h) => `<div class="${h === peak ? 'peak' : ''}" style="--i:${h};height:${(n / Math.max(...hrs)) * 100}%"></div>`).join('')}</div>
    <div class="axis"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div>
    <div class="sub">Your peak hour is ${hourLabel(peak)}.</div>` });

  if (s.topDay) slides.push({ bg: ['#ec4899', '#500724'], html: `
    <div class="kicker">Your biggest day</div><div class="title">${esc(new Date(s.topDay.day + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))}</div>
    <div class="sub">${(s.topDay.ms / 36e5).toFixed(1)} hours, ${fmt(s.topDay.plays)} plays.</div>
    <div class="sub">Your longest streak: <b>${s.longestStreak}</b> day${s.longestStreak === 1 ? '' : 's'} in a row.</div>` });

  const la = s.listeningAge;
  if (la) {
    const decs = la.decades, mx = Math.max(...decs.map((d) => d.share));
    slides.push({ bg: ['#14b8a6', '#042f2e'], html: `
      <div class="kicker">Your listening age</div><div class="huge">${countUp(la.age)}</div>
      <div class="title">${la.age < 25 ? 'Fresh ears.' : la.age < 40 ? 'Old soul, new playlist.' : 'Vintage taste.'}</div>
      <div class="sub">Half of what you play came out in ${la.medianYear} or earlier. Your range runs from ${la.oldest} to ${la.newest}.</div>
      <div class="bars">${decs.map((d, i) => `<div class="${d.share === mx ? 'peak' : ''}" style="--i:${i * 3};height:${(d.share / mx) * 100}%"></div>`).join('')}</div>
      <div class="axis">${decs.map((d) => `<span>${d.decade}s</span>`).join('')}</div>` });
  }

  const m = s.movie;
  if (m) slides.push({ bg: ['#111827', '#7f1d1d'], dur: 9, html: `
    <div class="poster">
      <div class="kicker">Now showing</div>
      <div class="sub"><i>${esc(m.genre)}</i></div>
      <div class="title poster-title">${esc(m.title)}</div>
      <div class="sub">${esc(m.tagline)}</div>
      <div class="sub" style="margin-top:10px">Starring</div>
      <div class="cast">${m.starring.map(esc).join(' · ')}</div>
      <div class="meta"><span>${esc(m.rated)}</span><span>Runtime ${esc(m.runtime)}</span></div>
    </div>` });

  const p = s.persona;
  if (p) {
    const stars = Array.from({ length: 40 }, () => `<span style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${Math.random() * 3}s"></span>`).join('');
    slides.push({ bg: ['#312e81', '#020617'], dur: 11, html: `
      <div class="stars">${stars}</div>
      <div class="kicker" style="text-align:center">Your listening sign</div>
      <div class="glyph" style="text-align:center">${p.glyph}</div>
      <div class="title" style="text-align:center">${esc(p.sign)}</div>
      <div class="sub" style="text-align:center">${esc(p.element)} · <i>${esc(p.tagline)}</i></div>
      <div class="reading">${p.reading.map((r) => `<div>${esc(r)}</div>`).join('')}</div>
      <div class="traits">${p.traits.map((x) => `<div>${esc(x.label)}<i style="--v:${Math.round(x.value * 100)}%"></i></div>`).join('')}</div>` });
    slides.push({ bg: ['#1e1b4b', '#020617'], dur: 9, html: `
      <div class="stars">${Array.from({ length: 40 }, () => `<span style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${Math.random() * 3}s"></span>`).join('')}</div>
      <div class="kicker">The forecast</div><div class="title">${esc(p.forecast)}</div>
      <div class="facts"><span class="pill">Lucky number ${p.luckyNumber}</span><span class="pill">Lucky hour ${esc(p.luckyHour)}</span></div>
      <div class="sub">Rising sign: <b>${esc(p.rising)}</b></div><div class="sub">Rival sign: <b>${esc(p.rival)}</b></div>` });
  }

  slides.push({ bg: ['#1db954', '#0b0b12'], dur: 600, html: `
    <div class="kicker">That's a wrap</div><div class="title">${fmt(t.plays)} plays.<br>${fmt(t.artists)} artists.<br>${fmt(t.tracks)} songs.</div>
    <div class="sub">And it's still counting: this updates live.</div>
    <div><a class="cta" href="/">Open dashboard</a> <a class="cta" href="/story.html?range=${esc(range)}" style="background:#fff3;color:#fff">Replay</a></div>
    <div><a class="cta" id="save" href="#" style="background:var(--a)">⬇ Save as image</a></div>` });
  return slides;
}

let slides = [], idx = 0, holdTimer, stats;
const phone = $('#phone'), stage = $('#stage'), bars = $('#bars');

function show(i) {
  idx = Math.max(0, Math.min(slides.length - 1, i));
  const sl = slides[idx];
  phone.style.setProperty('--bg', `linear-gradient(160deg, ${sl.bg[0]}, ${sl.bg[1]})`);
  phone.style.setProperty('--a', idx % 2 ? '#fde047' : '#1ed760');
  stage.innerHTML = sl.html;
  phone.style.setProperty('--dur', `${sl.dur || 7}s`);
  [...bars.children].forEach((b, j) => { b.className = j < idx ? 'done' : j === idx ? 'cur' : ''; });
  const cur = bars.children[idx]; void cur.offsetWidth;
  cur.firstChild.onanimationend = () => idx < slides.length - 1 && show(idx + 1);
  stage.querySelectorAll('[data-count]').forEach((el) => {
    const end = +el.dataset.count, t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 1300); el.textContent = fmt(Math.round(end * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

phone.addEventListener('pointerdown', () => { holdTimer = setTimeout(() => { phone.classList.add('paused'); holdTimer = 'held'; }, 250); });
phone.addEventListener('pointerup', (e) => {
  const held = holdTimer === 'held'; clearTimeout(holdTimer); phone.classList.remove('paused');
  if (held || e.target.closest('a')) return;
  const r = phone.getBoundingClientRect();
  show(e.clientX - r.left < r.width * 0.3 ? idx - 1 : idx + 1);
});
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') show(idx + 1);
  if (e.key === 'ArrowLeft') show(idx - 1);
  if (e.key === 'Escape') location.href = '/';
});

const status = await (await fetch('/api/status')).json();
if (!status.loggedIn) { stage.innerHTML = `<div class="title">Connect Spotify first.</div><a class="cta" href="/login">Log in</a>`; }
else {
  const s = await (await fetch(`/api/stats?range=${encodeURIComponent(range)}`)).json();
  if (!s.totals.plays) stage.innerHTML = `<div class="title">No plays recorded for ${esc(when)} yet.</div><a class="cta" href="/">Back</a>`;
  else {
    stats = s;
    slides = buildSlides(s);
    bars.innerHTML = slides.map(() => '<div><i></i></div>').join('');
    show(0);
  }
}

// ---- Share image: draws a 1080x1920 poster on a canvas (text only, so no CORS-tainted images) ----
function wrap(ctx, text, x, y, maxW, lh) {
  let line = '';
  for (const word of String(text).split(' ')) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line.trim(), x, y); line = word + ' '; y += lh; } else line = test;
  }
  ctx.fillText(line.trim(), x, y); return y + lh;
}
function savePoster(s) {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), p = s.persona, font = (w, px) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#312e81'); bg.addColorStop(0.6, '#4c1d95'); bg.addColorStop(1, '#020617');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = font(700, 38); g.globalAlpha = 0.8; g.fillText(`MY WRAPPED · ${when.toUpperCase()}`, W / 2, 150); g.globalAlpha = 1;
  let y = 330;
  if (p) {
    g.font = font(400, 220); g.fillText(p.glyph, W / 2, y); y += 130;
    g.font = font(900, 84); y = wrap(g, p.sign, W / 2, y, 900, 90);
    g.font = font(500, 40); g.globalAlpha = 0.85; g.fillText(`${p.element} · ${p.tagline}`, W / 2, y); g.globalAlpha = 1; y += 120;
  }
  g.textAlign = 'left';
  const block = (label, lines, yy) => {
    g.font = font(700, 30); g.globalAlpha = 0.7; g.fillText(label.toUpperCase(), 110, yy); g.globalAlpha = 1; yy += 62;
    g.font = font(800, 52); lines.forEach((l) => { g.fillText(l.length > 30 ? l.slice(0, 29) + '…' : l, 110, yy); yy += 70; }); return yy + 30;
  };
  y = block('Top artists', s.topArtists.slice(0, 3).map((a, i) => `${i + 1}  ${a.name}`), y);
  y = block('Top songs', s.topTracks.slice(0, 3).map((t, i) => `${i + 1}  ${t.track}`), y);
  if (s.topGenres[0]) y = block('Top genre', [s.topGenres[0].name], y);
  g.font = font(900, 120); g.fillText(Number(s.totals.minutes).toLocaleString(), 110, y + 60);
  g.font = font(600, 40); g.fillText('minutes listened', 110, y + 115);
  if (s.movie) { g.textAlign = 'center'; g.font = font(600, 36); g.globalAlpha = 0.85; wrap(g, `🎬 ${s.movie.genre}: “${s.movie.title}”`, W / 2, H - 150, 900, 46); }
  c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'my-wrapped.png'; a.click(); }, 'image/png');
}
stage.addEventListener('click', (e) => { if (e.target.closest('#save')) { e.preventDefault(); savePoster(stats); } });
