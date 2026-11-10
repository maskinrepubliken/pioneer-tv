// Pioneer TV picture viewer: Bilder's pictures one at a time over the whole
// screen, on ink, as large as they go (Immich's preview, about the screen's
// size). Left and right go to the one before and after (when and where it
// was taken says itself for a moment), A opens or closes a side panel of
// what is known of it (when, where, who, the camera, the file), X starts
// or stops the slideshow (a new picture every few seconds, the one fading
// into the next), B closes the panel, else goes back to the grid. A clip
// shows its picture, and a notice says X plays it: on the box in mpv
// (players/video.js: X plays and pauses it there, A or Home opens its
// panel, B stops it), and the viewer is there again after, on the next one
// when it played to its end. While the slideshow runs, the box is told something
// plays, so the screensaver keeps away. Styled by photo.css.
//
//   M.players.photo.open(assets, index, { slideshow })   assets as sources/immich.js gives them
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const I = M.immich;
  const V = M.views;
  const el = V.el;
  const EVERY_MS = 6000;           // a picture in the slideshow
  const CAPTION_MS = 3500;         // the caption stays this long after a move

  const MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
  // Immich's time in the place's own time, an ISO date read as UTC.
  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${hm}`;
  }

  let root = null, layers = [], front = 0, caption = null, part = {};
  let list = [], at = 0, show = false, timer = 0, captionTimer = 0, clipTimer = 0, said = 0;
  const details = new Map();       // asset id -> its details, once asked

  function build() {
    if (root) return;
    root = el('section', 'pv');
    root.hidden = true;
    layers = [el('div', 'pv-layer'), el('div', 'pv-layer')];
    caption = el('div', 'pv-caption');
    for (const name of ['when', 'where', 'who', 'text']) { part[name] = el('p', `pv-${name}`); caption.appendChild(part[name]); }
    part.clip = el('div', 'pv-clip');
    part.clip.append(M.icons.svg('play'), el('span', '', 'Videoklipp · X spelar'));
    // The side panel (A): what is known of the one shown.
    part.info = el('aside', 'pv-info');
    part.info.hidden = true;
    part.infoTitle = el('h2', 'pv-info-title');
    part.infoList = el('dl', 'pv-info-list');
    part.infoKeys = el('footer', 'legend pv-info-keys');
    part.info.append(part.infoTitle, part.infoList, part.infoKeys);
    part.count = el('p', 'pv-count');
    part.state = el('p', 'pv-state');
    root.append(...layers, part.clip, caption, part.count, part.state, part.info);
    document.body.appendChild(root);
  }

  // The picture at i in the layer behind, then that layer in front (fading
  // in over the other in the slideshow; at once when stepping by hand).
  function draw(fade) {
    const a = list[at];
    if (!a) return;
    const back = layers[1 - front];
    back.innerHTML = '';
    const img = el('img');
    img.alt = '';
    img.decoding = 'async';
    const shown = () => {
      back.classList.toggle('pv-fade', !!fade);
      back.classList.add('pv-on');
      layers[front].classList.toggle('pv-fade', !!fade);
      layers[front].classList.remove('pv-on');
      front = 1 - front;
    };
    img.onload = shown;
    img.onerror = shown;
    img.src = I.picture(a.id, 'preview');
    back.appendChild(img);
    // A clip: a notice for a moment of what A does.
    clearTimeout(clipTimer);
    part.clip.classList.toggle('pv-shown', !!a.video);
    if (a.video) clipTimer = setTimeout(() => part.clip.classList.remove('pv-shown'), CAPTION_MS);
    part.count.textContent = list.length > 1 ? `${at + 1} av ${list.length}` : '';
    describe(a);
    // The next one asked for already, so the slideshow does not wait on it.
    const next = list[(at + 1) % list.length];
    if (next && next !== a) { const pre = new Image(); pre.src = I.picture(next.id, 'preview'); }
  }

  // When, where, who: from the asset's details, asked once; the caption,
  // and the side panel.
  async function describe(a) {
    part.when.textContent = when(a.taken);
    part.where.textContent = part.who.textContent = part.text.textContent = '';
    infoOf(a, null);
    let d = details.get(a.id);
    if (!d) {
      try { d = await I.details(a.id); details.set(a.id, d); } catch { return; }
    }
    if (list[at] !== a) return;
    part.when.textContent = when(d.taken || a.taken);
    part.where.textContent = [d.city, d.country].filter(Boolean).join(', ');
    part.who.textContent = d.people.join(', ');
    part.text.textContent = d.text;
    infoOf(a, d);
  }
  // The side panel's rows: what there is, nothing for what is not known.
  function infoOf(a, d) {
    part.infoTitle.textContent = a.video ? 'Videoklippet' : 'Bilden';
    const rows = [
      ['Taget', when((d && d.taken) || a.taken)],
      ['Plats', d ? [d.city, d.country].filter(Boolean).join(', ') : ''],
      ['Personer', d ? d.people.join(', ') : ''],
      ['Längd', a.video && a.seconds ? `${Math.floor(a.seconds / 60)}:${String(Math.round(a.seconds % 60)).padStart(2, '0')}` : ''],
      ['Kamera', d ? d.camera : ''],
      ['Storlek', d && d.width && d.height ? `${d.width} × ${d.height}` : ''],
      ['Fil', d ? d.file : ''],
      ['Text', d ? d.text : ''],
      ['Favorit', a.favorite ? 'Ja' : ''],
    ].filter(([, v]) => v);
    part.infoList.innerHTML = '';
    for (const [k, v] of rows) part.infoList.append(el('dt', '', k), el('dd', '', v));
    if (!d) part.infoList.append(el('dd', 'pv-info-wait', 'Frågar Immich…'));
    V.legend(part.infoKeys, [['arrows', 'bläddra'], ['X', a.video ? 'spela klippet' : show ? 'stoppa bildspelet' : 'bildspel'], ['A', 'stäng']]);
  }
  function panel(open) {
    part.info.hidden = !open;
    root.classList.toggle('pv-with-info', open);
    if (open) { infoOf(list[at], details.get(list[at].id) || null); caption.classList.remove('pv-shown'); }
  }

  function showCaption(keep) {
    if (!part.info.hidden) return;                 // the panel says it all
    caption.classList.add('pv-shown');
    clearTimeout(captionTimer);
    if (!keep) captionTimer = setTimeout(() => caption.classList.remove('pv-shown'), CAPTION_MS);
  }

  function step(by, fade) {
    if (!list.length) return;
    at = (at + by + list.length) % list.length;
    draw(fade);
  }

  // The slideshow: pictures only (a clip is passed over), each EVERY_MS.
  function tick() {
    let tries = list.length;
    do { at = (at + 1) % list.length; } while (list[at].video && --tries > 0);
    draw(true);
    alive();
  }
  function slideshow(on) {
    show = on && list.some((a) => !a.video);
    clearInterval(timer);
    part.state.textContent = show ? 'Bildspel' : '';
    root.classList.toggle('pv-showing', show);
    if (show) { timer = setInterval(tick, EVERY_MS); alive(true); if (part.info.hidden) caption.classList.remove('pv-shown'); }
    else M.bridge.daemon({ type: 'activity', playing: false });
  }
  // Something plays, as a video says it (main.js), so the screensaver waits.
  function alive(now) {
    if (!now && Date.now() - said < 30000) return;
    said = Date.now();
    M.bridge.daemon({ type: 'activity', playing: true });
  }

  function playClip() {
    const a = list[at];
    if (!a || !a.video || !M.players.video) return;
    if (show) slideshow(false);
    // The video player has the pad while it plays and after; then the viewer again.
    M.players.video.after = (ended) => {
      if (!viewer.isOpen()) return;
      M.nav.captured = viewer;
      if (ended) step(1, false);
    };
    M.players.video.play({ id: a.id, name: 'Videoklipp', source: 'immich' }, 0);
  }

  const viewer = {
    isOpen() { return !!root && !root.hidden; },
    open(assets, index = 0, { slideshow: start = false } = {}) {
      if (!assets || !assets.length) return;
      build();
      list = assets;
      at = Math.max(0, Math.min(assets.length - 1, index));
      layers.forEach((l) => { l.innerHTML = ''; l.classList.remove('pv-on', 'pv-fade'); });
      root.hidden = false;
      panel(false);
      M.nav.captured = this;
      if (start && list[at].video) { const i = list.findIndex((a) => !a.video); if (i >= 0) at = i; }
      draw(false);
      if (start) slideshow(true); else { slideshow(false); showCaption(); }
    },
    close() {
      if (!this.isOpen()) return;
      slideshow(false);
      root.hidden = true;
      if (M.nav.captured === this) M.nav.captured = null;
      // Back on the grid, on the picture last seen (the grid's items are
      // the viewer's list, in its order).
      const card = list[at] && document.querySelector(`.view [data-key="${CSS.escape(`asset:${list[at].id}`)}"]`);
      if (card) M.nav.focus(card);
      else if (M.grid && M.grid.active) M.grid.active.focusIndex(at);
    },
    // B: the panel closed, else the viewer. A: the panel. X: a clip plays,
    // a picture starts or stops the slideshow.
    onKeyDown(e) {
      const open = !part.info.hidden;
      if (e.key === 'Escape') { if (open) panel(false); else this.close(); return; }
      if (e.key === ' ') {
        if (e.repeat) return;
        if (list[at] && list[at].video) { playClip(); return; }
        slideshow(!show);
        if (open) infoOf(list[at], details.get(list[at].id) || null); else if (!show) showCaption();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        step(e.key === 'ArrowLeft' ? -1 : 1, false);
        if (M.sound) M.sound.tick(e.key);
        if (show) { clearInterval(timer); timer = setInterval(tick, EVERY_MS); } else if (!open) showCaption();
        return;
      }
      if (e.key === 'Enter' && !e.repeat) panel(!open);
    },
  };
  // The keyboard takes the pad while open; it comes back here.
  M.bridge.on('keyboard:close', () => { if (viewer.isOpen() && !M.nav.captured) M.nav.captured = viewer; });

  M.players = M.players || {};
  M.players.photo = viewer;
})(window.PioneerTV);
