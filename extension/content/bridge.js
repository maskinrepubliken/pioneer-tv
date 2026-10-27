// Pioneer TV bridge: the only place that touches chrome.* APIs.
//
// Every other script works without an extension context so the launcher and
// overlays can be opened as plain files while designing.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const listeners = {};
  const hasExt = !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
  const params = new URLSearchParams(location.search);
  // Pages the daemon serves itself (/ext/..., e.g. the Spel pages, which load
  // EmulatorJS from RomM and so cannot be extension pages) get no content
  // scripts: the manifest excludes them, as they carry their own copies. They
  // talk to the daemon over its WebSocket instead of through the extension.
  const LAUNCHER_EXT_URL = 'chrome-extension://dpigdefepjjejbkidlabpjlnleidgjaf/launcher/index.html';
  // The overlay (extension/overlay/, in its own WebKit over every window on
  // labwc) draws every menu, toast and the screensaver; every other page is
  // a page.
  // The daemon addresses some events to one or the other ("target").
  const role = location.pathname.startsWith('/ext/overlay/') ? 'overlay' : 'page';
  const forMe = (msg) => !msg.target || msg.target === role;
  let ws = null;

  const bridge = {
    available: hasExt,
    overlay: role === 'overlay',
    state: {
      daemonConnected: false,
      config: null,
      status: null,          // last status broadcast from the daemon
      physicalKeyboard: false,
      // "TV mode" turns on the behaviours that only make sense with a gamepad
      // (auto keyboard, big focus ring). Forced with ?tv=1 when designing.
      tvMode: params.has('tv'),
    },

    // Our overlays sit in the page's DOM, so a click inside one bubbles on to
    // the site's own document listeners. Seal each overlay root: the event
    // still reaches our own handlers on the way down and at the target, but
    // stops before it leaves the overlay.
    sealOverlay(root) {
      if (!root || root.dataset.pioneertvSealed) return root;
      root.dataset.pioneertvSealed = '1';
      for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointermove', 'mousemove', 'mouseover', 'mouseout', 'wheel', 'touchstart', 'touchend']) {
        root.addEventListener(type, (e) => e.stopPropagation());
      }
      return root;
    },

    // ------------------------------------------------------- top layer
    // A page in fullscreen shows only its fullscreen element: it sits in the
    // browser's top layer and everything else, our overlays included, is not
    // drawn. So overlays are popovers, which join the top layer above it.
    // Measured on the box (Chromium 153, SVT1 in fullscreen): a plain fixed
    // overlay is invisible, a manual popover is drawn over the video.
    //
    // mount(el, { modal }) shows an overlay there; unmount(el) takes it away.
    // A modal overlay (menu, keyboard, logs) has the pad: while one is open in
    // fullscreen, Escape is held with the Keyboard Lock API, because B sends
    // Escape and the browser would otherwise leave fullscreen on it instead of
    // letting the overlay close. Held down for two seconds it still exits.
    _layer: new Set(),
    _modal: new Set(),
    mount(el, opts = {}) {
      const top = typeof el.showPopover === 'function';
      if (top && !el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
      if (!el.isConnected) document.documentElement.appendChild(el);
      this._layer.add(el);
      if (opts.modal) this._modal.add(el);
      this._show(el);
      this._restack();
      this._lockEscape();
      return el;
    },
    unmount(el) {
      if (!el) return;
      this._layer.delete(el);
      this._modal.delete(el);
      try { if (el.matches(':popover-open')) el.hidePopover(); } catch {}
      el.remove();
      this._lockEscape();
    },
    _show(el) {
      if (typeof el.showPopover !== 'function') return;
      try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch {}
    },
    // The top layer stacks in the order things were shown. Keep the toast and
    // then the pointer last, so both stay above a menu or keyboard.
    _restack() {
      for (const cls of ['pioneertv-toast', 'pioneertv-cursor']) {
        for (const el of this._layer) if (el.isConnected && el.classList.contains(cls)) this._show(el);
      }
    },
    // The lock is released late on purpose: B's own press is what closes the
    // overlay, and a lock dropped while that Escape is still down lets the
    // browser act on the rest of it and leave fullscreen after all (seen on
    // the box). So it goes a moment after the last overlay has closed.
    _lockEscape() {
      const kb = navigator.keyboard;
      if (!kb || typeof kb.lock !== 'function') return;
      const want = !!document.fullscreenElement && [...this._modal].some((el) => el.isConnected);
      clearTimeout(this._unlockTimer);
      if (want) {
        if (this._escLocked) return;
        this._escLocked = true;
        kb.lock(['Escape']).catch(() => { this._escLocked = false; });
      } else if (this._escLocked) {
        this._unlockTimer = setTimeout(() => {
          if ([...this._modal].some((el) => el.isConnected)) return;
          this._escLocked = false;
          try { kb.unlock(); } catch {}
        }, 700);
      }
    },

    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    emit(name, data) { (listeners[name] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },

    // Messages to the background worker (and via it, the daemon).
    send(msg) { if (hasExt) chrome.runtime.sendMessage(msg).catch(() => {}); },
    daemon(payload) {
      if (ws) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); }
      else this.send({ type: 'daemon', payload });
    },
    cec(command) { this.daemon({ type: 'cec', command }); },
    navigate(url) {
      if (hasExt) this.send({ type: 'navigate', url });
      else if (this.overlay) this.relay('navigate', { url });
      else location.href = url;
    },
    // The home page, where a relative service url (the radio player) is read from.
    launcherUrl: LAUNCHER_EXT_URL,
    // What the overlay cannot do itself it asks the page to do, through the
    // daemon and the extension (overlay.py in the daemon: relay).
    relay(name, extra) { this.daemon({ type: 'relay', name, ...(extra || {}) }); },
    home() {
      if (hasExt) this.send({ type: 'home' });
      else if (this.overlay) this.relay('home');
      else if (this.state.daemonConnected) location.href = LAUNCHER_EXT_URL;
      else location.href = M.launcherUrl || '../launcher/index.html';
    },
    back() {
      if (hasExt) this.send({ type: 'back' });
      else if (this.overlay) this.relay('back');
      else history.back();
    },
    reload() {
      if (hasExt) this.send({ type: 'reload' });
      else if (this.overlay) this.relay('reload');
      else location.reload();
    },
    keyboard() {
      if (this.overlay) this.relay('keyboard');
      else if (M.keyboard) M.keyboard.toggle();
    },
    // section: one of the settings page's tabs (wifi, tv, system, ...).
    settings(section) {
      if (hasExt) this.send({ type: 'settings', section });
      else if (this.overlay) this.relay('settings', section ? { section } : null);
      else location.href = `http://127.0.0.1:8765/${section ? '#' + section : ''}`;
    },
    // Call the daemon's HTTP API. Pages on https cannot fetch localhost
    // themselves, so the background worker does it for them.
    async api(method, path, body) {
      if (hasExt) {
        const res = await chrome.runtime.sendMessage({ type: 'api', method, path, body });
        if (!res || !res.ok) throw new Error((res && res.error) || 'no response');
        return res.data;
      }
      const r = await fetch('http://127.0.0.1:8765' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error(String(r.status));
      const ct = r.headers.get('content-type') || '';
      return ct.includes('json') ? r.json() : r.text();
    },
    // Is a game actually running right now? Only the running emulator owns the
    // pad; the rest of a game service is an ordinary page you browse with the
    // d-pad, so this asks the detector instead of matching the host.
    gameMode() {
      return !!(M.game && M.game.active());
    },
    // Should Enter in a text field pop the on-screen keyboard?
    autoKeyboard() {
      if (!this.state.tvMode || this.state.physicalKeyboard || this.gameMode()) return false;
      const ui = (this.state.config && this.state.config.ui) || {};
      return ui.auto_keyboard !== false;
    },

    init() {
      document.addEventListener('fullscreenchange', () => {
        for (const el of this._layer) if (el.isConnected) this._show(el);
        this._restack();
        if (!document.fullscreenElement) { clearTimeout(this._unlockTimer); this._escLocked = false; }   // leaving fullscreen drops a lock by itself
        this._lockEscape();
      });
      if (!hasExt) {
        if (location.protocol.startsWith('http') && location.pathname.startsWith('/ext/')) this._connectDaemon();
        this.emit('state', this.state);
        return;
      }
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'state') this._applyState(msg);
        else if (msg.type === 'event' && forMe(msg)) this.emit(msg.name, msg);
      });
      chrome.runtime.sendMessage({ type: 'getState' }).then((s) => s && this._applyState(s)).catch(() => {});
    },

    // Straight to the daemon from a page it serves; a preview server has no
    // /ws, so there this simply fails and the page works without a daemon.
    _connectDaemon() {
      try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); } catch { ws = null; return; }
      const state = { daemonConnected: true, config: null, status: null };
      ws.onopen = () => this._applyState(state);
      ws.onmessage = (m) => {
        let msg;
        try { msg = JSON.parse(m.data); } catch { return; }
        if (msg.type === 'config') { state.config = msg; this._applyState(state); }
        else if (msg.type === 'status') { state.status = msg; this._applyState(state); }
        // home, back and reload are the extension background's to carry out
        // for the tab; doing them here as well would do them twice. The
        // overlay hears home (it opens the main menu over the home page).
        else if (msg.type === 'event' && forMe(msg) && (role === 'overlay' || !['home', 'back', 'reload', 'settings', 'navigate'].includes(msg.name))) this.emit(msg.name, msg);
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        // A daemon that was there comes back after a restart: keep trying. One
        // that never answered may be restarting too, or this is a preview
        // server without /ws: try for a while, then stop.
        if (this.state.daemonConnected) {
          this._applyState({ daemonConnected: false, config: state.config, status: state.status });
          this._wsTries = 0;
        }
        ws = null;
        if ((this._wsTries = (this._wsTries || 0) + 1) <= 15 || state.config) setTimeout(() => this._connectDaemon(), 2000);
      };
    },

    _applyState(s) {
      this.state.daemonConnected = !!s.daemonConnected;
      this.state.config = s.config || null;
      if (s.status) { this.state.status = s.status; this.state.physicalKeyboard = !!s.status.keyboard_present; }
      if (this.state.daemonConnected) this.state.tvMode = true;
      this.emit('state', this.state);
    },
  };

  M.bridge = bridge;
})(window.PioneerTV);
