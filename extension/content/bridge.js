// Pioneer TV bridge: the only place that touches chrome.* APIs.
//
// Every other script works without an extension context so the launcher and
// overlays can be opened as plain files while designing.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const listeners = {};
  const hasExt = !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
  const params = new URLSearchParams(location.search);

  const bridge = {
    available: hasExt,
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
    daemon(payload) { this.send({ type: 'daemon', payload }); },
    cec(command) { this.daemon({ type: 'cec', command }); },
    navigate(url) {
      if (hasExt) this.send({ type: 'navigate', url });
      else location.href = url;
    },
    home() {
      if (hasExt) this.send({ type: 'home' });
      else location.href = M.launcherUrl || '../launcher/index.html';
    },
    settings() {
      if (hasExt) this.send({ type: 'settings' });
      else location.href = 'http://127.0.0.1:8765/';
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
      if (!hasExt) { this.emit('state', this.state); return; }
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'state') this._applyState(msg);
        else if (msg.type === 'event') this.emit(msg.name, msg);
      });
      chrome.runtime.sendMessage({ type: 'getState' }).then((s) => s && this._applyState(s)).catch(() => {});
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
