// Pioneer TV's menus in the overlay (overlay/hud.js draws them, the paper
// card at the right): the quick menu Home opens over any window, and the
// panels the home page (launcher/index.html) asks for: Live (the channels)
// and Sök (the on-screen keyboard here, then where to search). The home
// page itself, the tiles, is a page of its own; so are Inställningar and
// its Loggar (the settings page).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;
  const S = M.services;

  // The live channels, TV first then radio.
  function live() {
    return {
      title: 'Live',
      items: S.rows().channels.map((s, i) => ({
        label: s.name, icon: s.kind === 'radio' ? 'radio' : 'tv', primary: i === 0, opens: true,
        run: () => b.navigate(S.resolve(s.url)),
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
    if (!menu.isOpen()) menu.open(targets(q));
    else {
      if (menu.stack[menu.stack.length - 1].search) menu.stack.pop();
      menu.push(targets(q));
    }
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
    const items = S.list().filter((s) => s.search_url).map((s, i) => ({
      label: s.name, icon: 'search', primary: i === 0, opens: true,
      run: () => b.navigate(S.resolve(s.search_url.replace('{query}', encodeURIComponent(query)))),
    }));
    items.push({ label: 'Ändra sökningen', icon: 'keyboard', keep: true, run: () => { field.value = query; M.keyboard.open(field); } });
    return { title: 'Sök', note, items, search: true };
  }

  // The quick menu: what Home opens over any window, the paper card at the
  // right. Most used first; the detail is the button that does the same
  // without the menu. The box's status at the foot.
  function spec() {
    const tv = b.state.daemonConnected;
    return {
      title: 'Meny',
      status: true,
      items: [
        { label: 'Tillbaka', icon: 'back', detail: 'håll B', run: () => b.back() },
        { label: 'Hem', icon: 'home', detail: 'håll Hem', primary: true, run: () => b.home() },
        // As in the pause panels: left and right step the TV's volume, A mutes.
        { label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, keep: true, run: () => b.cec('mute'), disabled: !tv },
        { label: 'Tangentbord', icon: 'keyboard', detail: 'Y', run: () => b.keyboard() },
        { label: 'Ladda om sidan', icon: 'reload', run: () => b.reload() },
        { label: 'Stäng av TV:n', icon: 'power', run: () => b.cec('tv_off'), disabled: !tv },
        { label: 'Inställningar', icon: 'gear', opens: true, run: () => b.settings() },
      ],
    };
  }

  // A panel alone, as the home page asks for it (its Live tile, its Sök).
  function panel(name) {
    if (name === 'live') M.hud.menu.open(live());
    else if (name === 'search') search();
  }

  M.mainMenu = { spec, search, panel };
})(window.PioneerTV);
