// Pioneer TV HUD, the overlay's part: every toast and every menu, drawn
// over whatever window is below (Chromium, RetroArch, mpv). The pages send their toasts here (content/hud.js).
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
    const first = !this.toastEl;
    this.toastEl = M.toastCard(text, icon, this.toastEl);
    if (first) {
      this.toastEl.setAttribute('data-pioneertv-overlay', '');
      M.bridge.mount(this.toastEl);
    }
    this.toastEl.classList.add('pioneertv-toast-show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('pioneertv-toast-show'), ms);
  };

  // ------------------------------------------------------------ menu
  // A menu: { title, note, items, wide, status }, or one that draws itself
  // whole (build: the main menu's sheet, which gives each item its el; the
  // submenus opened from it are drawn over it). An item: { label, icon,
  // detail, primary, disabled, run, keep (stays open after run), opens (a
  // page: holes are punched on it until that page has loaded), volume (left
  // and right step the TV's volume), sub (a function giving the submenu),
  // grid ('pair': items side by side, two to a row) }.
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
      const root = document.createElement('div');
      root.className = 'pioneertv-menu';
      root.setAttribute('data-pioneertv-overlay', '');
      // A sheet at the bottom of the stack stays under its submenus.
      const base = this.stack[0];
      if (base !== spec && base.build) {
        const under = base.build();
        under.classList.add('pioneertv-menu-under');
        root.appendChild(under);
      }
      this.items = spec.items;
      const panel = spec.build ? spec.build() : this.panel(spec);
      this.items.forEach((it, i) => it.el.addEventListener('click', () => { this.index = i; this.highlight(); this.activate(); }));
      root.appendChild(panel);
      if (this.root) M.bridge.unmount(this.root);
      M.bridge.mount(root, { modal: true });
      this.root = root;
      if (spec.mounted) spec.mounted(panel);
      this.index = Math.min(spec.at || 0, this.items.length - 1);
      if (this.items[this.index] && this.items[this.index].disabled) this.index = Math.max(0, this.items.findIndex((it) => !it.disabled));
      this.highlight();
      M.nav.captured = this;
      if (!was) M.bridge.emit('menu:open');
    },
    // The card: a title, a note, the items in groups, the status.
    panel(spec) {
      const b = M.bridge;
      const panel = document.createElement('div');
      panel.className = 'pioneertv-menu-panel' + (spec.wide ? ' pioneertv-menu-wide' : '');
      const title = document.createElement('div');
      title.className = 'pioneertv-menu-title';
      title.textContent = spec.title || 'Meny';
      panel.append(title);
      if (spec.note) panel.appendChild(spec.note);
      let group = null;
      let groupKind = null;
      spec.items.forEach((it) => {
        const kind = it.grid || 'list';
        if (!group || kind !== groupKind) {
          group = document.createElement('div');
          group.className = `pioneertv-menu-items pioneertv-menu-${kind}`;
          groupKind = kind;
          panel.appendChild(group);
        }
        group.appendChild(this.item(it));
      });
      if (spec.status) panel.appendChild(this.statusBlock(b.state.status, b.state.daemonConnected));
      return panel;
    },
    // One choice as a row: its icon, its name and a detail at the right.
    item(it) {
      const el = document.createElement('div');
      el.className = 'pioneertv-menu-item' + (it.primary ? ' pioneertv-menu-primary' : '') + (it.disabled ? ' pioneertv-menu-disabled' : '');
      el.innerHTML = `<span class="pioneertv-menu-icon">${M.icons.html(it.icon)}</span>`;
      const name = document.createElement('span'); name.className = 'pioneertv-menu-label'; name.textContent = it.label; el.appendChild(name);
      const detail = it.detail || (it.sub ? '›' : '');
      if (detail) { const d = document.createElement('span'); d.className = 'pioneertv-menu-detail'; d.textContent = detail; el.appendChild(d); }
      it.el = el;
      return el;
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
    // The row of holes on a choice that opens a page (tiles.js); a page
    // that never says it has loaded: the menu goes anyway.
    punch(el) {
      const stop = M.tiles.punch(el, () => { this.punching = null; this.close(); });
      this.punching = () => { stop(); this.punching = null; };
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

  // ------------------------------------------------------------ the daemon's notes
  // Toasts from the daemon and the pages, a pad or a keyboard coming and
  // going, the volume, the screensaver (saver.js) and the pad's colours.
  hud.listen = function (b) {
    b.on('toast', (e) => hud.toast(e.text, e.icon || '', e.ms || 1800));
    b.on('saver', (e) => (e.show ? M.saver.show() : M.saver.hide()));
    b.on('rest', (e) => M.saver.rest(!!e.on));
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
