// Pioneer TV main menu: what Home opens over any window (overlay/hud.js
// draws it), a sheet over nearly the whole screen: the services as big
// tiles, Live (a submenu), and at the top Tillbaka, Ladda om, Tangentbord,
// Sök, Inställningar (a submenu) and the TV's off button. The home page
// itself is only the clock (launcher/index.html).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;
  const services = () => {
    const s = b.state.config && b.state.config.services;
    return Array.isArray(s) && s.length ? s : (M.defaultServices || []);
  };
  // A relative url is a page of the launcher (the radio player).
  const resolve = (url) => {
    try { return new URL(url, b.launcherUrl).href; } catch { return url; }
  };
  const art = (s) => (s.logo ? `<img src="${encodeURI(s.logo)}" alt="">` : M.art.html(s.id, s.color || '#444'));

  // The live channels, TV first then radio.
  function live(list) {
    const order = (s) => (s.kind === 'radio' ? 1 : 0);
    return {
      title: 'Live',
      items: [...list].sort((x, y) => order(x) - order(y)).map((s, i) => ({
        label: s.name, icon: s.kind === 'radio' ? 'radio' : 'tv', primary: i === 0, opens: true,
        run: () => b.navigate(resolve(s.url)),
      })),
    };
  }

  // Sök: the on-screen keyboard here in the overlay, on a field of its own;
  // OK lists the services that can search for it.
  const form = document.createElement('form');
  form.className = 'pioneertv-search-field';
  const field = document.createElement('input');
  field.type = 'search';
  field.placeholder = 'Sök film, serie eller spel…';
  field.autocomplete = 'off';
  form.appendChild(field);
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(form));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = field.value.trim();
    if (!q) return;
    const menu = M.hud.menu;
    if (!menu.isOpen()) menu.open(spec());
    if (menu.stack[menu.stack.length - 1].search) menu.stack.pop();
    menu.push(targets(q));
  });
  // The keyboard opens over the menu, which has the pad back when it closes.
  function search() {
    field.value = '';
    M.keyboard.open(field);
  }
  function targets(query) {
    const note = document.createElement('div');
    note.className = 'pioneertv-menu-note';
    note.append('efter ');
    const em = document.createElement('em');
    em.textContent = `”${query}”`;
    note.append(em, ' på');
    const items = services().filter((s) => s.search_url).map((s, i) => ({
      label: s.name, icon: 'search', primary: i === 0, opens: true,
      run: () => b.navigate(resolve(s.search_url.replace('{query}', encodeURIComponent(query)))),
    }));
    items.push({ label: 'Ändra sökningen', icon: 'keyboard', keep: true, run: () => { field.value = query; M.keyboard.open(field); } });
    return { title: 'Sök', note, items, search: true };
  }

  // The settings page's tabs, and the box's status at the foot.
  const SECTIONS = [
    ['status', 'Status', 'info'], ['gamepads', 'Handkontroller', 'gamepad'], ['wifi', 'Wi-Fi', 'wifi'],
    ['services', 'Tjänster', 'menu'], ['tv', 'TV', 'tv'], ['controls', 'Kontroller', 'keyboard'],
    ['remote', 'Fjärråtkomst', 'link'], ['system', 'System', 'gear'],
  ];
  const settings = () => ({
    title: 'Inställningar',
    status: true,
    wide: true,
    items: SECTIONS.map(([id, label, icon]) => ({ label, icon, grid: 'pair', opens: true, run: () => b.settings(id) })),
  });

  // ------------------------------------------------------------ the sheet
  // The main menu covers nearly the whole screen, laid out as the start page
  // was: the box's status and its buttons at the top, the services as big
  // tiles in two rows (the second: Bilder, and Live for the channels), the
  // pad's legend at the foot. Sized in em of 1/80 of the width, like the
  // launcher pages, so a laptop window and the TV look the same.
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function tile(it, n) {
    const t = el('div', 'pioneertv-card mm-tile' + (it.disabled ? ' pioneertv-menu-disabled' : ''));
    t.style.setProperty('--tile-color', it.color || '#444');
    t.appendChild(el('span', 'mm-band'));
    const pic = el('div', 'mm-art');
    pic.innerHTML = it.art;
    t.appendChild(pic);
    const text = el('div', 'mm-text');
    text.dataset.punch = '';
    text.appendChild(el('div', 'mm-name', it.label));
    t.appendChild(text);
    t.appendChild(el('span', 'mm-index', String(n).padStart(2, '0')));
    it.el = t;
    return t;
  }

  function headButton(it) {
    const btn = el('div', 'mm-btn' + (it.disabled ? ' pioneertv-menu-disabled' : ''));
    btn.innerHTML = M.icons.html(it.icon);
    btn.appendChild(el('span', '', it.label));
    it.el = btn;
    return btn;
  }

  // The status pills: a hole filled when the thing is up, never colour alone.
  function pills() {
    const box = el('div', 'mm-pills');
    const s = b.state.status || {};
    const w = s.wifi || {}, t = s.tailscale || {};
    const eth = (s.interfaces || []).find((i) => i.name.startsWith('e') && i.addresses.length);
    const pill = (icon, text, on, warn) => {
      const p = el('span', 'mm-pill' + (on ? ' on' : '') + (warn ? ' warn' : ''));
      p.innerHTML = M.icons.html(icon);
      p.title = text;
      box.appendChild(p);
    };
    if (w.state === 'connected') pill('wifi', w.ssid || 'Wi-Fi', true);
    else if (eth) pill('ethernet', 'Ethernet', true);
    else pill('wifi', 'Inget nätverk', false);
    pill('link', 'Tailscale', t.state === 'running', t.state === 'running' && t.server_online === false);
    const pads = s.gamepads || [];
    pill('gamepad', pads.length > 1 ? `${pads.length} handkontroller` : pads.length ? pads[0].name : 'Ingen handkontroll', pads.length > 0);
    pill('daemon', b.state.daemonConnected ? 'Daemon' : 'Ingen daemon', b.state.daemonConnected);
    return box;
  }

  function legend() {
    const foot = el('footer', 'mm-legend');
    const add = (keys, text) => {
      const s = el('span');
      for (const k of keys) {
        if (k.startsWith('arrow')) { const i = el('i'); i.innerHTML = M.icons.html(k); s.appendChild(i); }
        else s.appendChild(el('kbd', 'pioneertv-kbd', k));
      }
      s.append(` ${text}`);
      foot.appendChild(s);
    };
    add(['arrowLeft', 'arrowRight', 'arrowUp', 'arrowDown'], 'navigera');
    add(['A'], 'välj');
    add(['B'], 'stäng');
    add(['Y'], 'tangentbord');
    add(['HEM'], 'stäng · håll: hem');
    const credit = el('span', 'credit');
    const img = el('img');
    img.src = new URL('../launcher/ordbild-en-rad-black.svg', location.href).href;
    img.alt = 'Maskinrepubliken';
    credit.appendChild(img);
    foot.appendChild(credit);
    return foot;
  }

  // Every tile's name shares one size: the largest at which the widest fits.
  function fitNames(sheet) {
    const names = [...sheet.querySelectorAll('.mm-name')];
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

  function spec() {
    const all = services();
    const isLive = (s) => s.row === 'live';
    const isSecond = (s) => s.row === 'second';
    const tv = b.state.daemonConnected;
    const service = (s) => ({ label: s.name, art: art(s), color: s.color, opens: true, run: () => b.navigate(resolve(s.url)) });
    const first = all.filter((s) => !isLive(s) && !isSecond(s)).map(service);
    const second = all.filter(isSecond).map(service);
    const channels = all.filter(isLive);
    if (channels.length) second.push({ label: 'Live', art: M.art.html('live', '#a8352a'), color: '#a8352a', sub: () => live(channels) });
    // The page below and the box; the detail is the button that does the same without the menu.
    const head = [
      { label: 'Tillbaka', icon: 'back', run: () => b.back() },
      { label: 'Ladda om', icon: 'reload', run: () => b.reload() },
      { label: 'Tangentbord', icon: 'keyboard', run: () => b.keyboard() },
      { label: 'Sök', icon: 'search', keep: true, run: search },
      { label: 'Inställningar', icon: 'gear', sub: settings },
      { label: 'Stäng av TV:n', icon: 'power', run: () => b.cec('tv_off'), disabled: !tv },
    ];
    const items = [...first, ...second, ...head];
    return {
      title: 'Meny',
      items,
      build() {
        const sheet = el('div', 'pioneertv-menu-sheet');
        const top = el('header', 'mm-head');
        top.appendChild(pills());
        const buttons = el('div', 'mm-buttons');
        head.forEach((it) => buttons.appendChild(headButton(it)));
        top.appendChild(buttons);
        sheet.appendChild(top);
        const main = el('main', 'mm-content');
        let n = 0;
        for (const row of [first, second]) {
          if (!row.length) continue;
          const r = el('section', 'mm-tiles');
          r.style.setProperty('--tiles', String(Math.max(1, Math.min(row.length, 5))));
          row.forEach((it) => r.appendChild(tile(it, ++n)));
          main.appendChild(r);
        }
        sheet.appendChild(main);
        sheet.appendChild(legend());
        return sheet;
      },
      mounted(sheet) {
        fitNames(sheet);
        if (document.fonts) document.fonts.ready.then(() => sheet.isConnected && fitNames(sheet));
      },
    };
  }

  M.mainMenu = { spec, search };
})(window.PioneerTV);
