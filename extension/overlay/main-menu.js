// Pioneer TV main menu: what Home opens over any window (overlay/hud.js
// draws it). The services as cards with their pictures, Live and Sök; then
// what concerns the page below, the TV and Inställningar. The home page
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
    if (q) M.hud.menu.open(targets(q));
  });
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
    items.push({ label: 'Ändra sökningen', icon: 'keyboard', run: () => { field.value = query; M.keyboard.open(field); } });
    return { title: 'Sök', note, items };
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

  function spec() {
    const all = services();
    const isLive = (s) => s.row === 'live';
    const tv = b.state.daemonConnected;
    const items = all.filter((s) => !isLive(s)).map((s) => ({
      label: s.name, art: art(s), grid: 'cards', opens: true, run: () => b.navigate(resolve(s.url)),
    }));
    const channels = all.filter(isLive);
    if (channels.length) items.push({ label: 'Live', art: M.art.html('live', '#a8352a'), grid: 'cards', sub: () => live(channels) });
    items.push({ label: 'Sök', icon: 'search', grid: 'cards', run: search });
    items.push(
      // The page below; the detail is the button that does the same without the menu.
      { label: 'Tillbaka', icon: 'back', detail: 'håll B', grid: 'pair', run: () => b.back() },
      { label: 'Ladda om', icon: 'reload', grid: 'pair', run: () => b.reload() },
      { label: 'Tangentbord', icon: 'keyboard', detail: 'Y', grid: 'pair', run: () => b.keyboard() },
      { label: 'Stäng av TV:n', icon: 'power', grid: 'pair', run: () => b.cec('tv_off'), disabled: !tv },
      // As in the pause panels: left and right step the TV's volume, A mutes.
      { label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, keep: true, run: () => b.cec('mute'), disabled: !tv },
      { label: 'Inställningar', icon: 'gear', sub: settings },
    );
    return { title: 'Meny', wide: true, items };
  }

  M.mainMenu = { spec, search };
})(window.PioneerTV);
