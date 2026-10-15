// Pioneer TV launcher page logic.
(function (M) {
  const b = M.bridge;
  M.launcherUrl = location.href;

  const $ = (id) => document.getElementById(id);
  const tilesEl = $('tiles');
  const secondEl = $('second');
  const searchInput = $('search');

  let services = M.defaultServices;
  let servicesKey = JSON.stringify(services);

  // Two rows of big tiles. The first holds the services without a row; the
  // second those with row "second" (Bilder), and then one Live tile when
  // there are live channels (row "live", TV and radio): it opens their list
  // in the quick menu's panel instead of giving each a tile of its own.
  const isLive = (s) => s.row === 'live';
  const isSecond = (s) => s.row === 'second';
  const LIVE_TILE = { id: 'live', name: 'Live', color: '#a8352a' };

  function tile(s, n, onPress) {
    const a = document.createElement('a');
    a.className = 'tile pioneertv-card';
    a.href = s.url ? resolve(s.url) : '#';
    a.style.setProperty('--tile-color', s.color || '#444');
    a.dataset.service = s.id;
    const band = document.createElement('span'); band.className = 'band'; a.appendChild(band);
    const art = document.createElement('div'); art.className = 'art';
    if (s.logo) { const img = document.createElement('img'); img.className = 'logo'; img.src = s.logo; img.alt = ''; art.appendChild(img); }
    else art.innerHTML = M.art.html(s.id, s.color);
    a.appendChild(art);
    const text = document.createElement('div'); text.className = 'text';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = s.name; text.appendChild(name);
    a.appendChild(text);
    const index = document.createElement('span'); index.className = 'index'; index.textContent = String(n).padStart(2, '0'); a.appendChild(index);
    a.addEventListener('click', (e) => { e.preventDefault(); onPress(a); });
    return a;
  }

  function render() {
    tilesEl.innerHTML = '';
    secondEl.innerHTML = '';
    const first = services.filter((s) => !isLive(s) && !isSecond(s));
    const second = services.filter(isSecond);
    const live = services.filter(isLive);
    let n = 0;
    for (const s of first) tilesEl.appendChild(tile(s, ++n, (a) => open(s.url, a)));
    for (const s of second) secondEl.appendChild(tile(s, ++n, (a) => open(s.url, a)));
    if (live.length) secondEl.appendChild(tile(LIVE_TILE, ++n, () => showLive(live)));
    tilesEl.style.setProperty('--tiles', String(Math.max(1, Math.min(first.length, 5))));
    secondEl.style.setProperty('--tiles', String(Math.max(1, secondEl.children.length)));
    secondEl.hidden = !secondEl.children.length;
    fitMainNames();
  }

  // The live channels, TV first then radio, in the quick menu's panel.
  function showLive(live) {
    const order = (s) => (s.kind === 'radio' ? 1 : 0);
    const items = [...live].sort((a, b2) => order(a) - order(b2)).map((s, i) => ({
      label: s.name, icon: s.kind === 'radio' ? 'radio' : 'tv', primary: i === 0, opens: true,
      run: () => b.navigate(resolve(s.url)),
    }));
    M.hud.menu.open({ title: 'Live', items });
  }

  // The opening row's holes, in the rutnät's proportions (hole radius just
  // under a quarter of the pitch).
  const PITCH = 75, HOLE = 18.5;

  // Every tile's title shares one size: the largest at which the widest
  // (CINEASTERNA) fits its tile with the tile's own padding as air, so every
  // title can sit centred.
  function fitMainNames() {
    const run = () => {
      const names = [...tilesEl.querySelectorAll('.name'), ...secondEl.querySelectorAll('.name')];
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

  // Opening a service can take a while on a weak network, and until the new
  // page commits the launcher stays on screen. So the pressed tile answers at
  // once: a row of holes is punched into it, one at a time, like a card going
  // through the reader, and starts over until the page changes. Each hole goes
  // from empty to ochre in one step (the system has no fades). Further presses
  // wait; if nothing has happened after OPEN_GIVE_UP the tile is reset.
  const OPEN_HOLES = 7, OPEN_STEP_MS = 160, OPEN_GIVE_UP = 25000;
  let opening = null;

  function openingRow() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'opening');
    svg.setAttribute('viewBox', `0 0 ${OPEN_HOLES * PITCH} ${PITCH}`);
    svg.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < OPEN_HOLES; i++) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(i * PITCH + PITCH / 2));
      dot.setAttribute('cy', String(PITCH / 2));
      dot.setAttribute('r', String(HOLE));
      svg.appendChild(dot);
    }
    return svg;
  }

  function stopOpening() {
    if (!opening) return;
    clearInterval(opening.timer);
    clearTimeout(opening.giveUp);
    opening.tile.classList.remove('is-opening');
    opening.tile.removeAttribute('aria-busy');
    opening.row.remove();
    opening = null;
  }

  function startOpening(tile) {
    const row = openingRow();
    const holes = [...row.querySelectorAll('circle')];
    // The row goes under the illustration.
    const slot = tile.querySelector('.text') || tile;
    slot.insertBefore(row, slot.firstChild);
    tile.classList.add('is-opening');
    tile.setAttribute('aria-busy', 'true');
    let step = 0;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = () => {
      const lit = still ? OPEN_HOLES : step % (OPEN_HOLES + 2);   // two beats with all punched, then again
      holes.forEach((h, i) => h.classList.toggle('punched', i < lit));
      step += 1;
    };
    draw();
    opening = {
      tile, row,
      timer: still ? 0 : setInterval(draw, OPEN_STEP_MS),
      giveUp: setTimeout(stopOpening, OPEN_GIVE_UP),
    };
  }

  function open(url, tile) {
    if (opening) return;                         // already on its way
    if (tile) startOpening(tile);
    b.navigate(resolve(url));
  }
  // Coming back to a launcher kept in the back/forward cache: no tile is opening.
  window.addEventListener('pageshow', (e) => { if (e.persisted) stopOpening(); });

  // Where to search: the services with a search_url, in the quick menu's
  // panel, and a way back to the keyboard to change the words.
  function showTargets(query) {
    const note = document.createElement('div');
    note.className = 'pioneertv-menu-note';
    note.append('efter ');
    const em = document.createElement('em');
    em.textContent = `”${query}”`;
    note.append(em, ' på');
    const items = services.filter((s) => s.search_url).map((s, i) => ({
      label: s.name, icon: 'search', primary: i === 0, opens: true,
      run: () => b.navigate(resolve(s.search_url.replace('{query}', encodeURIComponent(query)))),
    }));
    items.push({ label: 'Ändra sökningen', icon: 'keyboard', run: () => M.keyboard.open(searchInput) });
    M.hud.menu.open({ title: 'Sök', note, items });
  }

  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) showTargets(q);
  });



  // Pixel icons for the static bits of the page.
  const icons = M.icons;
  document.querySelectorAll('[data-icon]').forEach((el) => el.appendChild(icons.svg(el.dataset.icon)));
  $('pill-wifi').appendChild(icons.svg('wifi'));
  $('pill-tailscale').appendChild(icons.svg('link'));
  $('pill-gamepad').appendChild(icons.svg('gamepad'));
  $('pill-daemon').appendChild(icons.svg('daemon'));

  // Turning the TV off from the start page: the one action that is not a
  // service. Up from the tiles reaches it.
  $('tv-off').appendChild(icons.svg('power'));
  $('tv-off').addEventListener('click', () => b.cec('tv_off'));
  // Search: the keyboard opens on the hidden field and shows what is typed;
  // OK lists the services to search on.
  $('search-btn').appendChild(icons.svg('search'));
  $('search-btn').addEventListener('click', () => {
    searchInput.value = '';
    M.keyboard.open(searchInput);
  });
  $('menu-btn').appendChild(icons.svg('menu'));
  $('menu-btn').addEventListener('click', () => M.hud.menu.open());

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


  // ?demo=keyboard|menu|logs opens an overlay after load, for design screenshots.
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo) setTimeout(() => {
    if (demo === 'keyboard') $('search-btn').click();
    else if (demo === 'menu') M.hud.menu.open();
    else if (demo === 'logs') M.logs.open(0);
    else if (demo === 'toast') M.hud.toast('Handkontroll ansluten', 'gamepad', 60000);
  }, 900);

  render();
  // Land on the first tile.
  requestAnimationFrame(() => M.nav.focus(tilesEl.firstElementChild, { scroll: false }));
})(window.PioneerTV);
