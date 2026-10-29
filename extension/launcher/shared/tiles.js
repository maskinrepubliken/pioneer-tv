// Pioneer TV tiles: the box's services as big tiles of one size, and the
// pad's legend under them; at the left a column of its own, the buttons in
// the middle and the box's status at the foot. The home page
// (home/home.js) is this sheet; the overlay's menus (overlay/hud.js) use
// its row of holes on a choice that opens a page. Each wires its own choices:
// the page's spatial navigation focuses them (pioneertv-focus), the
// overlay's menu marks them (pioneertv-menu-active). Styled by tiles.css.
//
//   M.tiles.sheet({ side, rows, legend }) -> the sheet
//
// side: [{ label, icon, round, disabled, run }] (the column of buttons at
// the left, top to bottom); rows:
// [[{ label, art, color, disabled, run }], ...] (the tiles); legend: [[keys,
// text], ...], a key 'arrows' for the four arrows. Each item gets its el.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function tile(it, n) {
    const t = el('button', 'pioneertv-card tiles-tile' + (it.disabled ? ' pioneertv-menu-disabled' : ''));
    t.type = 'button';
    t.style.setProperty('--tile-color', it.color || '#444');
    t.dataset.key = it.key || `tile:${it.label}`;
    t.appendChild(el('span', 'tiles-band'));
    const pic = el('span', 'tiles-art');
    pic.innerHTML = it.art;
    t.appendChild(pic);
    const text = el('span', 'tiles-text');
    text.dataset.punch = '';
    text.appendChild(el('span', 'tiles-name', it.label));
    t.appendChild(text);
    it.el = t;
    return t;
  }

  // A button in the column: its symbol and its name, or (round) its symbol
  // alone in a ring (paper.css, pioneertv-round).
  function sideButton(it) {
    const btn = el('button', (it.round ? 'pioneertv-round' : 'tiles-btn') + (it.disabled ? ' pioneertv-menu-disabled' : ''));
    btn.type = 'button';
    btn.dataset.key = it.key || `btn:${it.label}`;
    if (it.disabled) btn.disabled = true;
    btn.innerHTML = M.icons.html(it.icon);
    if (it.round) { btn.title = it.label; btn.setAttribute('aria-label', it.label); }
    else btn.appendChild(el('span', '', it.label));
    it.el = btn;
    return btn;
  }

  // The status pills: a hole filled when the thing is up, never colour alone.
  function pills() {
    const box = el('div', 'tiles-pills');
    const s = b.state.status || {};
    const w = s.wifi || {};
    const eth = (s.interfaces || []).find((i) => i.name.startsWith('e') && i.addresses.length);
    const pill = (icon, text, on, warn) => {
      const p = el('span', 'tiles-pill' + (on ? ' on' : '') + (warn ? ' warn' : ''));
      p.innerHTML = M.icons.html(icon);
      p.title = text;
      box.appendChild(p);
    };
    if (w.state === 'connected') pill('wifi', w.ssid || 'Wi-Fi', true);
    else if (eth) pill('ethernet', 'Ethernet', true);
    else pill('wifi', 'Inget nätverk', false);
    const pads = s.gamepads || [];
    pill('gamepad', pads.length === 2 ? 'Båda handkontrollerna anslutna' : pads.length > 2 ? `${pads.length} handkontroller anslutna` : pads.length ? pads[0].name : 'Ingen handkontroll', pads.length > 0);
    pill('daemon', b.state.daemonConnected ? 'Daemon' : 'Ingen daemon', b.state.daemonConnected);
    return box;
  }

  function legend(items) {
    const foot = el('footer', 'tiles-legend');
    for (const [keys, text] of items) {
      const s = el('span');
      for (const k of keys) s.appendChild(M.icons.key(k));     // as on the pad (icons.js)
      s.append(` ${text}`);
      foot.appendChild(s);
    }
    return foot;
  }

  // Every tile's name shares one size: the largest at which the widest fits.
  function fitNames(sheet) {
    const names = [...sheet.querySelectorAll('.tiles-name')];
    names.forEach((n) => { n.style.fontSize = ''; });
    let scale = 1;
    for (const n of names) {
      const range = document.createRange();
      range.selectNodeContents(n);
      const w = range.getBoundingClientRect().width;
      if (w > n.clientWidth) scale = Math.min(scale, (n.clientWidth - 1) / w);
    }
    if (scale < 1) names.forEach((n) => { n.style.fontSize = `${parseFloat(getComputedStyle(n).fontSize) * scale}px`; });
  }

  function sheet({ side = [], rows = [], legend: keys = [] }) {
    const root = el('div', 'tiles-sheet');
    const rail = el('aside', 'tiles-rail');
    const column = el('nav', 'tiles-buttons');
    side.forEach((it) => column.appendChild(sideButton(it)));
    rail.append(column, pills());
    const body = el('div', 'tiles-body');
    const main = el('main', 'tiles-content');
    // Every row as many columns as the longest, so the tiles are one size.
    const columns = String(Math.max(1, Math.min(Math.max(...rows.map((r) => r.length)), 5)));
    let n = 0;
    for (const row of rows) {
      if (!row.length) continue;
      const r = el('section', 'tiles-row');
      r.style.setProperty('--tiles', columns);
      row.forEach((it) => r.appendChild(tile(it, ++n)));
      main.appendChild(r);
    }
    body.append(main, legend(keys));
    root.append(rail, body);
    return root;
  }

  // Opening a page can take a while on a weak network, and until the new
  // page has loaded the old one stays on screen. So the choice answers at
  // once: a row of holes is punched into it, one at a time, like a card
  // going through the reader, and starts over until the page changes (each
  // hole goes from empty to ochre in one step: the system has no fades).
  // Returns stop(); it stops by itself after 25 s.
  function punch(target, onGiveUp) {
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
    const detail = target.querySelector('.pioneertv-menu-detail');
    if (detail) detail.hidden = true;
    // A tile has a place for the row, under its picture.
    const slot = target.querySelector('[data-punch]');
    if (slot) slot.prepend(svg); else target.appendChild(svg);
    target.setAttribute('aria-busy', 'true');
    let step = 0;
    const draw = () => { const lit = step++ % (N + 2); holes.forEach((h, i) => h.classList.toggle('punched', i < lit)); };
    draw();
    const timer = setInterval(draw, 160);
    let giveUp = null;
    const stop = () => {
      clearInterval(timer); clearTimeout(giveUp);
      svg.remove(); target.removeAttribute('aria-busy');
      if (detail) detail.hidden = false;
    };
    giveUp = setTimeout(() => { stop(); if (onGiveUp) onGiveUp(); }, 25000);
    return stop;
  }

  M.tiles = { sheet, pills, fitNames, punch };
})(window.PioneerTV);
