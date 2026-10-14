// Pioneer TV player: one RomM game in RomM's own EmulatorJS, without RomM's
// or EmulatorJS's interface around it. Opened as spela.html?rom=<id>, with
// &fresh=1 to start over instead of resuming.
//
// EmulatorJS 4.2.3 (what RomM 5.4 serves), as used here: the EJS_* globals
// below, then window.EJS_emulator with pause(), play(), setVolume(v),
// takeScreenshot(source, format, upscale) -> {blob, format}, and its
// gameManager with getState(), loadState(bytes), getSaveFile(),
// getSaveFilePath(), loadSaveFiles(), restart() and FS.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const romId = Number(params.get('rom'));
  const fresh = params.get('fresh') === '1';
  M.launcherUrl = new URL('spel.html?tv=1', location.href).href;

  const CORES = { nes: 'fceumm', snes: 'snes9x', n64: 'mupen64plus_next', genesis: 'genesis_plus_gx', dos: 'dosbox_pure' };
  // Cores built only with threads: they need the page cross-origin isolated,
  // which the daemon does for this page (server.py, ISOLATED_PAGES).
  const THREADED = new Set(['dosbox_pure']);

  // The game's file, or null when this page cannot play it: no core for the
  // console, or a game made of several files.
  function romFileUrl(game) {
    if (!CORES[game.platform] || game.multiFile) return null;
    return M.romm.romUrl(game);
  }

  // RetroArch settings over EmulatorJS's own, in the retroarch.cfg its
  // GameManager writes. EmulatorJS keeps
  // 64 ms of sound queued: on the Pi a frame the browser is late with (the
  // first seconds, while the core is still being optimised, run at about 42
  // frames a second; measured on the box) empties that and the sound
  // crackles. 128 ms rides the dips out, a delay nobody notices on a TV.
  const RETROARCH = { audio_latency: 128 };
  function tuneRetroArch() {
    let GM;
    const patch = (cls) => {
      if (!cls || !cls.prototype || cls.prototype.__pioneerTuned || typeof cls.prototype.getRetroArchCfg !== 'function') return;
      const base = cls.prototype.getRetroArchCfg;
      cls.prototype.getRetroArchCfg = function () {
        // Replace EmulatorJS's own line for a key rather than add a second
        // one: with both in the file RetroArch kept 64 (seen on the box).
        let cfg = base.call(this);
        for (const [k, v] of Object.entries(RETROARCH)) {
          const line = `${k} = ${v}`;
          const re = new RegExp(`^${k}\\s*=.*$`, 'm');
          cfg = re.test(cfg) ? cfg.replace(re, line) : `${cfg}${line}\n`;
        }
        return cfg;
      };
      cls.prototype.__pioneerTuned = true;
    };
    // EmulatorJS's scripts set window.EJS_GameManager as they load; catch it
    // before the emulator constructs one.
    Object.defineProperty(window, 'EJS_GameManager', {
      configurable: true,
      get: () => GM,
      set: (v) => { GM = v; patch(v); },
    });
  }

  const loading = $('loading');
  function say(text) { loading.hidden = false; loading.textContent = text; }

  // Once the game runs, an extra history entry sits on top of this page, so
  // a "back" from the box (holding B with the pause panel open) lands here
  // instead of leaving: it means save and quit (see the popstate handler).
  let guarded = false;
  let leaving = false;
  function guard() { history.pushState({ spela: true }, ''); guarded = true; }

  function back() {
    leaving = true;
    if (history.length > (guarded ? 2 : 1)) history.go(guarded ? -2 : -1);
    else location.href = M.launcherUrl;
  }

  function fail(text) {
    loading.hidden = true;
    $('message-text').textContent = text;
    $('message').hidden = false;
    M.nav.focus($('message-back'));
  }
  $('message-back').addEventListener('click', back);

  // The ROM, read with a running count so a large N64 game shows progress.
  async function download(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new M.romm.RommError(resp.status, resp.status === 401 || resp.status === 403 ? 'auth' : 'down');
    const total = Number(resp.headers.get('Content-Length')) || 0;
    const reader = resp.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      say(`Laddar ${(got / 1048576).toFixed(1)}${total ? ` av ${(total / 1048576).toFixed(1)}` : ''} MB`);
    }
    return new Blob(parts);
  }

  async function bytes(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
    return new Uint8Array(await resp.arrayBuffer());
  }

  // Writes a save file where the core looks for it, then has it read.
  function putSaveFile(gm, data) {
    const path = gm.getSaveFilePath();
    let dir = '';
    for (const part of path.split('/').slice(0, -1)) {
      if (!part) continue;
      dir += '/' + part;
      if (!gm.FS.analyzePath(dir).exists) gm.FS.mkdir(dir);
    }
    if (gm.FS.analyzePath(path).exists) gm.FS.unlink(path);
    gm.FS.writeFile(path, data);
    gm.loadSaveFiles();
  }

  // Unless starting over: the newest state, else the newest save file.
  async function resume(gm) {
    const state = await M.romm.latestState(romId);
    if (state) { gm.loadState(await bytes(state.url)); return 'state'; }
    const save = await M.romm.latestSave(romId);
    if (save) { putSaveFile(gm, await bytes(save.url)); return 'save'; }
    return null;
  }

  async function start() {
    if (!romId) return fail('Inget spel angivet');
    let game;
    try {
      game = await M.romm.game(romId);
    } catch (err) {
      return fail(err.code === 'no_key' ? 'Lägg in en API-nyckel för RomM under Inställningar → RomM'
        : err.code === 'auth' ? 'API-nyckeln godtas inte' : 'RomM svarar inte');
    }
    document.title = `${game.name} – Pioneer TV`;
    // RomM lists a game before its scan has found the file; it cannot serve it yet.
    if (game.fileCount === 0) return fail('RomM har inte hittat spelets fil än. Skanna biblioteket i RomM och försök igen.');
    const url = romFileUrl(game);
    if (!url) return fail('Den här konsolen går inte att spela här än');
    const core = CORES[game.platform];
    if (THREADED.has(core) && !window.crossOriginIsolated) return fail('Den här konsolen behöver en nyare version av boxen');
    M.player = { emulator: null, core, game };

    let blob;
    try { blob = await download(url); } catch { return fail('RomM svarar inte'); }
    say('Startar…');

    Object.assign(window, {
      EJS_player: '#game',
      EJS_core: core,
      EJS_threads: THREADED.has(core),
      EJS_gameUrl: URL.createObjectURL(blob),
      EJS_gameName: game.fileName.replace(/\.[^.]+$/, ''),
      EJS_pathtodata: M.romm.base + 'assets/emulatorjs/data/',
      EJS_startOnLoaded: true,
      EJS_color: '#f5cf5a',
      EJS_backgroundColor: '#1c1613',
      EJS_Buttons: Object.fromEntries(['playPause', 'restart', 'mute', 'settings', 'fullscreen', 'saveState', 'loadState',
        'screenRecord', 'gamepad', 'cheat', 'volume', 'saveSavFiles', 'loadSavFiles', 'quickSave', 'quickLoad',
        'screenshot', 'cacheManager', 'exitEmulation', 'netplay', 'diskButton', 'contextMenu'].map((k) => [k, false])),
      EJS_onGameStart: async () => {
        loading.hidden = true;
        const emu = window.EJS_emulator;
        M.player.emulator = emu;
        guard();
        M.romm.markPlayed(romId).catch((e) => console.error('update_last_played', e));
        if (fresh) return;
        try {
          const from = await resume(emu.gameManager);
          if (from) M.hud.toast(from === 'state' ? 'Fortsätter där du slutade' : 'Sparfilen är laddad', 'gamepad', 2500);
        } catch (e) {
          console.error('resume', e);
          M.hud.toast('Sparningen kunde inte laddas', 'gamepad', 3000);
        }
      },
    });
    tuneRetroArch();
    const script = document.createElement('script');
    script.src = M.romm.base + 'assets/emulatorjs/data/loader.js';
    script.onerror = () => fail('RomM svarar inte');
    document.body.appendChild(script);
  }

  // ------------------------------------------------------------ saving
  // The state (with a screenshot) and, when the core keeps one, the save
  // file both go to RomM, so the start page can resume and RomM shows them.
  // A paused emulator draws no frames, so the picture is taken while the
  // game still runs (as the pause panel opens). It is a nicety: never let it
  // hold anything up.
  function screenshot() {
    return Promise.race([
      M.player.emulator.takeScreenshot('canvas', 'png', 1).then((r) => r.blob).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
    ]);
  }

  async function saveAll(shot) {
    const gm = M.player.emulator.gameManager;
    const state = gm.getState();
    await M.romm.uploadState(romId, state, shot, M.player.core);
    const save = gm.getSaveFile();
    if (save && save.length) await M.romm.uploadSave(romId, save, shot, M.player.core);
  }

  // ------------------------------------------------------------ pause panel
  // Guide opens it instead of the quick menu. It is a modal layer like the
  // quick menu: the navigation hands it the pad, game.js stops game mode and
  // ejs-players.js pauses the emulator while it is open.
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  const panel = {
    root: null, list: null, items: [], index: 0, busy: false,
    isOpen() { return !!(this.root && this.root.isConnected); },
    toggle() { this.isOpen() ? this.close() : this.open(); },

    async open() {
      if (!M.player || !M.player.emulator || this.isOpen() || this.opening) return;
      this.opening = true;
      this.shot = await screenshot();
      this.opening = false;
      const root = document.createElement('aside');
      root.className = 'paus';
      root.setAttribute('data-pioneertv-overlay', '');
      M.bridge.sealOverlay(root);
      const label = document.createElement('p'); label.className = 'paus-label'; label.textContent = 'Pausat';
      const title = document.createElement('h1'); title.className = 'paus-title'; title.textContent = M.player.game.name;
      this.list = document.createElement('div'); this.list.className = 'paus-items';
      this.status = document.createElement('p'); this.status.className = 'paus-status';
      const pads = document.createElement('div'); pads.className = 'paus-pads';
      pads.append(...padLines());
      root.append(label, title, this.status, this.list, pads);
      M.bridge.mount(root, { modal: true });
      this.root = root;
      M.nav.captured = this;
      M.bridge.emit('menu:open');
      this.show(this.menuItems(null));
      const state = await M.romm.latestState(romId).catch(() => null);
      if (this.isOpen() && !this.failed) this.show(this.menuItems(state), this.index);
    },

    close() {
      if (this.busy) return;
      if (this.root) M.bridge.unmount(this.root);
      this.root = null;
      this.failed = false;
      if (M.nav.captured === this) M.nav.captured = null;
      M.bridge.emit('menu:close');
    },

    menuItems(state) {
      const gm = M.player.emulator.gameManager;
      return [
        { label: 'Fortsätt spela', primary: true, run: () => this.close() },
        { label: 'Spara läge', run: () => this.save(false) },
        { label: 'Ladda läge', detail: state ? hhmm(state.updatedAt) : 'inget sparat', disabled: !state,
          run: async () => { gm.loadState(await bytes(state.url)); this.close(); M.hud.toast('Läget är laddat', 'gamepad', 1800); } },
        { label: 'Starta om', run: () => { gm.restart(); this.close(); } },
        { label: 'TV-volym', detail: '◀ ▶ · även L2/R2', volume: true, run: () => M.bridge.cec('mute') },
        { label: 'Spara och avsluta', quit: true, run: () => this.save(true) },
      ];
    },

    failedItems(quit) {
      return [
        { label: 'Försök igen', primary: true, run: () => this.save(quit) },
        { label: quit ? 'Avsluta ändå' : 'Tillbaka till spelet', run: () => (quit ? back() : this.close()) },
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
      // A second press on Spara och avsluta while it saves: quit without
      // waiting for the save (RomM may be slow or away).
      if (this.busy && this.quitting && it && it.quit) { back(); return; }
      if (it && !it.disabled && !this.busy) it.run();
    },

    async save(quit) {
      this.busy = true;
      this.quitting = quit;
      this.status.textContent = quit ? 'Sparar och avslutar… · tryck igen för att avsluta utan att spara' : 'Sparar…';
      this.status.classList.remove('fel');
      try {
        await saveAll(this.shot);
        if (leaving) return;                    // quit without saving while it ran
      } catch (e) {
        if (leaving) return;
        console.error('save', e);
        this.busy = false;
        this.failed = true;
        this.status.textContent = 'Sparningen misslyckades';
        this.status.classList.add('fel');
        this.show(this.failedItems(quit));
        return;
      }
      this.busy = false;
      if (quit) { back(); return; }
      this.failed = false;
      this.status.textContent = '';
      this.close();
      M.hud.toast('Sparat', 'gamepad', 1800);
    },

    // Keys while the panel has the pad (spatial-nav hands them over).
    onKeyDown(e) {
      const it = this.items[this.index];
      if (e.key === 'ArrowUp') this.step(-1);
      else if (e.key === 'ArrowDown') this.step(1);
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && it && it.volume) {
        M.bridge.cec(e.key === 'ArrowLeft' ? 'volume_down' : 'volume_up');
      } else if (e.key === 'Enter') this.activate();
      else if (e.key === 'Escape' && !this.failed) this.close();
    },
  };

  // Which browser gamepad is which of the box's pads. The browser sees two
  // identical 8BitDo; the daemon knows them apart by their dongles and says
  // which one was just used (active_pad: on a change of pad, and on the first
  // input after a rest). A browser pad that pressed within the same moment is
  // that pad.
  // Kept for as long as the browser runs: the browser's indices hold until a
  // pad reconnects, and the next game should not have to learn them again.
  const STORE = 'pioneertv-padnames';
  const padNames = new Map((() => { try { return JSON.parse(sessionStorage.getItem(STORE) || '[]'); } catch { return []; } })());
  const lastPress = new Map();         // "id_index" -> when it last pressed
  let pendingPad = null;               // an active_pad no browser pad matched yet
  const MATCH_MS = 400;
  const padKey = (g) => `${g.id}_${g.index}`;
  function bind(pad, at) {
    const near = [...lastPress].filter(([, t]) => Math.abs(t - at) <= MATCH_MS);
    if (near.length !== 1) return false;
    padNames.set(near[0][0], pad.name);
    // The other pad cannot be this one any more.
    for (const [k, v] of padNames) if (v === pad.name && k !== near[0][0]) padNames.delete(k);
    try { sessionStorage.setItem(STORE, JSON.stringify([...padNames])); } catch {}
    return true;
  }
  const seen = new Map();              // "id_index" -> was anything pressed
  setInterval(() => {
    const now = performance.now();
    for (const g of navigator.getGamepads ? navigator.getGamepads() : []) {
      if (!g) continue;
      const k = padKey(g);
      const down = g.buttons.some((x) => x.pressed) || g.axes.some((v) => Math.abs(v) > 0.6);
      if (down && !seen.get(k)) {
        lastPress.set(k, now);
        if (pendingPad && now - pendingPad.at <= MATCH_MS && bind(pendingPad.pad, now)) pendingPad = null;
      }
      seen.set(k, down);
    }
  }, 50);
  M.bridge.on('active_pad', (e) => {
    if (!e.pad || !e.pad.named) return;
    const now = performance.now();
    if (!bind(e.pad, now)) pendingPad = { pad: e.pad, at: now };
  });

  function padName(g) {
    const name = padNames.get(padKey(g));
    if (name) return name;
    // One pad on each side: no need to match.
    const box = ((M.bridge.state.status || {}).gamepads) || [];
    const browser = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (box.length === 1 && browser.length === 1) return box[0].name;
    return 'Handkontroll';
  }

  // Who is which player: EmulatorJS's slots as ejs-players.js ordered them.
  function padLines() {
    const sel = (window.EJS_emulator && window.EJS_emulator.gamepadSelection) || [];
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const lines = [];
    for (let i = 0; i < 2; i++) {
      const pad = pads.find((g) => `${g.id}_${g.index}` === sel[i]) || (!sel.some(Boolean) ? pads[i] : null);
      const p = document.createElement('p');
      p.textContent = `Spelare ${i + 1} · ${pad ? padName(pad) : '—'}`;
      lines.push(p);
    }
    return lines;
  }

  M.pageMenu = panel;

  window.addEventListener('popstate', () => {
    if (!guarded || leaving) return;
    guarded = false;
    guard();                                  // stay: what happens next is the panel's call
    if (panel.failed || panel.busy) return;   // a failed save waits for the person's choice
    (panel.isOpen() ? Promise.resolve() : panel.open()).then(() => panel.save(true));
  });

  // B with the message up goes back; in the game, B belongs to the game.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('message').hidden && !M.nav.captured) { e.preventDefault(); back(); }
  });

  M.spela = { romFileUrl, CORES, saveAll, panel };
  start();
})(window.PioneerTV);
