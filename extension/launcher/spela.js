// Pioneer TV player: one RomM game, played on the box in RetroArch, out of
// sight. Opened as spela.html?rom=<id>.
//
// This page runs no emulator. The daemon (daemon/pioneertv/games.py) fetches
// the game from RomM and starts RetroArch, whose window covers this page;
// what this page shows is what comes before: "Laddar…" with the megabytes,
// "Startar…", and errors. Home in the game pauses RetroArch where it is and
// the overlay draws the pause panel over it (overlay.js); when the game ends
// (Avsluta, holding B on the panel) this page goes back. It talks to the
// daemon over /api/games/... and follows its `games` events. See
// docs/superpowers/specs/2026-10-15-retroarch-games-design.md.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const romId = Number(params.get('rom'));
  M.launcherUrl = new URL('spel.html?tv=1', location.href).href;

  const loading = $('loading');
  function say(text) { loading.hidden = false; loading.textContent = text; }

  // Once the game runs, an extra history entry sits on top of this page, so
  // a "back" from the box lands here instead of leaving: it means quit (see
  // the popstate handler).
  let guarded = false;
  let leaving = false;
  function guard() { if (!guarded) { history.pushState({ spela: true }, ''); guarded = true; } }

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
      // RetroArch's window is over this page now; what is here waits behind it.
      guard();
      if (!started) say('Startar…');
      started = true;
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

  // A "back" from the box while the game runs (the history entry guard()
  // put on top): quit it, as Avsluta does.
  window.addEventListener('popstate', () => {
    if (!guarded || leaving) return;
    guarded = false;
    guard();
    api('/quit', {}).catch(() => {});
  });

  // Leaving this page some other way (holding Home goes to the start page)
  // leaves nothing running behind.
  window.addEventListener('pagehide', () => { if (!leaving && started) navigator.sendBeacon('/api/games/quit'); });

  // B with the message up goes back.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('message').hidden && !M.nav.captured) { e.preventDefault(); back(); }
  });

  M.spela = {};
  start();
})(window.PioneerTV);
