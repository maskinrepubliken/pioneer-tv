// Pioneer TV main menu: what Home opens over any window (overlay/hud.js
// draws it). The home page's tiles (launcher/shared/tiles.js), on a sheet
// over nearly the whole screen, with what concerns the page below at the
// top: Tillbaka, Ladda om, Tangentbord, Sök, Inställningar, the TV's off
// button. Live, Sök and Inställningar are panels, the card at the right;
// the home page opens them alone (panel()).
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

  // The settings page's tabs, and the box's status at the foot.
  const settings = () => ({
    title: 'Inställningar',
    status: true,
    wide: true,
    items: S.SETTINGS.map(([id, label, icon]) => ({ label, icon, grid: 'pair', opens: true, run: () => b.settings(id) })),
  });

  function spec() {
    const { first, second, channels } = S.rows();
    const service = (s) => ({ label: s.name, art: S.art(s), color: s.color, opens: true, run: () => b.navigate(S.resolve(s.url)) });
    const row2 = second.map(service);
    if (channels.length) row2.push({ label: S.LIVE.name, art: S.art(S.LIVE), color: S.LIVE.color, sub: live });
    const rows = [first.map(service), row2];
    const head = [
      { label: 'Tillbaka', icon: 'back', run: () => b.back() },
      { label: 'Ladda om', icon: 'reload', run: () => b.reload() },
      { label: 'Tangentbord', icon: 'keyboard', run: () => b.keyboard() },
      { label: 'Sök', icon: 'search', round: true, keep: true, run: search },
      { label: 'Inställningar', icon: 'gear', round: true, sub: settings },
      { label: 'Stäng av TV:n', icon: 'power', round: true, run: () => b.cec('tv_off'), disabled: !b.state.daemonConnected },
    ];
    return {
      title: 'Meny',
      items: [...rows.flat(), ...head],
      build: () => M.tiles.sheet({
        head, rows,
        legend: [[['arrows'], 'navigera'], [['A'], 'välj'], [['B'], 'stäng'], [['Y'], 'tangentbord'], [['HEM'], 'stäng · håll: hem']],
      }),
      mounted(sheet) {
        M.tiles.fitNames(sheet);
        if (document.fonts) document.fonts.ready.then(() => sheet.isConnected && M.tiles.fitNames(sheet));
      },
    };
  }

  // A panel alone, as the home page asks for it (its Live tile, its Sök and
  // Inställningar buttons).
  function panel(name) {
    if (name === 'live') M.hud.menu.open(live());
    else if (name === 'settings') M.hud.menu.open(settings());
    else if (name === 'search') search();
  }

  M.mainMenu = { spec, search, panel };
})(window.PioneerTV);
