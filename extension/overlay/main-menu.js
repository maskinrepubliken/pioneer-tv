// Pioneer TV's menus in the overlay (overlay/hud.js draws them, the paper
// card at the right): the quick menu Home opens over any window, and the
// panel the home page (launcher/index.html) asks for: Sök (the on-screen
// keyboard here, then where to search). The home
// page itself, the tiles, is a page of its own; so is the settings page,
// which no menu here opens (the home page does).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;
  const S = M.services;

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
  // without the menu. The box's status at the foot. leave: from a game's or
  // a film's panel (Mer…), what goes to another page first ends what plays
  // there (leave(go) does both).
  function spec({ leave, inPanel = !!leave } = {}) {
    const tv = b.state.daemonConnected;
    const away = (go) => (leave ? () => leave(go) : go);
    return {
      title: 'Meny',
      status: true,
      items: [
        // From a panel (Mer…) the panel has its own way out: Sluta titta, Sluta spela.
        ...(inPanel ? [] : [{ label: 'Tillbaka', icon: 'back', detail: 'håll B', run: () => b.back() }]),
        { label: 'Hem', icon: 'home', run: away(() => b.home()) },
        M.hud.volumeItem({ disabled: !tv }),
        { label: 'Tangentbord', icon: 'keyboard', detail: 'Y', run: () => b.keyboard() },
        { label: 'Ladda om sidan', icon: 'reload', run: away(() => b.reload()) },
        { label: 'Stäng av TV:n', icon: 'power', run: () => b.cec('tv_off'), disabled: !tv },
      ],
    };
  }

  // A panel alone, as the home page asks for it (its Sök).
  function panel(name) {
    if (name === 'search') search();
  }

  M.mainMenu = { spec, search, panel };
})(window.PioneerTV);
