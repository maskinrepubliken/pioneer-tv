// Pioneer TV browse page, the column at the left: Sök at the top, then the
// library's ways in (Spel's consoles and collections, Musik's Spellistor,
// Album and Artister, Film's libraries and a library's folders), in groups.
// At rest it is narrow and each way in is a ring with its initial; with the
// focus (or the pointer) in it, it widens over the view and says each one's
// name and its group's. Styled in browse.css (.rail).
//
// A library gives its groups for where the page is, library.rail(parts):
//
//   [{ label, items: [{ label, href, key, active }] }]
//
// The one whose href the page is at is marked (or the one marked active).
// Only the rings take the focus, so the arrows go between the column and
// the view by where the rings are, not the names over the view.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const el = M.views.el;
  const list = document.getElementById('rail-list');

  // The first letter or digit of a name: "Game Boy" G, "8BitDo" 8.
  const initial = (s) => ((String(s).match(/[\p{L}\p{N}]/u) || ['?'])[0]).toUpperCase();

  function item(it, here) {
    const box = el('div', 'rail-item');
    const mark = el('button', 'pioneertv-round rail-mark', initial(it.label));
    mark.type = 'button';
    mark.dataset.key = it.key || `rail:${it.href}`;
    mark.setAttribute('aria-label', it.label);
    const at = it.active != null ? it.active : here === it.href || here.startsWith(`${it.href}/`);
    if (at) box.classList.add('aktiv');
    box.append(mark, el('span', 'rail-label', it.label));
    box.addEventListener('click', () => { if (!at) location.hash = it.href; });
    return box;
  }

  let drawn = '';
  function render(groups, here) {
    const key = JSON.stringify([groups, here]);
    if (key === drawn) return;
    drawn = key;
    // The focus stays on the ring it was on, if that is still there.
    const focused = list.contains(document.activeElement) && document.activeElement.dataset.key;
    list.innerHTML = '';
    for (const g of groups || []) {
      if (!g.items || !g.items.length) continue;
      const box = el('section', 'rail-group');
      box.appendChild(el('h2', 'rail-group-label', g.label || ''));
      for (const it of g.items) box.appendChild(item(it, here));
      list.appendChild(box);
    }
    const again = focused && list.querySelector(`[data-key="${CSS.escape(focused)}"]`);
    if (again) M.nav.focus(again);
  }

  // The pointer opens it too, once it moves over it: a mouse that moves
  // (Chromium also says mouseover to one at rest when what is under it is
  // drawn again), or the pad's arrow (cursor.js, its events are its own).
  const rail = document.getElementById('rail');
  rail.addEventListener('mousemove', (e) => { if (e.movementX || e.movementY) rail.classList.add('open'); });
  rail.addEventListener('mouseover', (e) => { if (!e.isTrusted) rail.classList.add('open'); });
  rail.addEventListener('mouseout', (e) => { if (!rail.contains(e.relatedTarget)) rail.classList.remove('open'); });

  // Into the column from the view: to the way in the page is at, wherever
  // the arrow happened to point (up from there is Sök).
  let inside = false;
  M.bridge.on('nav:focus', (target) => {
    const now = !!target && rail.contains(target);
    const entering = now && !inside;
    inside = now;
    if (!entering || !list.contains(target)) return;
    const here = list.querySelector('.rail-item.aktiv .rail-mark');
    if (here && here !== target) M.nav.focus(here);
  });

  M.rail = { render };
})(window.PioneerTV);
