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
    // Is this page a game service (RomM, EmulatorJS)? Then the pad belongs to it.
    gameMode() {
      const services = (this.state.config && this.state.config.services) || [];
      return services.some((s) => {
        if (s.mode !== 'game' && s.id !== 'romm') return false;
        try { const u = new URL(s.url); return u.hostname === location.hostname && (u.port || '') === (location.port || ''); } catch { return false; }
      });
    },
    // Should Enter in a text field pop the on-screen keyboard?
    autoKeyboard() {
      if (!this.state.tvMode || this.state.physicalKeyboard || this.gameMode()) return false;
      const ui = (this.state.config && this.state.config.ui) || {};
      return ui.auto_keyboard !== false;
    },

    init() {
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
