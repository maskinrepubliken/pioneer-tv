// Pioneer TV audio player, the pages' part: the sound itself is the
// daemon's (daemon/pioneertv/audio.py, an mpv of its own). Here a queue of
// songs is handed to it, and what plays is shown, "Spelas nu" over the
// page; the music plays while that is open, as a film plays while its
// window is: B leaves it and the music stops. Home over it opens its panel
// in the overlay. Styled by audio.css.
//
// A song: { id, name, artist, album, seconds, cover, thumb }.
//
//   M.players.audio.play(songs, index)
//   M.players.audio.state                 the daemon's "audio" event, last heard
//   M.players.audio.ask(action, body)     toggle, next, prev, seek {by}, to {at}, stop, shuffle, repeat, jump {index}
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const V = M.views;
  const el = V.el;
  const SEEK = 15;                       // seconds the −15 s and +15 s buttons seek

  const clock = (s) => {
    if (s == null || !isFinite(s)) return '';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

  // ------------------------------------------------------------ the daemon
  async function ask(action, body) {
    try {
      const r = await fetch(`/api/audio/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const data = await r.json();
      if (data && data.state) heard(data);
      if (data && data.ok === false) M.hud.toast(data.message === 'no_key' ? 'Jellyfin saknar nyckel' : (data.message || 'Det gick inte'), 'info');
      return data;
    } catch {
      M.hud.toast('Boxen svarar inte', 'info');
      return { ok: false };
    }
  }
  let state = { state: 'idle' };
  let heardAt = 0;
  function heard(s) {
    state = s;
    heardAt = Date.now();
    player.state = s;
    if (nowPlaying.isOpen()) { if (state.state === 'idle') nowPlaying.close(false); else nowPlaying.render(); }
  }
  // Where it is now: what was said, and the time since if it plays.
  const now = () => (state.time || 0) + (state.state === 'playing' ? (Date.now() - heardAt) / 1000 : 0);
  M.bridge.on('audio', heard);
  fetch('/api/audio').then((r) => r.json()).then((s) => { if (s && s.state && !heardAt) heard(s); }).catch(() => {});
  // The page going away: so does the music (the daemon hears the next page
  // load too).
  window.addEventListener('pagehide', () => { if (state.state !== 'idle') navigator.sendBeacon('/api/audio/stop', ''); });

  // ------------------------------------------------------------ its parts of the page
  // Spelas nu, laid out as the overlay's media panel: the cover; what plays,
  // its timeline (L2 and R2 glide a mark along it, what plays goes where
  // they are let go) and round buttons (Förra, −15 s, play or pause, +15 s,
  // Nästa); Blanda and Upprepa; at the right every song after it, A on one
  // plays it.
  const SVG = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  const GLYPH = {
    play: SVG('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
    pause: SVG('<rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/>'),
    turnBack: SVG('<path d="M5 12a7 7 0 1 0 2.05-4.95" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    turnOn: SVG('<path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    prev: SVG('<rect x="5" y="6" width="2.4" height="12" rx="1" fill="currentColor"/><path d="M19 6 9 12l10 6z" fill="currentColor"/>'),
    next: SVG('<rect x="16.6" y="6" width="2.4" height="12" rx="1" fill="currentColor"/><path d="M5 6l10 6-10 6z" fill="currentColor"/>'),
  };
  const REPEAT = { off: 'Av', all: 'Alla låtar', one: 'Den här låten' };
  let np = null;
  const part = {};
  function build() {
    if (np) return;
    np = el('section', 'np');
    np.hidden = true;
    np.innerHTML = `
      <div class="np-main">
        <div class="np-cover" data-part="cover"></div>
        <div class="np-text">
          <p class="section-label" data-part="label">Spelas nu</p>
          <h1 class="np-title" data-part="title"></h1>
          <p class="np-artist" data-part="artist"></p>
          <p class="np-album" data-part="album"></p>
          <div class="np-timeline" data-part="timeline">
            <div class="np-track"><div class="np-bar" data-part="bar"></div><div class="np-mark" data-part="mark"><span data-part="bubble"></span></div></div>
            <p class="np-times"><span data-part="pos">0:00</span><span class="np-hint" data-part="hint">L2 ◀ ▶ R2</span><span data-part="len"></span></p>
          </div>
          <div class="np-transport" data-part="transport"></div>
          <div class="np-modes" data-part="modes"></div>
        </div>
        <aside class="np-queue">
          <p class="section-label" data-part="queuehead">Näst på tur</p>
          <ol data-part="queue"></ol>
        </aside>
      </div>
      <footer class="legend" data-part="legend"></footer>`;
    np.querySelectorAll('[data-part]').forEach((n) => { part[n.dataset.part] = n; });
    const round = (glyph, says, run, cls = '') => {
      const btn = el('button', `np-btn ${cls}`);
      btn.type = 'button';
      btn.innerHTML = `<span class="np-ring">${GLYPH[glyph]}</span>`;
      btn.appendChild(el('span', 'np-says', says));
      btn.addEventListener('click', run);
      return btn;
    };
    part.play = round('play', 'Spela', () => player.toggle(), 'np-play');
    part.transport.append(
      round('prev', 'Förra', () => player.prev()), round('turnBack', '15 s', () => player.seek(-SEEK)),
      part.play,
      round('turnOn', '15 s', () => player.seek(SEEK)), round('next', 'Nästa', () => player.next()));
    const mode = (icon, label, action) => {
      const btn = el('button', 'np-mode');
      btn.type = 'button';
      btn.innerHTML = `<span class="np-mode-icon">${M.icons.html(icon)}</span>`;
      btn.append(el('span', 'np-mode-label', label), el('span', 'np-mode-value', ''));
      btn.addEventListener('click', () => ask(action));
      return btn;
    };
    part.shuffle = mode('shuffle', 'Blanda', 'shuffle');
    part.repeat = mode('repeat', 'Upprepa', 'repeat');
    part.modes.append(part.shuffle, part.repeat);
    document.body.appendChild(np);
    setInterval(() => { if (nowPlaying.isOpen() && state.state === 'playing') nowPlaying.progress(); }, 500);
  }

  // ------------------------------------------------------------ the queue
  const player = {
    state,
    ask,
    song() { return state.kind === 'music' && state.state !== 'idle' ? state.item : null; },
    play(list, index) {
      const queue = list.map(({ id, name, artist, album, seconds, cover, thumb }) => ({ id, name, artist, album, seconds, cover, thumb }));
      ask('play', { queue, index }).then((r) => { if (r.ok) nowPlaying.open(); });
    },
    toggle() { if (state.state !== 'idle') ask('toggle'); },
    next() { if (this.song()) ask('next'); },
    prev() { if (this.song()) ask('prev'); },
    seek(by) { if (this.song()) ask('seek', { by }); },
  };

  // ------------------------------------------------------------ Spelas nu
  // Over the whole page, holding the pad while open. The d-pad goes between
  // its buttons and down into the list; A presses what is marked, X plays
  // or pauses wherever the mark is, L2 and R2 seek, B goes back to browsing
  // and the music stops.
  let at = null;                   // the marked button or row
  const length = () => state.duration || (state.item && state.item.seconds) || 0;
  const nowPlaying = {
    noKeyboard: true,                // Y (Sök) does nothing over it (main.js)
    isOpen() { return !!np && !np.hidden; },
    open() {
      if (state.state === 'idle') return;
      build();
      np.hidden = false;
      M.nav.captured = this;
      this.render();
      mark(part.play);
    },
    // stop: the music stops with it (not when it closes because it did).
    close(stop = true) {
      if (!np || np.hidden) return;
      np.hidden = true;
      scrub = null; target = null;
      if (M.nav.captured === this) M.nav.captured = null;
      if (stop && state.state !== 'idle') ask('stop');
    },
    render() {
      const it = state.item;
      if (!it) return;
      if (part.cover.dataset.src !== (it.cover || '')) {
        part.cover.dataset.src = it.cover || '';
        part.cover.innerHTML = '';
        if (it.cover) { const img = el('img'); img.src = it.cover; img.alt = ''; part.cover.appendChild(img); }
      }
      part.title.textContent = it.name || '';
      part.artist.textContent = it.artist || '';
      part.album.textContent = it.album || '';
      part.label.textContent = [state.state === 'paused' ? 'Pausad' : state.state === 'loading' ? 'Laddar…' : 'Spelas nu',
        state.count > 1 ? `låt ${state.index + 1} av ${state.count}` : ''].filter(Boolean).join(' · ');
      const playing = state.state === 'playing' || state.state === 'loading';
      part.play.querySelector('.np-ring').innerHTML = GLYPH[playing ? 'pause' : 'play'];
      part.play.querySelector('.np-says').textContent = playing ? 'Pausa' : 'Spela';
      part.shuffle.querySelector('.np-mode-value').textContent = state.shuffle ? 'På' : 'Av';
      part.repeat.querySelector('.np-mode-value').textContent = REPEAT[state.repeat] || 'Av';
      // Every song after it (the daemon names up to a hundred; with Upprepa
      // on the whole queue, round again from the first).
      const next = state.next || [];
      const left = next.reduce((n, s) => n + (s.seconds || 0), 0);
      part.queuehead.textContent = next.length ? `Näst på tur · ${next.length === 1 ? '1 låt' : `${next.length} låtar`}${left ? ` · ${Math.round(left / 60)} min` : ''}` : 'Näst på tur';
      const was = at && at.dataset.n;
      part.queue.innerHTML = '';
      next.forEach((song, i) => {
        const li = el('li');
        const row = el('button', 'np-song');
        row.type = 'button';
        row.dataset.n = String(i);
        const place = song.index != null ? song.index : state.index + 1 + i;
        row.append(el('span', 'np-song-n', String(place + 1)), el('b', '', song.name), el('span', 'np-song-artist', song.artist || ''),
          el('span', 'np-song-len', clock(song.seconds)));
        row.addEventListener('click', () => ask('jump', { index: place }));
        li.appendChild(row);
        part.queue.appendChild(li);
      });
      if (!next.length) part.queue.appendChild(el('li', 'empty', state.repeat === 'one' ? 'Den här låten igen' : 'Inget mer i kön'));
      if (was != null) mark(part.queue.querySelector(`[data-n="${was}"]`) || part.queue.querySelector('.np-song') || part.play);
      V.legend(part.legend, [['arrows', 'välj'], ['A', 'tryck'], ['X', 'paus · spela'], ['L2', ''], ['R2', 'spola'], ['B', 'bläddra']]);
      this.progress();
    },
    progress() {
      const len = length();
      const shown = target != null ? target : nowTime();
      part.pos.textContent = clock(nowTime());
      part.len.textContent = len ? `−${clock(Math.max(0, len - nowTime()))}` : '';
      part.bar.style.width = len ? `${Math.min(100, (nowTime() / len) * 100)}%` : '0';
      part.timeline.classList.toggle('marking', target != null);
      if (target != null && len) {
        part.mark.style.left = `${(shown / len) * 100}%`;
        part.bubble.textContent = clock(shown);
      }
      part.hint.textContent = target != null ? 'släpp så hoppar den hit' : 'L2 ◀ ▶ R2';
    },
    onKeyDown(e) {
      if (e.key === ' ') { if (!e.repeat) player.toggle(); return; }
      if (e.key === 'Escape') { this.close(); return; }
      if (e.key === 'Enter') { if (!e.repeat && at) at.click(); return; }
      if (e.key.startsWith('Arrow')) move(e.key);
    },
  };
  const nowTime = () => now();

  // The mark: one button or row at a time, the d-pad to the nearest that way.
  function mark(node) {
    if (!node) return;
    if (at) at.classList.remove('np-on');
    at = node;
    at.classList.add('np-on');
    if (at.classList.contains('np-song')) at.scrollIntoView({ block: 'nearest' });
  }
  function move(key) {
    const all = [...np.querySelectorAll('.np-btn, .np-mode, .np-song')];
    if (!at) return mark(part.play);
    const a = at.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, score = Infinity;
    for (const n of all) {
      if (n === at) continue;
      const r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const along = { ArrowUp: ay - y, ArrowDown: y - ay, ArrowLeft: ax - x, ArrowRight: x - ax }[key];
      if (along < 4) continue;
      const across = key === 'ArrowUp' || key === 'ArrowDown' ? Math.abs(x - ax) : Math.abs(y - ay);
      const s = along + across * 2;
      if (s < score) { score = s; best = n; }
    }
    if (best) { mark(best); if (M.sound) M.sound.tick(key); }
  }

  // L2 and R2 (the daemon's seek: a direction and how hard; the page's
  // while no menu of the overlay is open): the mark on the timeline glides,
  // the harder the faster, and what plays goes where they are let go; a
  // short light touch is ten seconds. As the overlay's media panel.
  let scrub = null, target = null;
  M.bridge.on('seek', (e) => {
    if (!nowPlaying.isOpen() || !length()) return;
    const amount = Math.max(0, Math.min(1, Number(e.amount) || 0));
    if (amount > 0) {
      if (!scrub) scrub = { from: now(), at: performance.now() };
      scrub.dir = e.dir < 0 ? -1 : 1;
      scrub.amount = amount;
      if (target == null) target = now();
      return;
    }
    if (!scrub) return;
    const { from, dir } = scrub;
    scrub = null;
    let to = target == null ? now() : target;
    if (Math.abs(to - from) < 3) to = from + dir * 10;
    target = null;
    ask('to', { at: Math.max(0, Math.min(length() - 1, to)) });
    nowPlaying.progress();
  });
  setInterval(() => {
    if (!scrub || target == null || !nowPlaying.isOpen()) return;
    const t = performance.now(), dt = (t - scrub.at) / 1000;
    scrub.at = t;
    const whole = length() || 600, slow = Math.max(2, whole / 300), fast = Math.max(30, whole / 10);
    target = Math.max(0, Math.min(whole - 1, target + scrub.dir * (slow + (fast - slow) * scrub.amount * scrub.amount) * dt));
    nowPlaying.progress();
  }, 50);
  // The keyboard takes the pad while open; it comes back here.
  M.bridge.on('keyboard:close', () => { if (nowPlaying.isOpen() && !M.nav.captured) M.nav.captured = nowPlaying; });

  player.nowPlaying = nowPlaying;
  M.players = M.players || {};
  M.players.audio = player;
})(window.PioneerTV);
