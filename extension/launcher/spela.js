// Pioneer TV player: one RomM game, played on the box in RetroArch, out of
// sight. Opened as spela.html?rom=<id>.
//
// This page runs no emulator. The daemon (daemon/pioneertv/games.py) fetches
// the game from RomM and starts RetroArch, whose window covers this page;
// what this page shows is what comes before and between: "Laddar…" with the
// megabytes, errors, and the pause panel over the picture RetroArch took when
// Home paused it. It talks to the daemon over /api/games/... and follows its
// `games` events. See docs/superpowers/specs/2026-10-15-retroarch-games-design.md.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const romId = Number(params.get('rom'));
  M.launcherUrl = new URL('spel.html?tv=1', location.href).href;

  const loading = $('loading');
  const screen = $('screen');
  function say(text) { loading.hidden = false; loading.textContent = text; }

  // Once the game runs, an extra history entry sits on top of this page, so
  // a "back" from the box (holding B with the pause panel open) lands here
  // instead of leaving: it means quit (see the popstate handler).
  let guarded = false;
  let leaving = false;
  function guard() { if (!guarded) { history.pushState({ spela: true }, ''); guarded = true; } }

  function back() {
    leaving = true;
    if (history.length > (guarded ? 2 : 1)) history.go(guarded ? -2 : -1);
    else location.href = M.launcherUrl;
  }

  function fail(text) {
    panel.close();
    loading.hidden = true;
    $('message-text').textContent = text;
    $('message').hidden = false;
    M.nav.focus($('message-back'));
  }
  $('message-back').addEventListener('click', back);

  // ------------------------------------------------------------ the daemon
  async function api(path, body) {
    const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const r = await fetch(`/api/games${path}`, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok && data.ok !== false) throw new Error(`${path}: ${r.status}`);
    return data;
  }

  const mb = (n) => (n / 1048576).toFixed(1);
  let game = null;
  let started = false;

  M.bridge.on('games', (e) => {
    if (leaving) return;
    if (e.state === 'loading') say(`Laddar ${mb(e.got)}${e.total ? ` av ${mb(e.total)}` : ''} MB`);
    else if (e.state === 'running') {
      // RetroArch's window is over this page now; what is here waits behind
      // it. Back from a pause the picture stays until the game covers it,
      // with nothing written over it.
      guard();
      panel.close();
      if (started) loading.hidden = true;
      else say('Startar…');
      started = true;
    } else if (e.state === 'paused') {
      loading.hidden = true;
      screen.src = `/api/games/screen?t=${Date.now()}`;
      screen.hidden = false;
      panel.open();
    } else if (e.state === 'error') fail(e.message || 'Spelet kunde inte startas');
    else if (e.state === 'exited') {
      if (started) back();
      else fail('Spelet kunde inte startas');
    }
  });

  async function start() {
    if (!romId) return fail('Inget spel angivet');
    try {
      game = await M.romm.game(romId);
    } catch (err) {
      return fail(err.code === 'no_key' ? 'Lägg in en API-nyckel för RomM under Inställningar → RomM'
        : err.code === 'auth' ? 'API-nyckeln godtas inte' : 'RomM svarar inte');
    }
    document.title = `${game.name} – Pioneer TV`;
    // RomM lists a game before its scan has found the file; it cannot serve it yet.
    if (game.fileCount === 0) return fail('RomM har inte hittat spelets fil än. Skanna biblioteket i RomM och försök igen.');
    let status;
    try { status = await api(''); } catch { return fail('Boxen svarar inte'); }
    if (!(status.platforms || []).includes(game.platform)) return fail('Den här konsolen går inte att spela här än');
    say('Laddar…');
    let r;
    try { r = await api('/play', { rom: romId }); } catch { return fail('Boxen svarar inte'); }
    if (r.ok === false) {
      return fail(r.message === 'no_key' ? 'Lägg in en API-nyckel för RomM under Inställningar → RomM' : (r.message || 'Spelet kunde inte startas'));
    }
    M.romm.markPlayed(romId).catch((e) => console.error('update_last_played', e));
  }

  // ------------------------------------------------------------ pause panel
  // Home in a game: the daemon has RetroArch take a picture and quit (saving
  // where the game was), and this panel opens over the picture. Every way
  // out but Avsluta starts RetroArch again; B (or Home again) carries on.
  const hhmm = (s) => new Date(s * 1000).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  const panel = {
    root: null, list: null, items: [], index: 0, busy: false,
    isOpen() { return !!(this.root && this.root.isConnected); },
    // Home while the panel is open (main.js routes the menu button here):
    // carry on, as Fortsätt spela does.
    // Before the game is up (and after an error) it is the quick menu's.
    toggle() { if (this.isOpen()) this.resume('auto'); else M.hud.menu.toggle(); },

    async open() {
      if (this.isOpen()) return;
      let status = {};
      try { status = await api(''); } catch {}
      const root = document.createElement('aside');
      root.className = 'paus';
      root.setAttribute('data-pioneertv-overlay', '');
      M.bridge.sealOverlay(root);
      const label = document.createElement('p'); label.className = 'paus-label'; label.textContent = 'Pausat';
      const title = document.createElement('h1'); title.className = 'paus-title'; title.textContent = game ? game.name : '';
      this.list = document.createElement('div'); this.list.className = 'paus-items';
      this.status = document.createElement('p'); this.status.className = 'paus-status';
      const pads = document.createElement('div'); pads.className = 'paus-pads';
      const names = status.players || [];
      for (let i = 0; i < 2; i++) {
        const p = document.createElement('p');
        p.textContent = `Spelare ${i + 1} · ${names[i] || '—'}`;
        pads.appendChild(p);
      }
      root.append(label, title, this.status, this.list, pads);
      M.bridge.mount(root, { modal: true });
      this.root = root;
      this.busy = false;
      M.nav.captured = this;
      M.bridge.emit('menu:open');
      this.show(this.menuItems(status.point));
    },

    // When the game takes the screen back, or an error replaces the panel.
    close() {
      const was = this.isOpen();
      if (this.root) M.bridge.unmount(this.root);
      this.root = null;
      this.busy = false;
      if (M.nav.captured === this) M.nav.captured = null;
      if (was) M.bridge.emit('menu:close');
    },

    menuItems(point) {
      return [
        { label: 'Fortsätt spela', primary: true, run: () => this.resume('auto') },
        { label: 'Spara läge', run: () => this.savePoint() },
        { label: 'Ladda läge', detail: point ? hhmm(point) : 'inget sparat', disabled: !point, run: () => this.resume('point') },
        { label: 'Starta om', run: () => this.resume('none') },
        { label: 'TV-volym', detail: '◀ ▶ · även L2/R2', volume: true, run: () => M.bridge.cec('mute') },
        { label: 'Avsluta', run: () => this.quit() },
      ];
    },

    show(items, index = 0) {
      this.items = items;
      this.list.innerHTML = '';
      items.forEach((it, i) => {
        const el = document.createElement('div');
        el.className = 'knapp paus-item' + (it.primary ? ' primar' : '') + (it.disabled ? ' paus-disabled' : '');
        el.textContent = it.label;
        if (it.detail) { const d = document.createElement('span'); d.className = 'paus-detail'; d.textContent = it.detail; el.appendChild(d); }
        el.addEventListener('click', () => { this.index = i; this.activate(); });
        it.el = el;
        this.list.appendChild(el);
      });
      this.index = Math.min(index, items.length - 1);
      this.highlight();
    },

    highlight() { this.items.forEach((it, i) => it.el.classList.toggle('pioneertv-focus', i === this.index)); },

    step(dir) {
      let i = this.index;
      do { i = (i + dir + this.items.length) % this.items.length; } while (this.items[i].disabled && i !== this.index);
      this.index = i;
      this.highlight();
    },

    activate() {
      const it = this.items[this.index];
      if (it && !it.disabled && !this.busy) it.run();
    },

    setStatus(text, error) {
      this.status.textContent = text;
      this.status.classList.toggle('fel', !!error);
    },

    // Back into the game: "auto" where it was, "point" from Spara läge, "none" from the start.
    async resume(load) {
      if (this.busy) return;
      this.busy = true;
      this.setStatus(load === 'none' ? 'Startar om…' : 'Fortsätter…');
      let r;
      try { r = await api('/resume', { load }); } catch { r = { ok: false, message: 'Boxen svarar inte' }; }
      if (r.ok === false) { this.busy = false; this.setStatus(r.message || 'Spelet kunde inte startas', true); }
      // On success the daemon's "running" closes the panel.
    },

    async savePoint() {
      if (this.busy) return;
      let r;
      try { r = await api('/save_point', {}); } catch { r = { ok: false, message: 'Boxen svarar inte' }; }
      if (r.ok === false) { this.setStatus(r.message || 'Det gick inte att spara', true); return; }
      let status = {};
      try { status = await api(''); } catch {}
      this.show(this.menuItems(status.point), this.index);
      this.setStatus('Läget är sparat');
    },

    async quit() {
      this.busy = true;
      try { await api('/quit', {}); } catch {}
      back();
    },

    // Keys while the panel has the pad (spatial-nav hands them over).
    onKeyDown(e) {
      const it = this.items[this.index];
      if (e.key === 'ArrowUp') this.step(-1);
      else if (e.key === 'ArrowDown') this.step(1);
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && it && it.volume) {
        M.bridge.cec(e.key === 'ArrowLeft' ? 'volume_down' : 'volume_up');
      } else if (e.key === 'Enter') this.activate();
      else if (e.key === 'Escape') this.resume('auto');
    },
  };

  M.pageMenu = panel;

  // Holding B with the panel open (a step back) quits, as Avsluta does.
  window.addEventListener('popstate', () => {
    if (!guarded || leaving) return;
    guarded = false;
    guard();
    if (panel.isOpen()) panel.quit();
  });

  // Leaving this page some other way (holding Home goes to the start page)
  // leaves nothing paused behind.
  window.addEventListener('pagehide', () => { if (!leaving && panel.isOpen()) navigator.sendBeacon('/api/games/quit'); });

  // B with the message up goes back.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('message').hidden && !M.nav.captured) { e.preventDefault(); back(); }
  });

  M.spela = { panel };
  start();
})(window.PioneerTV);
