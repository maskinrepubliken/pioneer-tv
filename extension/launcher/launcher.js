// Pioneer TV launcher page logic.
(function (M) {
  const b = M.bridge;
  M.launcherUrl = location.href;

  const $ = (id) => document.getElementById(id);
  const tilesEl = $('tiles');
  const liveEl = $('live');
  const searchInput = $('search');
  const targetsSection = $('search-targets');
  const targetsEl = $('targets');

  let services = M.defaultServices;
  let servicesKey = JSON.stringify(services);

  // Services with row "live" (live TV and radio) sit in a second row of their
  // own, without illustrations; everything else is a big tile in the first.
  const isLive = (s) => s.row === 'live';

  function render() {
    tilesEl.innerHTML = '';
    liveEl.innerHTML = '';
    const main = services.filter((s) => !isLive(s));
    const live = services.filter(isLive);
    tilesEl.style.setProperty('--tiles', String(Math.max(1, Math.min(main.length, 5))));
    liveEl.style.setProperty('--tiles', String(Math.max(1, live.length)));
    liveEl.hidden = !live.length;
    for (const s of live) {
      const a = document.createElement('a');
      a.className = `tile tile-live tile-live--${s.kind === 'radio' ? 'radio' : 'tv'} pioneertv-card`;
      a.href = resolve(s.url);
      a.dataset.service = s.id;
      const band = document.createElement('span'); band.className = 'band'; a.appendChild(band);
      const name = document.createElement('span'); name.className = 'name'; name.textContent = s.name; a.appendChild(name);
      a.appendChild(punchCard(s.id));
      a.addEventListener('click', (e) => { e.preventDefault(); open(s.url); });
      liveEl.appendChild(a);
    }
    for (const s of main) {
      const a = document.createElement('a');
      a.className = 'tile pioneertv-card';
      a.href = s.url;
      a.style.setProperty('--tile-color', s.color || '#444');
      a.dataset.service = s.id;
      a.style.setProperty('--i', String(tilesEl.children.length));
      const band = document.createElement('span'); band.className = 'band'; a.appendChild(band);
      const art = document.createElement('div'); art.className = 'art';
      if (s.logo) { const img = document.createElement('img'); img.className = 'logo'; img.src = s.logo; img.alt = ''; art.appendChild(img); }
      else art.innerHTML = M.art.html(s.id, s.color);
      a.appendChild(art);
      const text = document.createElement('div'); text.className = 'text';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = s.name; text.appendChild(name);
      a.appendChild(text);
      const index = document.createElement('span'); index.className = 'index'; index.textContent = `0${tilesEl.children.length + 1}`; a.appendChild(index);
      a.addEventListener('click', (e) => { e.preventDefault(); open(s.url); });
      tilesEl.appendChild(a);
    }
    fitLiveNames();
    fitMainNames();
  }

  // Channel names share one size, but a long one (Kunskapskanalen) would not
  // fit an eighth of the screen at it: that name alone is set smaller until
  // its widest line fits, instead of shrinking every channel.
  // Each channel's own punch card: one row of the system's perforation along
  // the bottom of its tile, in the rutnät's proportions (hole radius just under
  // a quarter of the pitch, round holes only). The holes come in runs of one to
  // four with gaps of up to three, like punched data, and the pattern is drawn
  // from the channel's id, so a channel always has the same card. Each hole
  // takes one of the palette's colours, also drawn from the id.
  const PERF_COLS = 11, PERF_ROWS = 2, PITCH = 75, PITCH_Y = 150, HOLE = 18.5;
  const HOLE_COLOURS = ['--pioneertv-surface-forest', '--pioneertv-surface-rust', '--pioneertv-ochre', '--pioneertv-surface-ink'];
  function punchCard(id) {
    let seed = 0;
    for (const ch of String(id)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const holes = [];
    for (let row = 0; row < PERF_ROWS; row++) {
      let col = Math.floor(rand() * 2);
      while (col < PERF_COLS) {
        const run = 2 + Math.floor(rand() * 3);                 // runs of two to four
        for (let i = 0; i < run && col < PERF_COLS; i++, col++) holes.push([col, row]);
        col += 1 + Math.floor(rand() * 2);                      // gaps of one or two
      }
    }
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'perf');
    svg.setAttribute('viewBox', `0 0 ${PERF_COLS * PITCH} ${(PERF_ROWS - 1) * PITCH_Y + PITCH}`);
    svg.setAttribute('aria-hidden', 'true');
    for (const [c, r] of holes) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(c * PITCH + PITCH / 2));
      dot.setAttribute('cy', String(r * PITCH_Y + PITCH / 2));
      dot.setAttribute('r', String(HOLE));
      dot.style.fill = `var(${HOLE_COLOURS[Math.floor(rand() * HOLE_COLOURS.length)]})`;
      svg.appendChild(dot);
    }
    return svg;
  }

  function fitLiveNames() {
    const run = () => {
      // Close to one size for every channel. The widest name (KUNSKAPS-)
      // sets the base, the size at which it fits inside its name box's side
      // padding; the others may be a little larger than that, up to
      // LIVE_STEP times the base, but never larger than their own tile allows.
      const LIVE_STEP = 1.15;
      const names = [...liveEl.querySelectorAll('.name')];
      names.forEach((n) => { n.style.fontSize = ''; });
      const fits = names.map((n) => {
        const cs = getComputedStyle(n);
        const room = n.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const range = document.createRange();
        range.selectNodeContents(n);
        const w = range.getBoundingClientRect().width;
        return { n, base: parseFloat(cs.fontSize), fit: w > 0 ? Math.min(1, room / w) * 0.98 : 1 };
      });
      const base = Math.min(...fits.map((f) => f.fit));
      for (const f of fits) {
        const scale = Math.min(f.fit, base * LIVE_STEP);
        if (scale < 1) f.n.style.fontSize = `${f.base * scale}px`;
      }
    };
    run();
    if (document.fonts) document.fonts.ready.then(run);
  }
  window.addEventListener('resize', fitLiveNames);

  // The first row's titles share one size: the largest at which the widest
  // (CINEASTERNA) fits its tile with the tile's own padding as air, so every
  // title can sit centred.
  function fitMainNames() {
    const run = () => {
      const names = [...tilesEl.querySelectorAll('.name')];
      names.forEach((n) => { n.style.fontSize = ''; });
      let scale = 1;
      for (const n of names) {
        const range = document.createRange();
        range.selectNodeContents(n);
        const w = range.getBoundingClientRect().width;
        if (w > n.clientWidth) scale = Math.min(scale, (n.clientWidth - 1) / w);
      }
      if (scale < 1) names.forEach((n) => { n.style.fontSize = `${parseFloat(getComputedStyle(n).fontSize) * scale}px`; });
    };
    run();
    if (document.fonts) document.fonts.ready.then(run);
  }
  window.addEventListener('resize', fitMainNames);

  // A relative url is a page of the launcher itself (the radio player).
  function resolve(url) {
    try { return new URL(url, location.href).href; } catch { return url; }
  }

  function open(url) {
    b.navigate(resolve(url));
  }

  function showTargets(query) {
    $('targets-query').textContent = query;
    targetsEl.innerHTML = '';
    for (const s of services) {
      if (!s.search_url) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'target pioneertv-card';
      btn.style.setProperty('--target-color', s.color || '#444');
      btn.textContent = s.name;
      btn.addEventListener('click', () => open(s.search_url.replace('{query}', encodeURIComponent(query))));
      targetsEl.appendChild(btn);
    }
    targetsSection.hidden = false;
    M.nav.focus(targetsEl.firstElementChild);
  }

  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) showTargets(q);
  });
  searchInput.addEventListener('input', () => { if (!searchInput.value.trim()) targetsSection.hidden = true; });



  // Pixel icons for the static bits of the page.
  const icons = M.icons;
  $('search-icon').appendChild(icons.svg('search'));
  document.querySelectorAll('[data-icon]').forEach((el) => el.appendChild(icons.svg(el.dataset.icon)));
  $('pill-wifi').appendChild(icons.svg('wifi'));
  $('pill-tailscale').appendChild(icons.svg('link'));
  $('pill-gamepad').appendChild(icons.svg('gamepad'));
  $('pill-daemon').appendChild(icons.svg('dot'));

  b.on('state', (s) => {
    $('pill-daemon').classList.toggle('on', s.daemonConnected);
    if (s.config && Array.isArray(s.config.services) && s.config.services.length) {
      const key = JSON.stringify(s.config.services);
      if (key !== servicesKey) {
        // Re-render only when the list actually changed, and keep the focus
        // where it was; state arrives with every status broadcast.
        servicesKey = key;
        services = s.config.services;
        const focused = document.activeElement;
        const id = focused && focused.classList.contains('tile') ? focused.dataset.service : null;
        render();
        const again = id && document.querySelector(`.tile[data-service="${CSS.escape(id)}"]`);
        if (again) M.nav.focus(again, { scroll: false });
      }
    }
  });
  b.on('gamepad', (e) => $('pill-gamepad').classList.toggle('on', !!e.connected));

  function applyStatus(s) {
    if (!s) return;
    const w = s.wifi || {}, t = s.tailscale || {};
    const eth = (s.interfaces || []).find((i) => i.name.startsWith('e') && i.addresses.length);
    const wifi = $('pill-wifi');
    wifi.replaceChildren(icons.svg(w.state === 'connected' ? 'wifi' : eth ? 'ethernet' : 'wifi'));
    wifi.classList.toggle('on', w.state === 'connected' || !!eth);
    wifi.title = w.state === 'connected' ? `${w.ssid} ${w.signal != null ? w.signal + '%' : ''}` : eth ? `Ethernet ${eth.addresses[0]}` : 'Inget nätverk';
    const ts = $('pill-tailscale');
    ts.classList.toggle('on', t.state === 'running');
    const srv = t.server_name || 'Server';
    ts.classList.toggle('warn', t.state === 'running' && t.server_online === false);
    ts.title = t.state === 'running' ? `Tailscale ${(t.ips || [])[0] || ''}${t.server_online != null ? (t.server_online ? `, ${srv} online` : `, ${srv} offline`) : ''}` : `Tailscale ${t.state || 'okänd'}`;
    $('pill-gamepad').classList.toggle('on', (s.gamepads || []).length > 0);
  }
  b.on('state', (s) => applyStatus(s.status));

  // The page does not scroll, and the keyboard sheet covers its lower third.
  // Lift the page just enough to keep the field being typed into visible.
  const page = document.querySelector('.page');
  b.on('keyboard:open', () => requestAnimationFrame(() => {
    const kb = document.querySelector('.pioneertv-keyboard');
    const field = document.activeElement && M.nav.isTextField(document.activeElement) ? document.activeElement : searchInput;
    if (!kb || !field) return;
    const box = (field.closest('.search') || field).getBoundingClientRect();
    const visibleBottom = window.innerHeight - kb.getBoundingClientRect().height;
    const shift = Math.max(0, box.bottom + 24 - visibleBottom);
    page.style.transform = shift ? `translateY(${-shift}px)` : '';
  }));
  b.on('keyboard:close', () => { page.style.transform = ''; });

  // ?demo=keyboard|menu|logs opens an overlay after load, for design screenshots.
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) setTimeout(() => {
    if (demo === 'keyboard') { M.nav.focus(searchInput); M.keyboard.open(searchInput); }
    else if (demo === 'menu') M.hud.menu.open();
    else if (demo === 'logs') M.logs.open(0);
    else if (demo === 'toast') M.hud.toast('Handkontroll ansluten', 'gamepad', 60000);
  }, 900);

  render();
  // Land on the first tile, not the search field, so Enter does not pop the keyboard.
  requestAnimationFrame(() => M.nav.focus(tilesEl.firstElementChild, { scroll: false }));
})(window.PioneerTV);
