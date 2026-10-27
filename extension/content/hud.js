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
      // With no argument, the quick menu. A page can show its own choices in
      // the same panel: open({ title, note, items }), items as below (the
      // start page's search targets); there is no status at the foot then.
      open(custom) {
        if (M.keyboard && M.keyboard.isOpen()) M.keyboard.close();
        if (this.isOpen()) this.close();
        const b = M.bridge;
        const tv = b && b.state.daemonConnected;
        this.items = custom ? custom.items : [
          // Most used first. The logs and the system update live on the
          // settings page (System), not here. The detail is the button that
          // does the same without the menu.
          { label: 'Tillbaka', icon: 'back', detail: 'håll B', run: () => b.back() },
          { label: 'Hem', icon: 'home', detail: 'håll Hem', primary: true, run: () => b.home() },   // ochre, like the pause panel's first choice
          // As in the player's pause panel: left and right step the TV's
          // volume on this row, A mutes.
          { label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, run: () => b.cec('mute'), keep: true, disabled: !tv },
          { label: 'Tangentbord', icon: 'keyboard', detail: 'Y', run: () => b.keyboard() },
          { label: 'Ladda om sidan', icon: 'reload', run: () => b.reload() },
          { label: 'Stäng av TV:n', icon: 'power', run: () => b.cec('tv_off'), disabled: !tv },
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
        title.textContent = custom ? custom.title : 'Meny';
        const list = document.createElement('div');
        list.className = 'pioneertv-menu-items';
        this.items.forEach((it, i) => {
          const el = document.createElement('div');
          el.className = 'pioneertv-menu-item' + (it.primary ? ' pioneertv-menu-primary' : '') + (it.disabled ? ' pioneertv-menu-disabled' : '');
          el.innerHTML = `<span class="pioneertv-menu-icon">${M.icons.html(it.icon)}</span>`;
          const name = document.createElement('span'); name.textContent = it.label; el.appendChild(name);
          if (it.detail) { const d = document.createElement('span'); d.className = 'pioneertv-menu-detail'; d.textContent = it.detail; el.appendChild(d); }
          el.addEventListener('click', () => { this.index = i; this.activate(); });
          it.el = el;
          list.appendChild(el);
        });
        panel.append(title);
        if (custom && custom.note) panel.appendChild(custom.note);
        panel.append(list);
        if (!custom) panel.appendChild(this.statusBlock(b.state.status, tv));
        root.appendChild(panel);
        M.bridge.mount(root, { modal: true });
        this.root = root;
        this.index = 0;
        this.highlight();
        M.nav.captured = this;
        M.bridge && M.bridge.emit('menu:open');
      },
      close() {
        if (this.punching) this.punching();
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
        if (!it || it.disabled || this.punching) return;
        // A choice that leaves our pages (opens: true) keeps the panel and
        // punches the start page's row of holes on its row until the next
        // page takes over, as the start page's tiles do.
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
        const giveUp = setTimeout(stop, 25000);
        this.punching = stop;
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

  // The pad in use lends the pointer its colour, the focus ring its accent
  // and everything ochre its highlight (the pink and the green 8BitDo;
  // [pads] in the config). A pad without colours leaves the design system's.
  // The change fades (content.css registers these as colours).
  // The screensaver: ink, the time and the date, and the wordmark, jumping
  // to a new place once a minute so nothing stays burnt into the panel
  // (nothing glides: the design moves only in answer to a button). The
  // daemon decides when (idle.py) and takes it away at the next button;
  // the overlay draws it over every window, a page only without one.
  hud.saver = {
    root: null, tick: null,
    isOpen() { return !!(this.root && this.root.isConnected); },
    asset(path) {
      try { if (chrome.runtime.getURL) return chrome.runtime.getURL(path); } catch {}
      return new URL(`/ext/${path}`, location.origin).href;
    },
    show() {
      if (this.isOpen()) return;
      const root = document.createElement('div');
      root.className = 'pioneertv-saver';
      root.setAttribute('data-pioneertv-overlay', '');
      if (M.bridge.sealOverlay) M.bridge.sealOverlay(root);
      const box = document.createElement('div'); box.className = 'pioneertv-saver-box';
      const time = document.createElement('p'); time.className = 'pioneertv-saver-time';
      const date = document.createElement('p'); date.className = 'pioneertv-saver-date';
      const mark = document.createElement('img'); mark.className = 'pioneertv-saver-mark'; mark.alt = 'Maskinrepubliken';
      mark.src = this.asset('launcher/ordbild-en-rad-papper.svg');
      box.append(time, date, mark);
      root.appendChild(box);
      M.bridge.mount(root);
      this.root = root;
      const draw = () => {
        const now = new Date();
        time.textContent = now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
        date.textContent = now.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
        box.style.left = `${Math.round(Math.random() * 60) + 5}%`;
        box.style.top = `${Math.round(Math.random() * 55) + 8}%`;
      };
      draw();
      // On the minute, so the clock is never a minute behind.
      const next = () => { this.tick = setTimeout(() => { draw(); next(); }, 60000 - (Date.now() % 60000) + 50); };
      next();
    },
    hide() {
      clearTimeout(this.tick);
      if (this.root) M.bridge.unmount(this.root);
      this.root = null;
    },
  };

  hud.applyPad = function (pad) {
    const root = document.documentElement;
    if (!root) return;
    const set = (name, value) => (value ? root.style.setProperty(name, value) : root.style.removeProperty(name));
    set('--pioneertv-pointer-fill', pad && pad.pointer);
    set('--pioneertv-focus', pad && pad.accent);
    set('--pioneertv-ochre', pad && pad.highlight);
    set('--pioneertv-focus-on-dark', pad && pad.highlight);
    // Text on the highlight: ink on a light one, paper on a dark one.
    set('--pioneertv-on-ochre', pad && pad.highlight && dark(pad.highlight) ? 'var(--pioneertv-on-dark)' : null);
  };
  function dark(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return false;
    const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18;
  }

  // Back on a page kept in the back/forward cache: a panel left open while
  // its choice was opening another page closes.
  window.addEventListener('pageshow', (e) => { if (e.persisted && hud.menu.isOpen()) hud.menu.close(); });

  M.hud = hud;
})(window.PioneerTV);
