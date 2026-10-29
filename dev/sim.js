// The simulator (dev/sim.html): the box on one screen.
//
// The page (Chromium on the box) and the overlay (its own WebKit window on
// labwc's top layer) are two frames, one over the other, as on the box; the
// stand-in daemon (dev/sim.py) is behind them on /ws, as the real one is.
// This window plays the parts that are neither: the extension's background
// worker (home, back, reload, navigate, settings for the page), the overlay
// window taking the keyboard while its menu is open (overlay.py's
// set_keyboard_mode), and the pad's system buttons (Home, Y, holding B,
// L2/R2), which the daemon handles itself. The d-pad, A, B, X and L1/R1 are
// the Mac's own keys, which reach whichever frame has the keyboard as real
// presses: a page acts only on those.
(function () {
  const $ = (id) => document.getElementById(id);
  const page = $('page'), overlay = $('overlay'), screen = $('screen');
  const HOME = '/ext/launcher/index.html?tv=1';
  const LAUNCHER = `${location.origin}/ext/launcher/index.html`;

  // ------------------------------------------------------------ the screen
  function fit() {
    const box = $('tv').getBoundingClientRect();
    const s = Math.min((box.width - 40) / 1920, (box.height - 40) / 1080);
    screen.style.transform = `scale(${s})`;
    screen.style.margin = `${(1080 * s - 1080) / 2}px ${(1920 * s - 1920) / 2}px`;
  }
  window.addEventListener('resize', fit);
  fit();

  // ------------------------------------------------------------ the daemon
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => {});
  const press = (name) => { log(`<b>knapp</b> ${name}`); post('/api/sim/button', { name }); };
  let sock = null;
  function connect() {
    const ws = sock = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', client: 'simulator' }));
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (msg.type !== 'event') return;
      if (msg.name !== 'audio' || msg.state !== 'playing') log(`<b>${msg.name}</b> ${short(msg)}`);
      // What the extension's background worker does for the tab.
      if (msg.target === 'overlay') return;
      if (msg.name === 'home') go(HOME);
      else if (msg.name === 'back') { try { page.contentWindow.history.back(); } catch { go(HOME); } }
      else if (msg.name === 'reload') page.contentWindow.location.reload();
      else if (msg.name === 'navigate') go(local(msg.url));
      else if (msg.name === 'settings') go(`/static/settings.html?mock=1${msg.section ? `#${msg.section}` : ''}`);
    };
    ws.onclose = () => setTimeout(connect, 1500);
  }
  connect();
  const short = (msg) => {
    const { type, name, target, ...rest } = msg;
    const s = JSON.stringify(rest);
    return (target ? `→ ${target} ` : '') + (s === '{}' ? '' : s.slice(0, 140));
  };

  // An address as the simulator can show it: the daemon's own pages here,
  // the extension's launcher here, another site as a stand-in.
  function local(url) {
    url = String(url || '').replace('http://127.0.0.1:8765/', `${location.origin}/`).replace(/^chrome-extension:\/\/[^/]+\//, `${location.origin}/ext/`);
    let u;
    try { u = new URL(url, LAUNCHER); } catch { return HOME; }
    if (u.origin !== location.origin) return `/dev/sim-extern.html?url=${encodeURIComponent(u.href)}`;
    return u.href;
  }
  function go(url) { page.src = url; }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { go(b.dataset.go); keysTo(false); }));

  // ------------------------------------------------------------ the page
  // Every page it loads gets the background worker's part: what the bridge
  // would ask the extension for, the simulator does.
  page.addEventListener('load', () => {
    let w;
    try { w = page.contentWindow; w.document; } catch { return; }
    $('where').textContent = w.location.pathname + w.location.search + w.location.hash;
    w.addEventListener('hashchange', () => { $('where').textContent = w.location.pathname + w.location.search + w.location.hash; });
    pad(w);
    // Which page is on screen, as the extension says it at every load (the
    // menu that opened it closes on it; the settings page has no bridge here).
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: 'loaded', url: w.location.href }));
    const M = w.PioneerTV;
    if (M) M.launcherUrl = LAUNCHER;
    const b = M && M.bridge;
    if (b) {
      b.launcherUrl = LAUNCHER;
      b.home = () => go(HOME);
      b.back = () => w.history.back();
      b.reload = () => w.location.reload();
      b.navigate = (url) => go(local(url));
      b.settings = (section) => go(`/static/settings.html?mock=1${section ? `#${section}` : ''}`);
    }
    if (!overlayKeys) keysTo(false);
  });
  // The settings page (no bridge, no extension here) says B's "home" this way.
  window.addEventListener('message', (e) => { if (e.data && e.data.sim === 'home') go(HOME); });

  // ------------------------------------------------------------ the overlay
  // overlay.py gives the overlay's window the keyboard while its menu or its
  // keyboard is open (the page's postMessage to it, here).
  let overlayKeys = false;
  function keysTo(toOverlay) {
    overlayKeys = toOverlay;
    overlay.classList.toggle('keys', toOverlay);
    $('keys-to').innerHTML = `Tangenterna går till <b>${toOverlay ? 'overlayn (en meny är öppen)' : 'sidan'}</b>`;
    (toOverlay ? overlay : page).contentWindow.focus();
  }
  overlay.addEventListener('load', () => {
    const w = overlay.contentWindow;
    w.webkit = { messageHandlers: { pioneertv: { postMessage: (s) => {
      try { const msg = JSON.parse(s); if ('keyboard' in msg) keysTo(!!msg.keyboard); } catch {}
    } } } };
    pad(w);
  });
  // A click on the TV gives it the keys back (to whichever window has them).
  screen.addEventListener('mousedown', () => setTimeout(() => keysTo(overlayKeys), 0));

  // ------------------------------------------------------------ the pad
  // The buttons the daemon handles: Home (the menu; held, the home page), Y
  // (the keyboard), holding B (back), L2/R2 (the TV's volume). Keys in any
  // of the three windows; the rest only light up on the drawing.
  const HOLD_MS = 700;
  const shown = (key) => document.querySelector(`#pad [data-show="${CSS.escape(key)}"]`);
  const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  function pad(w) {
    let homeTimer = null, homeHeld = false, backTimer = null;
    w.addEventListener('keydown', (e) => {
      const lit = shown(e.shiftKey && e.key === 'Tab' ? 'Shift+Tab' : e.key);
      if (lit) lit.classList.add('down-now');
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (k === 'h') {
        eat();
        if (e.repeat) return;
        homeHeld = false;
        homeTimer = setTimeout(() => { homeHeld = true; press('home'); }, HOLD_MS);
      } else if (k === 'y') { eat(); if (!e.repeat) press('keyboard'); }
      else if (e.key === '[') { eat(); press('vol_down'); }
      else if (e.key === ']') { eat(); press('vol_up'); }
      else if (e.key === 'Escape' && !e.repeat) backTimer = setTimeout(() => press('back'), HOLD_MS);
    }, true);
    w.addEventListener('keyup', (e) => {
      document.querySelectorAll('#pad .down-now').forEach((n) => n.classList.remove('down-now'));
      if (e.key.toLowerCase() === 'h' && homeTimer) {
        clearTimeout(homeTimer);
        homeTimer = null;
        if (!homeHeld) press('menu');
        e.preventDefault();
      }
      if (e.key === 'Escape') clearTimeout(backTimer);
    }, true);
  }
  pad(window);

  // A click on A, B, X, the d-pad or L1/R1: the key, to the window that has
  // the keys, as a press the pages take for the pad's (spatial-nav.js lets a
  // press marked pioneertvPad through; other synthetic keys are the
  // on-screen keyboard's own). What the browser does by itself with a real
  // key (a button's click on Enter or Space, Tab's next field) it does not
  // do for these, so that is done here.
  function sendKey(key, shift) {
    const frame = overlayKeys ? overlay : page;
    let w, doc;
    try { w = frame.contentWindow; doc = w.document; } catch { return; }
    const el = doc.activeElement && doc.activeElement !== doc.documentElement ? doc.activeElement : doc.body;
    const code = { ' ': 'Space', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab' }[key] || key;
    const fire = (type) => {
      const ev = new w.KeyboardEvent(type, { key, code, shiftKey: !!shift, bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(ev, 'pioneertvPad', { value: true });
      el.dispatchEvent(ev);
      return ev;
    };
    const down = fire('keydown');
    fire('keyup');
    if (down.defaultPrevented) return;
    const pressable = el.matches && el.matches('button, a[href], summary, [role="button"], [role="switch"], input[type="checkbox"]');
    if ((key === 'Enter' || key === ' ') && pressable) el.click();
    else if (key === 'Tab') {
      const all = [...doc.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent);
      const next = all[(all.indexOf(el) + (shift ? -1 : 1) + all.length) % all.length];
      if (next) next.focus();
    }
  }
  document.querySelectorAll('[data-key]').forEach((b) => b.addEventListener('click', () => {
    b.classList.add('down-now');
    setTimeout(() => b.classList.remove('down-now'), 150);
    sendKey(b.dataset.key, b.hasAttribute('data-shift'));
  }));
  // A click on the panel takes no focus from the TV, so the keys stay there.
  document.querySelectorAll('.side button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
  document.querySelectorAll('[data-sys]').forEach((b) => b.addEventListener('click', () => { press(b.dataset.sys); setTimeout(() => keysTo(overlayKeys), 0); }));
  document.querySelectorAll('[data-api]').forEach((b) => b.addEventListener('click', () => { post(b.dataset.api); setTimeout(() => keysTo(overlayKeys), 0); }));
  document.querySelectorAll('[data-pad]').forEach((b) => b.addEventListener('click', () => { post('/api/sim/pad', { pad: b.dataset.pad }); setTimeout(() => keysTo(overlayKeys), 0); }));

  // ------------------------------------------------------------ the log
  function log(html) {
    const li = document.createElement('li');
    li.innerHTML = `${new Date().toLocaleTimeString('sv-SE')} ${html}`;
    $('log').prepend(li);
    while ($('log').children.length > 80) $('log').lastChild.remove();
  }

  go(new URLSearchParams(location.search).get('page') || HOME);
})();
