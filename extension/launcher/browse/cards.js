// Pioneer TV browse page: the things a view is made of, the same whichever
// library the page shows (libraries/: Spel from RomM, Musik and Film &
// serier from Jellyfin). A library hands them items in one shape:
//
//   { key, title, meta, detail, picture, large, shape, initial, progress,
//     href | run, song, played }
//
// key: stable, so the focus comes back to it; picture/large: a small and a
// sharp image; shape: how it is drawn (below); progress: 0 to 1, how far
// into it; href: where it goes (a view of this page, or another page), or
// run: what it does; song: marks the row of what plays (players/audio.js);
// played: dimmed; detail: a row's right-hand column.
//
// A card's shape: box (a game's box art at its own shape), poster (2:3),
// still (16:9), square (an album, a playlist), round (an artist), or group
// (type only: a console, a collection, a folder; style 'prose' for a
// name in Fraunces instead of Rubik capitals). A row: a picture (still or
// thumb), or its number, the title and a line under it, a detail at the
// right. Styled by cards.css (and planks.css on a shelf).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const V = M.views;
  const el = V.el;

  function link(a, item) {
    if (item.key) a.dataset.key = item.key;
    if (item.href) a.href = item.href;
    if (item.run) a.addEventListener('click', (e) => { e.preventDefault(); item.run(); });
  }

  // How far into it: a thin ochre line along the foot of the picture.
  function progress(p) {
    if (!p) return null;
    const bar = el('span', 'progress');
    const fill = el('span');
    fill.style.width = `${Math.min(100, p * 100)}%`;
    bar.appendChild(fill);
    return bar;
  }

  function picture(item) {
    const c = V.cover(item.picture, item.title, { large: item.large, initial: item.initial, mock: item.mock });
    const bar = progress(item.progress);
    if (bar) c.appendChild(bar);
    return c;
  }

  function card(item, shape = item.shape || 'square') {
    if (shape === 'group') return group(item);
    const a = el('a', `card card--${shape} pioneertv-card`);
    link(a, item);
    a.appendChild(el('span', 'band'));
    a.appendChild(picture({ ...item, initial: item.initial || shape === 'round' }));
    a.appendChild(el('span', 'title', item.title));
    if (item.meta) a.appendChild(el('span', 'meta', item.meta));
    return a;
  }

  function group(item) {
    const a = el('a', `card card--group${item.style === 'prose' ? ' card--prose' : ''} pioneertv-card`);
    link(a, item);
    a.appendChild(el('span', 'band'));
    a.appendChild(el('span', 'name', item.title));
    if (item.meta) a.appendChild(el('span', 'meta', item.meta));
    return a;
  }

  // A whole (a collection, a playlist, an artist) as a card on paper: its
  // picture, or its first few in a pile, the first in front (pictures:
  // [{ src, name, mock }], else its own picture; null: still to come, pile(card,
  // pictures) draws them), its name and a line under it. shape: box,
  // square or round, the pictures' shape.
  function stack(item, shape = item.shape || 'square') {
    const a = el('a', `card card--stack card--stack-${shape} pioneertv-card`);
    link(a, item);
    a.dataset.shape = shape;
    a.appendChild(el('span', 'stack'));
    pile(a, item.pictures !== undefined ? item.pictures : item.picture !== undefined ? [{ src: item.picture, name: item.title, mock: item.mock }] : []);
    a.appendChild(el('span', 'name', item.title));
    if (item.meta) a.appendChild(el('span', 'meta', item.meta));
    return a;
  }

  // A card of a whole's pictures, in its pile, up to six (a collection's
  // first games; null: none yet, an empty place).
  const PILE = 6;
  function pile(card, pictures) {
    const box = card.querySelector('.stack');
    box.innerHTML = '';
    if (pictures === null) return;
    const pics = pictures.slice(0, PILE);
    box.style.setProperty('--n', String(pics.length));
    pics.forEach((p, i) => {
      const c = V.cover(p.src, p.name, { initial: card.dataset.shape === 'round', mock: p.mock });
      c.style.setProperty('--i', String(i));
      box.appendChild(c);
    });
    if (!pics.length) box.appendChild(el('span', 'stack-empty', 'Tom'));
  }

  // A row of a list (songs, episodes): picture 'still', 'thumb', or the number.
  function row(item, n, look) {
    const a = el(item.href ? 'a' : 'button', `row row--${look}${item.played ? ' played' : ''}`);
    if (!item.href) a.type = 'button';
    link(a, item);
    if (item.song) a.dataset.song = item.song;
    if (look === 'number') a.appendChild(el('span', 'n', String(n)));
    else if (look === 'thumb') {
      const img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      if (item.picture) img.src = item.picture;
      a.appendChild(img);
    } else a.appendChild(picture({ ...item, title: '' }));
    const t = el('span', 't');
    t.appendChild(el('b', '', item.title));
    if (item.meta) t.appendChild(el('span', '', item.meta));
    a.appendChild(t);
    a.appendChild(el('span', 'd', item.detail || ''));
    return a;
  }

  // Tabs (a film library's libraries, a series' seasons): { label, href,
  // active, key }. Choosing one replaces the view in place, so B leaves
  // from any of them instead of stepping back through each.
  function tabs(items) {
    const nav = el('nav', 'tabs');
    for (const t of items) {
      const a = el('a', `tab${t.active ? ' aktiv' : ''}`, t.label);
      a.href = t.href;
      a.dataset.key = t.key || `tab:${t.href}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (t.active) return;
        history.replaceState(null, '', t.href);
        M.browse.route();
      });
      nav.appendChild(a);
    }
    return nav;
  }

  // A name alone, in a list of names in a few columns (an artist: there is
  // no picture to show): the name in Fraunces, long, and a line beside it.
  function name(item) {
    const a = el('a', 'card card--name pioneertv-card');
    link(a, item);
    a.appendChild(el('span', 'name', item.title));
    if (item.meta) a.appendChild(el('span', 'meta', item.meta));
    return a;
  }

  M.cards = { card, group, stack, pile, row, name, picture, tabs };
})(window.PioneerTV);
