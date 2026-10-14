// Pioneer TV HUD: toasts and the quick menu (Start button).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const hud = {
    toastEl: null, toastTimer: null,

    toast(text, icon = '', ms = 1800) {
      if (!this.toastEl) {
        this.toastEl = document.createElement('div');
        this.toastEl.className = 'pioneertv-toast pioneertv-card';
        this.toastEl.setAttribute('data-pioneertv-overlay', '');
        M.bridge.sealOverlay(this.toastEl);
        M.bridge.mount(this.toastEl);
      }
      this.toastEl.innerHTML = '';
      if (icon) { const i = document.createElement('span'); i.className = 'pioneertv-toast-icon'; i.appendChild(M.icons.svg(M.icons.names.includes(icon) ? icon : 'info')); this.toastEl.appendChild(i); }
      const t = document.createElement('span'); t.textContent = text; this.toastEl.appendChild(t);
      this.toastEl.classList.add('pioneertv-toast-show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.toastEl.classList.remove('pioneertv-toast-show'), ms);
    },

    menu: {
      root: null, index: 0, items: [],
      isOpen() { return !!(this.root && this.root.isConnected); },
      toggle() { this.isOpen() ? this.close() : this.open(); },
      open() {
        if (M.keyboard && M.keyboard.isOpen()) M.keyboard.close();
        const b = M.bridge;
        const tv = b && b.state.daemonConnected;
        this.items = [
          // Most used first. The logs and the system update live on the
          // settings page (System), not here. The detail is the button that
          // does the same without the menu.
          { label: 'Tillbaka', icon: 'back', detail: 'håll B', run: () => (b.available ? b.send({ type: 'back' }) : history.back()) },
          { label: 'Hem', icon: 'home', detail: 'håll Hem', run: () => b.home() },
          // As in the player's pause panel: left and right step the TV's
          // volume on this row, A mutes.
          { label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, run: () => b.cec('mute'), keep: true, disabled: !tv },
          { label: 'Tangentbord', icon: 'keyboard', detail: 'Y', run: () => M.keyboard.toggle() },
          { label: 'Ladda om sidan', icon: 'reload', run: () => location.reload() },
          { label: 'Stäng av TV:n', icon: 'power', detail: 'håll Select', run: () => b.cec('tv_off'), disabled: !tv },
          { label: 'Inställningar', icon: 'gear', run: () => b.settings() },
        ];
        const root = document.createElement('div');
        root.className = 'pioneertv-menu';
        root.setAttribute('data-pioneertv-overlay', '');
        M.bridge.sealOverlay(root);
        const panel = document.createElement('div');
        panel.className = 'pioneertv-menu-panel';
        const title = document.createElement('div');
        title.className = 'pioneertv-menu-title';
        title.textContent = 'Meny';
        const list = document.createElement('div');
        list.className = 'pioneertv-menu-items';
        this.items.forEach((it, i) => {
          const el = document.createElement('div');
          el.className = 'pioneertv-menu-item' + (it.disabled ? ' pioneertv-menu-disabled' : '');
          el.innerHTML = `<span class="pioneertv-menu-icon">${M.icons.html(it.icon)}</span>`;
          const name = document.createElement('span'); name.textContent = it.label; el.appendChild(name);
          if (it.detail) { const d = document.createElement('span'); d.className = 'pioneertv-menu-detail'; d.textContent = it.detail; el.appendChild(d); }
          el.addEventListener('click', () => { this.index = i; this.activate(); });
          it.el = el;
          list.appendChild(el);
        });
        panel.append(title, list, this.statusBlock(b.state.status, tv));
        root.appendChild(panel);
        M.bridge.mount(root, { modal: true });
        this.root = root;
        this.index = 0;
        this.highlight();
        M.nav.captured = this;
        M.bridge && M.bridge.emit('menu:open');
      },
      close() {
        if (this.root) M.bridge.unmount(this.root);
        this.root = null;
        if (M.nav.captured === this) M.nav.captured = null;
        M.bridge && M.bridge.emit('menu:close');
      },
      // Compact status rows at the foot of the menu: Wi-Fi, Tailscale, pads, temperature.
      statusBlock(s, connected) {
        const box = document.createElement('div');
        box.className = 'pioneertv-menu-status';
        const row = (cls, icon, text) => {
          const r = document.createElement('div');
          r.className = 'pioneertv-menu-statusrow';
          r.innerHTML = `<span class="pioneertv-menu-dot ${cls}"></span><span></span>`;
          r.lastElementChild.textContent = text;
          box.appendChild(r);
        };
        if (!connected || !s) { row('bad', 'dot', connected ? 'Väntar på status…' : 'Ingen daemon (designläge)'); return box; }
        const w = s.wifi || {}, t = s.tailscale || {}, sys = s.system || {};
        const eth = (s.interfaces || []).find((i) => i.name.startsWith('e') && i.addresses.length);
        if (w.state === 'connected') row('ok', 'wifi', `${w.ssid}${w.signal != null ? ` ${w.signal}%` : ''}`);
        else if (eth) row('ok', 'ethernet', `Ethernet ${eth.addresses[0]}`);
        else row('bad', 'wifi', 'Inget nätverk');
        const srv = t.server_name || 'Server';
        if (t.state === 'running') row(t.server_online === false ? 'warn' : 'ok', 'link', `Tailscale${t.server_online != null ? (t.server_online ? ` · ${srv} online` : ` · ${srv} offline`) : ''}`);
        else row(t.installed ? 'warn' : 'bad', 'link', t.installed ? `Tailscale ${t.state}` : 'Tailscale saknas');
        const pads = s.gamepads || [];
        // One pad: its name (and battery). Several: just how many, since two
        // of the same model would only repeat one long name.
        const padText = pads.length > 1 ? `${pads.length} handkontroller`
          : pads.length ? pads[0].name + (pads[0].battery != null ? ` ${pads[0].battery}%` : '')
          : 'Ingen handkontroll';
        row(pads.length ? 'ok' : 'warn', 'gamepad', padText);
        row(sys.throttled_now ? 'bad' : sys.throttled_ever ? 'warn' : 'ok', 'temp', `${sys.temp_c != null ? sys.temp_c + ' °C' : '–'}${sys.throttled_now ? ' · underspänning' : ''}`);
        return box;
      },
      highlight() { this.items.forEach((it, i) => it.el.classList.toggle('pioneertv-menu-active', i === this.index)); },
      activate() {
        const it = this.items[this.index];
        if (!it || it.disabled) return;
        if (!it.keep) this.close();
        it.run();
      },
      onKeyDown(e) {
        const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'];
        if (!handled.includes(e.key)) return;
        e.preventDefault(); e.stopImmediatePropagation();
        const it = this.items[this.index];
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          if (it && it.volume && !it.disabled) M.bridge.cec(e.key === 'ArrowLeft' ? 'volume_down' : 'volume_up');
        } else if (e.key === 'ArrowUp') { this.index = (this.index - 1 + this.items.length) % this.items.length; this.highlight(); }
        else if (e.key === 'ArrowDown') { this.index = (this.index + 1) % this.items.length; this.highlight(); }
        else if (e.key === 'Enter') this.activate();
        else this.close();
      },
    },
  };

  M.hud = hud;
})(window.PioneerTV);
