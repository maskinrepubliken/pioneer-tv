// Pioneer TV launcher page logic.
(function (M) {
  const b = M.bridge;
  M.launcherUrl = location.href;

  const $ = (id) => document.getElementById(id);
  const tilesEl = $('tiles');
  const searchInput = $('search');
  const targetsSection = $('search-targets');
  const targetsEl = $('targets');
  const clock = $('clock');

  let services = M.defaultServices;
  let servicesKey = JSON.stringify(services);

  function render() {
    tilesEl.innerHTML = '';
    for (const s of services) {
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
      const tag = document.createElement('div'); tag.className = 'tagline'; tag.textContent = s.tagline || ''; text.appendChild(tag);
      a.appendChild(text);
      const index = document.createElement('span'); index.className = 'index'; index.textContent = `0${tilesEl.children.length + 1}`; a.appendChild(index);
      a.addEventListener('click', (e) => { e.preventDefault(); open(s.url); });
      tilesEl.appendChild(a);
    }
  }

  function open(url) {
    document.body.style.transition = 'opacity 180ms';
    document.body.style.opacity = '0';
    setTimeout(() => b.navigate(url), 160);
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


  function tick() {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('dateline').textContent = date.charAt(0).toUpperCase() + date.slice(1);
  }
  tick();
  setInterval(tick, 15000);

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
        const idx = focused && focused.classList.contains('tile') ? [...tilesEl.children].indexOf(focused) : -1;
        render();
        if (idx >= 0) M.nav.focus(tilesEl.children[Math.min(idx, tilesEl.children.length - 1)], { scroll: false });
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

  // Flames along the bottom edge: a few blurred tongues, each with its own rhythm.
  (function flames() {
    const host = $('flames');
    if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const f = document.createElement('span');
      f.className = 'flame';
      const big = i % 3 === 1;
      f.style.setProperty('--x', `${(i / n) * 100 - 6 + Math.random() * 6}vw`);
      f.style.setProperty('--w', `${(big ? 22 : 14) + Math.random() * 8}vw`);
      f.style.setProperty('--h', `${(big ? 30 : 20) + Math.random() * 10}vh`);
      f.style.setProperty('--blur', `${big ? 34 : 24}px`);
      f.style.setProperty('--dur', `${1.6 + Math.random() * 1.4}s`);
      f.style.setProperty('--fdur', `${0.9 + Math.random() * 0.8}s`);
      f.style.setProperty('--delay', `${-Math.random() * 3}s`);
      f.style.setProperty('--peak', String((big ? 0.55 : 0.4) + Math.random() * 0.2));
      host.appendChild(f);
    }
  })();

  // Embers drifting up from the hearth: a handful of small warm dots.
  (function embers() {
    const host = $('embers');
    if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#e0a840', '#d98a3a', '#c9662e', '#e6c46a'];
    for (let i = 0; i < 22; i++) {
      const e = document.createElement('span');
      e.className = 'ember';
      const size = 3 + Math.round(Math.random() * 4);
      e.style.setProperty('--x', `${2 + Math.random() * 96}vw`);
      e.style.setProperty('--dx', `${(Math.random() - 0.5) * 12}vw`);
      e.style.setProperty('--dur', `${11 + Math.random() * 9}s`);
      e.style.setProperty('--delay', `${-Math.random() * 20}s`);
      e.style.setProperty('--size', `${size}px`);
      e.style.setProperty('--peak', String(0.55 + Math.random() * 0.4));
      e.style.background = colors[i % colors.length];
      host.appendChild(e);
    }
  })();

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
