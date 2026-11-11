// Pioneer TV audio player, the pages' part: the sound itself is the
// daemon's (daemon/pioneertv/audio.py, an mpv of its own). Here a queue of
// songs is handed to it, and what plays is shown, "Spelas nu" over the
// page; the music plays while that is open, as a film plays while its
// window is: B leaves it and the music stops. A or Home over it opens its
// panel in the overlay, where all that is done with it is. Styled by
// audio.css.
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
  // Spelas nu, to look at, not to work: the cover, what plays and how far,
  // every song after it. Everything one does is the overlay's media panel
  // (A or Home opens it). Behind them the cover's own colours, washed out
  // over the screen, turn slowly while it plays and rest when it pauses: a
  // tiny canvas the browser stretches (as good as a blur, and free) turned
  // by the compositor, nothing drawn again.
  const REPEAT = { all: 'Upprepar alla', one: 'Upprepar låten' };
  let np = null;
  const part = {};
  function build() {
    if (np) return;
    np = el('section', 'np');
    np.hidden = true;
    np.dataset.pioneertvTheme = 'ink';
    np.innerHTML = `
      <div class="np-wash" data-part="wash"><canvas class="np-swirl np-swirl-a" width="6" height="6" data-part="swirlA"></canvas><canvas class="np-swirl np-swirl-b" width="6" height="6" data-part="swirlB"></canvas></div>
      <div class="np-main">
        <div class="np-cover" data-part="cover"></div>
        <div class="np-text">
          <p class="np-label"><span class="np-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span data-part="label">Spelas nu</span></p>
          <h1 class="np-title" data-part="title"></h1>
          <p class="np-artist" data-part="artist"></p>
          <p class="np-album" data-part="album"></p>
          <div class="np-progress">
            <div class="np-track"><div class="np-bar" data-part="bar"></div></div>
            <p class="np-times"><span data-part="pos">0:00</span><span data-part="len"></span></p>
          </div>
          <p class="np-modes" data-part="modes"></p>
        </div>
        <aside class="np-queue">
          <p class="np-queue-head">Näst på tur <span data-part="queuesize"></span></p>
          <ol data-part="queue"></ol>
        </aside>
      </div>
      <footer class="legend" data-part="legend"></footer>`;
    np.querySelectorAll('[data-part]').forEach((n) => { part[n.dataset.part] = n; });
    document.body.appendChild(np);
    setInterval(() => { if (nowPlaying.isOpen() && state.state === 'playing') nowPlaying.progress(); }, 1000);
  }

  // The wash: the cover in six by six, twice (the whole, and its middle
  // turned over), faded out and in again when the cover changes.
  let washed = null;
  function wash(src) {
    if (washed === src) return;
    washed = src;
    part.wash.classList.remove('shown');
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      if (washed !== src) return;
      const a = part.swirlA.getContext('2d'), b = part.swirlB.getContext('2d');
      a.drawImage(img, 0, 0, 6, 6);
      b.save(); b.translate(6, 6); b.rotate(Math.PI);
      b.drawImage(img, img.width * 0.2, img.height * 0.2, img.width * 0.6, img.height * 0.6, 0, 0, 6, 6);
      b.restore();
      setTimeout(() => { if (washed === src) part.wash.classList.add('shown'); }, 600);
    };
    img.src = src;
  }

  // ------------------------------------------------------------ the queue
  const player = {
    state,
    ask,
    play(list, index) {
      const queue = list.map(({ id, name, artist, album, seconds, cover, thumb }) => ({ id, name, artist, album, seconds, cover, thumb }));
      ask('play', { queue, index }).then((r) => { if (r.ok) nowPlaying.open(); });
    },
    toggle() { if (state.state !== 'idle') ask('toggle'); },
  };

  // ------------------------------------------------------------ Spelas nu
  // Over the whole page, holding the pad while open: A opens the overlay's
  // panel (as Home does), X plays or pauses, B goes back to browsing and
  // the music stops. L2 and R2 are the overlay's while music plays.
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
    },
    // stop: the music stops with it (not when it closes because it did).
    close(stop = true) {
      if (!np || np.hidden) return;
      np.hidden = true;
      if (M.nav.captured === this) M.nav.captured = null;
      if (stop && state.state !== 'idle') ask('stop');
    },
    render() {
      const it = state.item;
      if (!it) return;
      if (part.cover.dataset.src !== (it.cover || '')) {
        part.cover.dataset.src = it.cover || '';
        part.cover.innerHTML = '';
        if (it.cover) {
          const img = el('img');
          img.alt = '';
          img.onload = () => img.classList.add('shown');
          img.src = it.cover;
          part.cover.appendChild(img);
        }
        wash(it.thumb || it.cover || '');
      }
      part.title.textContent = it.name || '';
      part.artist.textContent = it.artist || '';
      part.album.textContent = it.album || '';
      np.classList.toggle('np-resting', state.state !== 'playing');
      part.label.textContent = [state.state === 'paused' ? 'Pausad' : state.state === 'loading' ? 'Laddar…' : 'Spelas nu',
        state.count > 1 ? `låt ${state.index + 1} av ${state.count}` : ''].filter(Boolean).join(' · ');
      part.modes.textContent = [state.shuffle ? 'Blandar' : '', REPEAT[state.repeat] || ''].filter(Boolean).join(' · ');
      // Every song after it (the daemon names up to a hundred; with Upprepa
      // on the whole queue, round again from the first).
      const next = state.next || [];
      const left = next.reduce((n, s) => n + (s.seconds || 0), 0);
      part.queuesize.textContent = next.length ? `${next.length === 1 ? '1 låt' : `${next.length} låtar`}${left ? ` · ${Math.round(left / 60)} min` : ''}` : '';
      part.queue.innerHTML = '';
      next.slice(0, 30).forEach((song, i) => {
        const place = song.index != null ? song.index : state.index + 1 + i;
        const li = el('li', 'np-song');
        li.append(el('span', 'np-song-n', String(place + 1)), el('b', '', song.name), el('span', 'np-song-artist', song.artist || ''),
          el('span', 'np-song-len', clock(song.seconds)));
        part.queue.appendChild(li);
      });
      if (!next.length) part.queue.appendChild(el('li', 'empty', state.repeat === 'one' ? 'Den här låten igen' : 'Inget mer i kön'));
      V.legend(part.legend, [['A', 'meny'], ['X', 'paus · spela'], ['L2', ''], ['R2', 'spola'], ['B', 'bläddra']]);
      this.progress();
    },
    progress() {
      const len = length(), t = now();
      part.pos.textContent = clock(t);
      part.len.textContent = len ? `−${clock(Math.max(0, len - t))}` : '';
      part.bar.style.transform = `scaleX(${len ? Math.min(1, t / len) : 0})`;
    },
    onKeyDown(e) {
      if (e.repeat) return;
      if (e.key === ' ') player.toggle();
      else if (e.key === 'Escape') this.close();
      else if (e.key === 'Enter') M.bridge.relay('menu', { panel: 'media' });
    },
  };

  // The keyboard takes the pad while open; it comes back here.
  M.bridge.on('keyboard:close', () => { if (nowPlaying.isOpen() && !M.nav.captured) M.nav.captured = nowPlaying; });

  player.nowPlaying = nowPlaying;
  M.players = M.players || {};
  M.players.audio = player;
})(window.PioneerTV);
