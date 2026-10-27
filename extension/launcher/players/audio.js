// Pioneer TV audio player: a queue of songs, played here, in the page's own
// <audio>: the music lives only as long as the page (leaving it, Home
// included, stops it). "Spelas nu" covers the page while it plays; B goes
// back to browsing and X brings it back; what plays shows small in the
// heading meanwhile, and its row in a list is marked. Styled by audio.css.
//
// A song: { id, name, artist, album, seconds, cover, thumb, stream }. The
// library says where it comes from and who hears of it:
//
//   M.players.audio.source = { report(what, song, seconds), played(song) }
//   M.players.audio.play(songs, index)
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const V = M.views;
  const el = V.el;
  const STALL_MS = 10000;
  const SKIP_AFTER_ERROR_MS = 3000;

  const clock = (s) => {
    if (s == null || !isFinite(s)) return '';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

  // ------------------------------------------------------------ its parts of the page
  let audio = null, np = null, mini = null;
  const part = {};
  function build() {
    if (audio) return;
    audio = el('audio');
    audio.preload = 'auto';
    audio.id = 'audio';
    document.body.appendChild(audio);
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
    listen();
  }

  // ------------------------------------------------------------ the queue
  const player = {
    source: { report() {}, played() {} },
    queue: [], index: -1, started: false, stall: null, lastReport: 0,
    song() { return this.queue[this.index] || null; },

    play(list, index) {
      build();
      this.stopReport();
      this.queue = list;
      this.load(index);
      nowPlaying.open();
    },

    load(index, at = 0) {
      if (index < 0 || index >= this.queue.length) return;
      if (index !== this.index) { this.stopReport(); this.started = false; }
      this.index = index;
      audio.src = this.song().stream;
      if (at) audio.addEventListener('loadedmetadata', () => { audio.currentTime = at; }, { once: true });
      setState('Laddar…');
      audio.play().catch((e) => { if (e.name !== 'AbortError') setState('Ljudet kunde inte startas', true); });
      nowPlaying.render();
      changed();
    },

    toggle() {
      if (!this.song()) return;
      if (audio.paused) audio.play().catch(() => setState('Ljudet kunde inte startas', true));
      else audio.pause();
    },
    next() {
      if (this.index < this.queue.length - 1) this.load(this.index + 1);
      else { audio.pause(); this.stopReport(); setState('Slut på kön'); }
    },
    // Back to the start of the song, or to the one before when near its start.
    prev() {
      if (audio.currentTime > 3 || this.index === 0) audio.currentTime = 0;
      else this.load(this.index - 1);
    },
    seek(by) {
      if (!this.song() || !isFinite(audio.duration)) return;
      audio.currentTime = Math.max(0, Math.min(audio.duration - 1, audio.currentTime + by));
    },
    stopReport() {
      const s = this.song();
      if (s && this.started) this.source.report('stop', s, audio.currentTime);
      this.started = false;
    },
    // The legend's part while something plays.
    legend() { return this.song() ? [['X', 'spelas nu'], ['L1', ''], ['R1', 'föregående · nästa']] : []; },
    open() { nowPlaying.open(); },
  };

  function setState(text, error) {
    part.state.textContent = text || '';
    part.state.classList.toggle('fel', !!error);
  }

  function listen() {
    audio.addEventListener('playing', () => {
      clearTimeout(player.stall);
      setState('');
      const s = player.song();
      if (s && !player.started) {
        player.started = true;
        player.lastReport = Date.now();
        player.source.report('start', s, audio.currentTime);
      }
    });
    audio.addEventListener('pause', () => { if (!audio.ended && player.song()) setState('Pausad'); });
    audio.addEventListener('ended', () => {
      if (player.song()) player.source.played(player.song());
      player.next();
    });
    audio.addEventListener('timeupdate', () => {
      nowPlaying.progress();
      const s = player.song();
      if (s && player.started && Date.now() - player.lastReport > 30000) {
        player.lastReport = Date.now();
        player.source.report('progress', s, audio.currentTime);
      }
    });
    // A song the source cannot give us: say so and go on to the next.
    audio.addEventListener('error', () => {
      if (!player.song() || !audio.getAttribute('src')) return;
      clearTimeout(player.stall);
      setState('Låten kunde inte spelas', true);
      const at = player.index;
      setTimeout(() => { if (player.index === at) player.next(); }, SKIP_AFTER_ERROR_MS);
    });
    // A stream that stops coming (the network dropped a moment): pick the
    // song up again from where it was.
    audio.addEventListener('waiting', () => {
      clearTimeout(player.stall);
      const at = player.index, pos = audio.currentTime;
      player.stall = setTimeout(() => {
        if (player.index !== at || audio.paused || audio.readyState >= 3) return;
        console.warn('audio: stalled, reloading at', pos);
        player.load(at, pos);
      }, STALL_MS);
    });
    window.addEventListener('pagehide', () => player.stopReport());
  }

  // What plays: small in the heading, and its row marked in a list.
  function markPlaying() {
    const id = player.song() && player.song().id;
    for (const r of document.querySelectorAll('[data-song]')) r.classList.toggle('playing', r.dataset.song === id);
  }
  M.bridge.on('browse:drawn', markPlaying);
  function changed() {
    const s = player.song();
    mini.hidden = !s;
    mini.innerHTML = '';
    if (s) {
      if (s.thumb) { const img = el('img'); img.src = s.thumb; img.alt = ''; mini.appendChild(img); }
      mini.appendChild(el('span', '', `${s.name} – ${s.artist}`));
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
      if (!player.song()) return;
      np.hidden = false;
      M.nav.captured = this;
      this.render();
    },
    close() {
      np.hidden = true;
      if (M.nav.captured === this) M.nav.captured = null;
      const row = document.querySelector('.view [data-song].playing');
      if (row && !(M.browse && M.browse.view.contains(document.activeElement))) M.nav.focus(row);
    },
    render() {
      const s = player.song();
      if (!s) return;
      part.cover.innerHTML = '';
      if (s.cover) { const img = el('img'); img.src = s.cover; img.alt = ''; part.cover.appendChild(img); }
      part.title.textContent = s.name;
      part.artist.textContent = s.artist;
      part.album.textContent = s.album;
      part.label.textContent = `Spelas nu · ${player.index + 1} av ${player.queue.length}`;
      part.len.textContent = clock(s.seconds);
      part.queue.innerHTML = '';
      for (const next of player.queue.slice(player.index + 1, player.index + 7)) {
        const li = el('li');
        li.appendChild(el('b', '', next.name));
        li.appendChild(el('span', '', next.artist));
        part.queue.appendChild(li);
      }
      if (!part.queue.children.length) part.queue.appendChild(el('li', 'empty', 'Inget mer i kön'));
      V.legend(part.legend, [['A', 'paus · spela'], ['L1', ''], ['R1', 'föregående · nästa'], ['◀ ▶', 'spola'], ['B', 'bläddra']]);
      this.progress();
    },
    progress() {
      const s = player.song();
      const len = isFinite(audio.duration) ? audio.duration : (s && s.seconds) || 0;
      part.pos.textContent = clock(audio.currentTime || 0);
      if (len) part.len.textContent = clock(len);
      part.bar.style.width = len ? `${Math.min(100, (audio.currentTime / len) * 100)}%` : '0';
    },
    onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') { if (!e.repeat) player.toggle(); }
      else if (e.key === 'Tab') { if (!e.repeat) (e.shiftKey ? player.prev() : player.next()); }
      else if (e.key === 'ArrowLeft') player.seek(-10);
      else if (e.key === 'ArrowRight') player.seek(10);
      else if (e.key === 'Escape') this.close();
    },
  };
  // The keyboard takes the pad while open; it comes back here.
  M.bridge.on('keyboard:close', () => { if (nowPlaying.isOpen() && !M.nav.captured) M.nav.captured = nowPlaying; });

  player.nowPlaying = nowPlaying;
  M.players = M.players || {};
  M.players.audio = player;
})(window.PioneerTV);
