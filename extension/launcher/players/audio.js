// Pioneer TV audio player, the pages' part: the sound itself is the
// daemon's (daemon/pioneertv/audio.py, an mpv of its own), so the music
// plays on from page to page and under the screensaver, until something
// else plays. Here a queue of songs is handed to it, and what plays is
// shown: "Spelas nu" over the page (B goes back to browsing, X brings it
// back), small in the heading meanwhile, and its row in a list marked.
// The radio page shows a channel the same way (radio/radio.js). Styled by
// audio.css.
//
// A song: { id, name, artist, album, seconds, cover, thumb }.
//
//   M.players.audio.play(songs, index)
//   M.players.audio.state                 the daemon's "audio" event, last heard
//   M.players.audio.ask(action, body)     toggle, next, prev, seek {by}, to {at}, stop
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const V = M.views;
  const el = V.el;
  const SEEK = 15;                       // seconds a press of left or right seeks

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
    build();
    changed();
    if (nowPlaying.isOpen()) { if (state.state === 'idle') nowPlaying.close(); else nowPlaying.render(); }
  }
  // Where it is now: what was said, and the time since if it plays.
  const now = () => (state.time || 0) + (state.state === 'playing' ? (Date.now() - heardAt) / 1000 : 0);
  M.bridge.on('audio', heard);
  fetch('/api/audio').then((r) => r.json()).then((s) => { if (s && s.state && !heardAt) heard(s); }).catch(() => {});

  // ------------------------------------------------------------ its parts of the page
  let np = null, mini = null;
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
          <div class="np-progress"><div class="np-bar" data-part="bar"></div></div>
          <p class="np-times"><span data-part="pos">0:00</span><span class="np-state" data-part="state"></span><span data-part="len"></span></p>
        </div>
        <aside class="np-queue">
          <p class="section-label">Näst på tur</p>
          <ol data-part="queue"></ol>
        </aside>
      </div>
      <footer class="legend" data-part="legend"></footer>`;
    np.querySelectorAll('[data-part]').forEach((n) => { part[n.dataset.part] = n; });
    document.body.appendChild(np);
    mini = el('button', 'np-mini');
    mini.type = 'button';
    mini.hidden = true;
    mini.addEventListener('click', () => nowPlaying.open());
    if (M.browse && M.browse.head) M.browse.head.appendChild(mini);
    else document.body.appendChild(mini);
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
    // The legend's part while something plays.
    legend() { return state.state !== 'idle' ? [['X', 'spelas nu'], ['L1', ''], ['R1', 'föregående · nästa']] : []; },
    open() { nowPlaying.open(); },
  };

  // What plays: small in the heading, and its row marked in a list.
  function markPlaying() {
    const id = player.song() && player.song().id;
    for (const r of document.querySelectorAll('[data-song]')) r.classList.toggle('playing', r.dataset.song === id);
  }
  M.bridge.on('browse:drawn', markPlaying);
  let shown = '';
  function changed() {
    const it = state.state !== 'idle' ? state.item : null;
    const key = JSON.stringify([it && (it.id || it.channel), state.state]);
    if (key === shown) return;
    shown = key;
    if (M.browse && M.browse.head && mini.parentNode !== M.browse.head) M.browse.head.appendChild(mini);
    mini.hidden = !it;
    mini.innerHTML = '';
    if (it) {
      if (it.thumb || it.cover) { const img = el('img'); img.src = it.thumb || it.cover; img.alt = ''; mini.appendChild(img); }
      mini.appendChild(el('span', '', it.artist ? `${it.name} – ${it.artist}` : it.name));
    }
    markPlaying();
    if (M.browse) M.browse.legend();
  }

  // ------------------------------------------------------------ Spelas nu
  // Over the whole page, holding the pad while open: A or X pauses, L1/R1
  // skip, left/right seek, B goes back to browsing (the music plays on).
  const nowPlaying = {
    isOpen() { return !!np && !np.hidden; },
    open() {
      if (state.state === 'idle') return;
      build();
      np.hidden = false;
      M.nav.captured = this;
      this.render();
    },
    close() {
      if (!np) return;
      np.hidden = true;
      if (M.nav.captured === this) M.nav.captured = null;
      const row = document.querySelector('.view [data-song].playing');
      if (row && !(M.browse && M.browse.view.contains(document.activeElement))) M.nav.focus(row);
    },
    render() {
      const it = state.item;
      if (!it) return;
      part.cover.innerHTML = '';
      if (it.cover) { const img = el('img'); img.src = it.cover; img.alt = ''; part.cover.appendChild(img); }
      part.title.textContent = it.name || '';
      part.artist.textContent = it.artist || '';
      part.album.textContent = it.album || '';
      part.label.textContent = state.kind === 'radio' ? 'Radio · direkt' : `Spelas nu · ${state.index + 1} av ${state.count}`;
      part.state.textContent = state.state === 'paused' ? 'Pausad' : state.state === 'loading' ? 'Laddar…' : '';
      part.queue.innerHTML = '';
      for (const next of state.next || []) {
        const li = el('li');
        li.appendChild(el('b', '', next.name));
        li.appendChild(el('span', '', next.artist || ''));
        part.queue.appendChild(li);
      }
      if (!part.queue.children.length) part.queue.appendChild(el('li', 'empty', state.kind === 'radio' ? 'Direktsänt' : 'Inget mer i kön'));
      V.legend(part.legend, state.kind === 'radio'
        ? [['A', 'paus · spela'], ['B', 'bläddra']]
        : [['A', 'paus · spela'], ['L1', ''], ['R1', 'föregående · nästa'], ['◀ ▶', `spola ${SEEK} s`], ['B', 'bläddra']]);
      this.progress();
    },
    progress() {
      const len = state.duration || (state.item && state.item.seconds) || 0;
      const at = now();
      part.pos.textContent = state.live ? 'Direkt' : clock(at);
      part.len.textContent = state.live ? '' : clock(len);
      part.bar.style.width = len ? `${Math.min(100, (at / len) * 100)}%` : state.live ? '100%' : '0';
    },
    onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') { if (!e.repeat) player.toggle(); }
      else if (e.key === 'Tab') { if (!e.repeat) (e.shiftKey ? player.prev() : player.next()); }
      else if (e.key === 'ArrowLeft') player.seek(-SEEK);
      else if (e.key === 'ArrowRight') player.seek(SEEK);
      else if (e.key === 'Escape') this.close();
    },
  };
  // The keyboard takes the pad while open; it comes back here.
  M.bridge.on('keyboard:close', () => { if (nowPlaying.isOpen() && !M.nav.captured) M.nav.captured = nowPlaying; });

  player.nowPlaying = nowPlaying;
  M.players = M.players || {};
  M.players.audio = player;
})(window.PioneerTV);
