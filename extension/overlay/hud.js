// Pioneer TV HUD, the overlay's part: every toast, every menu and the
// screensaver, drawn over whatever window is below (Chromium, RetroArch,
// mpv). The pages send their toasts here (content/hud.js).
//
// The menu is one panel with a stack: the main menu (overlay/main-menu.js),
// its submenus (Live, Sök, Inställningar) and the pause panels of a game or
// a film. B goes one step back, the last step closes it.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const hud = M.hud;

  // ------------------------------------------------------------ toast
  hud.toastEl = null;
  hud.toastTimer = null;
  hud.toast = function (text, icon = '', ms = 1800) {
    if (!this.toastEl) {
      this.toastEl = document.createElement('div');
      this.toastEl.className = 'pioneertv-toast pioneertv-card';
      this.toastEl.setAttribute('data-pioneertv-overlay', '');
      M.bridge.mount(this.toastEl);
    }
    this.toastEl.innerHTML = '';
    if (icon) { const i = document.createElement('span'); i.className = 'pioneertv-toast-icon'; i.appendChild(M.icons.svg(M.icons.names.includes(icon) ? icon : 'info')); this.toastEl.appendChild(i); }
    const t = document.createElement('span'); t.textContent = text; this.toastEl.appendChild(t);
    this.toastEl.classList.add('pioneertv-toast-show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('pioneertv-toast-show'), ms);
  };

  // ------------------------------------------------------------ menu
  // A menu: { title, note, items, wide, status }. An item: { label, icon,
  // detail, primary, disabled, run, keep (stays open after run), opens (a
  // page: holes are punched on it until that page has loaded), volume (left
  // and right step the TV's volume), sub (a function giving the submenu),
  // art and color (a service's picture), grid ('cards' or 'pair': items
  // side by side, two to a row) }.
  hud.menu = {
    root: null, stack: [], index: 0, items: [],
    isOpen() { return !!(this.root && this.root.isConnected); },
    // Home: the main menu, or away with whatever is open.
    toggle() { this.isOpen() ? this.close() : this.open(M.mainMenu.spec()); },
    open(spec) {
      this.stack = [spec];
      this.render();
    },
    push(spec) {
      this.stack[this.stack.length - 1].at = this.index;
      this.stack.push(spec);
      this.render();
    },
    back() {
      if (this.stack.length > 1) { this.stack.pop(); this.render(); }
      else this.close();
    },
    close() {
      if (this.punching) this.punching();
      const was = this.isOpen();
      if (this.root) M.bridge.unmount(this.root);
      this.root = null;
      this.stack = [];
      if (M.nav.captured === this) M.nav.captured = null;
      if (was) M.bridge.emit('menu:close');
    },
    // Draws the menu on top of the stack, in place of the one before.
    render() {
      if (this.punching) this.punching();
      const spec = this.stack[this.stack.length - 1];
      const was = this.isOpen();
      const b = M.bridge;
      this.items = spec.items;
      const root = document.createElement('div');
      root.className = 'pioneertv-menu';
      root.setAttribute('data-pioneertv-overlay', '');
      const panel = document.createElement('div');
      panel.className = 'pioneertv-menu-panel' + (spec.wide ? ' pioneertv-menu-wide' : '');
      const title = document.createElement('div');
      title.className = 'pioneertv-menu-title';
      title.textContent = spec.title || 'Meny';
      panel.append(title);
      if (spec.note) panel.appendChild(spec.note);
      let group = null;
      let groupKind = null;
      this.items.forEach((it, i) => {
        const kind = it.grid || 'list';
        if (!group || kind !== groupKind) {
          group = document.createElement('div');
          group.className = `pioneertv-menu-items pioneertv-menu-${kind}`;
          groupKind = kind;
          panel.appendChild(group);
        }
        const el = document.createElement('div');
        el.className = 'pioneertv-menu-item' + (it.grid === 'cards' ? ' pioneertv-menu-card' : '') + (it.primary ? ' pioneertv-menu-primary' : '') + (it.disabled ? ' pioneertv-menu-disabled' : '');
        if (it.art) {
          const art = document.createElement('span');
          art.className = 'pioneertv-menu-art';
          art.innerHTML = it.art;
          el.appendChild(art);
        } else {
          el.innerHTML = `<span class="pioneertv-menu-icon">${M.icons.html(it.icon)}</span>`;
        }
        const name = document.createElement('span'); name.className = 'pioneertv-menu-label'; name.textContent = it.label; el.appendChild(name);
        const detail = it.detail || (it.sub ? '›' : '');
        if (detail) { const d = document.createElement('span'); d.className = 'pioneertv-menu-detail'; d.textContent = detail; el.appendChild(d); }
        el.addEventListener('click', () => { this.index = i; this.highlight(); this.activate(); });
        it.el = el;
        group.appendChild(el);
      });
      if (spec.status) panel.appendChild(this.statusBlock(b.state.status, b.state.daemonConnected));
      root.appendChild(panel);
      if (this.root) M.bridge.unmount(this.root);
      M.bridge.mount(root, { modal: true });
      this.root = root;
      this.index = Math.min(spec.at || 0, this.items.length - 1);
      if (this.items[this.index] && this.items[this.index].disabled) this.index = Math.max(0, this.items.findIndex((it) => !it.disabled));
      this.highlight();
      M.nav.captured = this;
      if (!was) M.bridge.emit('menu:open');
    },
    // Compact status rows at the foot: Wi-Fi, Tailscale, pads, temperature.
    statusBlock(s, connected) {
      const box = document.createElement('div');
      box.className = 'pioneertv-menu-status';
      const row = (cls, text) => {
        const r = document.createElement('div');
        r.className = 'pioneertv-menu-statusrow';
        r.innerHTML = `<span class="pioneertv-menu-dot ${cls}"></span><span></span>`;
        r.lastElementChild.textContent = text;
        box.appendChild(r);
      };
      if (!connected || !s) { row('bad', connected ? 'Väntar på status…' : 'Ingen daemon (designläge)'); return box; }
      const w = s.wifi || {}, t = s.tailscale || {}, sys = s.system || {};
      const eth = (s.interfaces || []).find((i) => i.name.startsWith('e') && i.addresses.length);
      if (w.state === 'connected') row('ok', `${w.ssid}${w.signal != null ? ` ${w.signal}%` : ''}`);
      else if (eth) row('ok', `Ethernet ${eth.addresses[0]}`);
      else row('bad', 'Inget nätverk');
      const srv = t.server_name || 'Server';
      if (t.state === 'running') row(t.server_online === false ? 'warn' : 'ok', `Tailscale${t.server_online != null ? (t.server_online ? ` · ${srv} online` : ` · ${srv} offline`) : ''}`);
      else row(t.installed ? 'warn' : 'bad', t.installed ? `Tailscale ${t.state}` : 'Tailscale saknas');
      const pads = s.gamepads || [];
      // One pad: its name (and battery). Several: just how many, since two
      // of the same model would only repeat one long name.
      const padText = pads.length > 1 ? `${pads.length} handkontroller`
        : pads.length ? pads[0].name + (pads[0].battery != null ? ` ${pads[0].battery}%` : '')
        : 'Ingen handkontroll';
      row(pads.length ? 'ok' : 'warn', padText);
      row(sys.throttled_now ? 'bad' : sys.throttled_ever ? 'warn' : 'ok', `${sys.temp_c != null ? sys.temp_c + ' °C' : '–'}${sys.throttled_now ? ' · underspänning' : ''}`);
      return box;
    },
    highlight() { this.items.forEach((it, i) => it.el.classList.toggle('pioneertv-menu-active', i === this.index)); },
    activate() {
      const it = this.items[this.index];
      if (!it || it.disabled || this.punching) return;
      if (it.sub) { this.push(it.sub()); return; }
      // A choice that opens a page keeps the menu and punches the row of
      // holes on it until that page has loaded ("loaded", overlay.js).
      if (it.opens) { this.punch(it.el); it.run(); return; }
      if (!it.keep) this.close();
      it.run();
    },
    punch(el) {
      const ns = 'http://www.w3.org/2000/svg', N = 7, PITCH = 20;
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'pioneertv-menu-opening');
      svg.setAttribute('viewBox', `0 0 ${N * PITCH} ${PITCH}`);
      svg.setAttribute('aria-hidden', 'true');
      const holes = [];
      for (let i = 0; i < N; i++) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', String(i * PITCH + PITCH / 2));
        c.setAttribute('cy', String(PITCH / 2));
        c.setAttribute('r', '6');
        svg.appendChild(c);
        holes.push(c);
      }
      const detail = el.querySelector('.pioneertv-menu-detail');
      if (detail) detail.hidden = true;
      el.appendChild(svg);
      el.setAttribute('aria-busy', 'true');
      let step = 0;
      const draw = () => { const lit = step++ % (N + 2); holes.forEach((h, i) => h.classList.toggle('punched', i < lit)); };
      draw();
      const timer = setInterval(draw, 160);
      const stop = () => {
        clearInterval(timer); clearTimeout(giveUp);
        svg.remove(); el.removeAttribute('aria-busy');
        if (detail) detail.hidden = false;
        this.punching = null;
      };
      // A page that never says it has loaded: the menu goes anyway.
      const giveUp = setTimeout(() => { stop(); this.close(); }, 25000);
      this.punching = stop;
    },
    // The d-pad moves to the nearest item that way on screen, so a grid of
    // cards and a list are walked alike; a plain list wraps round.
    move(key) {
      const from = this.items[this.index];
      if (!from) return;
      const a = from.el.getBoundingClientRect();
      const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best = -1, bestScore = Infinity;
      this.items.forEach((it, i) => {
        if (i === this.index || it.disabled) return;
        const r = it.el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const along = { ArrowUp: ay - y, ArrowDown: y - ay, ArrowLeft: ax - x, ArrowRight: x - ax }[key];
        const across = key === 'ArrowUp' || key === 'ArrowDown' ? Math.abs(x - ax) : Math.abs(y - ay);
        if (along < 4) return;
        const score = along + across * 2;
        if (score < bestScore) { bestScore = score; best = i; }
      });
      if (best < 0 && (key === 'ArrowUp' || key === 'ArrowDown')) {
        // Round from the last to the first, as the list always did.
        const order = this.items.map((it, i) => i).filter((i) => !this.items[i].disabled);
        best = key === 'ArrowDown' ? order[0] : order[order.length - 1];
      }
      if (best >= 0) { this.index = best; this.highlight(); }
    },
    onKeyDown(e) {
      const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'];
      if (!handled.includes(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const it = this.items[this.index];
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && it && it.volume && !it.disabled) {
        M.bridge.cec(e.key === 'ArrowLeft' ? 'volume_down' : 'volume_up');
      } else if (e.key.startsWith('Arrow')) this.move(e.key);
      else if (e.key === 'Enter') this.activate();
      else this.back();
    },
  };

  // ------------------------------------------------------------ screensaver
  // The daemon decides when (idle.py) and takes it away at the next button.
  hud.saver = {
    clock: null,
    isOpen() { return !!(this.clock && this.clock.root.isConnected); },
    show() {
      if (this.isOpen()) return;
      this.clock = M.clock(new URL('../launcher/ordbild-en-rad-papper.svg', location.href).href);
      M.bridge.mount(this.clock.root);
    },
    hide() {
      if (!this.clock) return;
      this.clock.stop();
      M.bridge.unmount(this.clock.root);
      this.clock = null;
    },
  };

  // ------------------------------------------------------------ the daemon's notes
  // Toasts from the daemon and the pages, a pad or a keyboard coming and
  // going, the volume, the screensaver and the pad's colours.
  hud.listen = function (b) {
    b.on('toast', (e) => hud.toast(e.text, e.icon || '', e.ms || 1800));
    b.on('saver', (e) => (e.show ? hud.saver.show() : hud.saver.hide()));
    b.on('gamepad', (e) => hud.toast(`${e.label || 'Handkontroll'} ${e.connected ? 'ansluten' : 'frånkopplad'}`, 'gamepad'));
    b.on('keyboard_present', (e) => hud.toast(e.present ? 'Tangentbord anslutet' : 'Tangentbord frånkopplat', 'keyboard'));
    // Off by default: the TV draws its own volume bar (Settings → TV).
    b.on('volume', (e) => {
      const ui = (b.state.config && b.state.config.ui) || {};
      if (!ui.volume_toast) return;
      hud.toast(e.direction === 'up' ? 'Volym +' : e.direction === 'down' ? 'Volym −' : 'Ljud av', e.direction === 'mute' ? 'mute' : 'volume');
    });
    b.on('active_pad', (e) => hud.applyPad(e.pad));
  };
})(window.PioneerTV);
