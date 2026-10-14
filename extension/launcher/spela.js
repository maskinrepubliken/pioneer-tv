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

  const CORES = { nes: 'fceumm', snes: 'snes9x', n64: 'mupen64plus_next', genesis: 'genesis_plus_gx' };

  // The game's file, or null when this page cannot play it: no core for the
  // console, or a game made of several files.
  function romFileUrl(game) {
    if (!CORES[game.platform] || game.multiFile) return null;
    return M.romm.romUrl(game);
  }

  const loading = $('loading');
  function say(text) { loading.hidden = false; loading.textContent = text; }

  function back() {
    if (history.length > 1) history.back();
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
    M.player = { emulator: null, core, game };

    let blob;
    try { blob = await download(url); } catch { return fail('RomM svarar inte'); }
    say('Startar…');

    Object.assign(window, {
      EJS_player: '#game',
      EJS_core: core,
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
    const script = document.createElement('script');
    script.src = M.romm.base + 'assets/emulatorjs/data/loader.js';
    script.onerror = () => fail('RomM svarar inte');
    document.body.appendChild(script);
  }

  // B with the message up goes back; in the game, B belongs to the game.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('message').hidden && !M.nav.captured) { e.preventDefault(); back(); }
  });

  M.spela = { romFileUrl, CORES };
  start();
})(window.PioneerTV);
