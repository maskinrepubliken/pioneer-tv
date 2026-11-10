// Pioneer TV picture viewer: Bilder's pictures one at a time over the whole
// screen, on ink, as large as they go (Immich's preview, about the screen's
// size). Left and right go to the one before and after (when and where it
// was taken says itself for a moment), A opens a side panel: when, where,
// whose library, the camera, its text, and what may be done to it (Favorit, Ej foto: kept
// in Google Drive and taken out of Immich, Ta bort: to Immich's trash; a clip's Spela first; up
// and down choose, A does it, B closes it). X starts or stops the slideshow (a new picture
// every few seconds, slowly closer or further, drifting, the one fading
// into the next), B goes back to the grid. A clip plays right here, on
// its picture: X plays and pauses it, L2 and R2 glide a mark through it
// (what plays goes where they are let go), left and right go on as ever,
// the panel is the same; a small mark in a corner says playing or paused
// and the time. Played to its end, the viewer goes on to the next. A clip
// the browser cannot play goes to mpv instead (players/video.js), and the
// viewer is there again after. While the slideshow runs, the box is told
// something plays, so the screensaver keeps away (a playing clip says so
// itself, as every page's video: main.js). Styled by photo.css.
//
//   M.players.photo.open(assets, index, { slideshow })   assets as sources/immich.js gives them
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const I = M.immich;
  const V = M.views;
  const el = V.el;
  const EVERY_MS = 6000;           // a picture in the slideshow
  const FADE_MS = 900;             // photo.css's fade
  const CAPTION_MS = 3500;         // the caption stays this long after a move
  const SURE_MS = 3000;            // Ta bort waits this long for its second A

  const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  // Immich's time in the place's own time, an ISO date read as UTC.
  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${hm}`;
  }
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  let root = null, layers = [], front = 0, caption = null, part = {};
  let list = [], at = 0, show = false, timer = 0, captionTimer = 0, said = 0;
  let choice = 0, sure = 0, changed = false;
  // Ej foto on its way to the Drive (the daemon moves it in the background,
  // one at a time): asset id -> { holes, stop }, its row of holes.
  const moving = new Map();
  const details = new Map();       // asset id -> its details, once asked

  function build() {
    if (root) return;
    root = el('section', 'pv');
    root.hidden = true;
    layers = [el('div', 'pv-layer'), el('div', 'pv-layer')];
    caption = el('div', 'pv-caption');
    for (const name of ['when', 'where', 'text']) { part[name] = el('p', `pv-${name}`); caption.appendChild(part[name]); }
    // A clip: a small mark in the top corner (clear of the caption at the
    // foot), playing or paused, the time.
    part.clip = el('div', 'pv-clip');
    part.clipState = el('span', 'pv-clip-state');
    part.clipLen = el('span');
    part.clip.append(part.clipState, part.clipLen);
    // The side panel (A): what is known of it, and what may be done to it.
    part.info = el('aside', 'pv-info');
    part.info.hidden = true;
    part.infoTitle = el('h2', 'pv-info-title');
    part.infoList = el('dl', 'pv-info-list');
    part.actions = el('div', 'pv-actions');
    part.info.append(part.infoTitle, part.infoList, part.actions);
    part.count = el('p', 'pv-count');
    part.state = el('p', 'pv-state');
    root.append(...layers, part.clip, caption, part.count, part.state, part.info);
    document.body.appendChild(root);
  }

  // The picture at i in the layer behind, then that layer in front (fading
  // in over the other in the slideshow; at once when stepping by hand). In
  // the slideshow the picture moves while it is shown (Ken Burns): from a
  // little closer to a little further, or the other way, drifting a little.
  function draw(fade) {
    const a = list[at];
    if (!a) return;
    const back = layers[1 - front];
    back.innerHTML = '';
    const img = el('img');
    img.alt = '';
    img.decoding = 'async';
    const drifting = show && !a.video;
    const shown = () => {
      if (drifting) burns(img);
      // The one going: its clip still, so it is not heard behind.
      for (const v of layers[front].querySelectorAll('video')) v.pause();
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
    part.clip.hidden = !a.video;
    clipMark();
    part.count.textContent = list.length > 1 ? `${at + 1} av ${list.length}` : '';
    sure = 0;
    describe(a);
    // The next one asked for already, so the slideshow does not wait on it.
    const next = list[(at + 1) % list.length];
    if (next && next !== a) { const pre = new Image(); pre.src = I.picture(next.id, 'preview'); }
  }
  // ---------------------------------------------------------- a clip, here
  // The clip on screen: a video over its picture, made when X first asks.
  const clipOn = () => layers[front].querySelector('video');
  function clipMark() {
    const a = list[at];
    if (!a || !a.video) return;
    const v = clipOn();
    const len = (v && isFinite(v.duration) && v.duration) || a.seconds || 0;
    const now = target != null ? target : v ? v.currentTime : 0;
    part.clipState.innerHTML = M.icons.svg(v && !v.paused ? 'play' : 'pause').outerHTML;
    part.clipLen.textContent = v || target != null ? `${clock(now)} / ${clock(len)}` : clock(len);
  }
  function playHere() {
    const a = list[at];
    if (!a || !a.video) return;
    if (show) slideshow(false);
    let v = clipOn();
    if (!v) {
      v = el('video', 'pv-video');
      v.src = I.clip(a.id);
      v.playsInline = true;
      v.preload = 'auto';
      for (const ev of ['play', 'pause', 'timeupdate', 'loadedmetadata']) v.addEventListener(ev, () => { if (list[at] === a) { clipMark(); if (!part.info.hidden) redraw(); } });
      v.addEventListener('playing', () => v.classList.add('pv-on'));
      v.addEventListener('ended', () => { if (list[at] === a) step(1, false); });
      // One the browser cannot play: mpv plays it instead.
      v.addEventListener('error', () => { if (list[at] === a) { v.remove(); playClip(); } });
      layers[front].appendChild(v);
    }
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }

  // L2 and R2 on a clip (the daemon's seek, the page's while no menu of the
  // overlay is open): a mark glides through it, the harder the faster, and
  // it goes where they are let go; a short light touch is ten seconds.
  let scrub = null, target = null;
  M.bridge.on('seek', (e) => {
    const v = viewer.isOpen() && clipOn();
    if (!v || !isFinite(v.duration)) return;
    const amount = Math.max(0, Math.min(1, Number(e.amount) || 0));
    if (amount > 0) {
      if (!scrub) scrub = { from: v.currentTime, at: performance.now() };
      scrub.dir = e.dir < 0 ? -1 : 1;
      scrub.amount = amount;
      if (target == null) target = v.currentTime;
      return;
    }
    if (!scrub) return;
    let to = target == null ? v.currentTime : target;
    if (Math.abs(to - scrub.from) < 1) to = scrub.from + scrub.dir * 10;
    scrub = null; target = null;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.3, to));
    clipMark();
  });
  setInterval(() => {
    const v = scrub && clipOn();
    if (!v || target == null) return;
    const t = performance.now(), dt = (t - scrub.at) / 1000;
    scrub.at = t;
    const whole = v.duration || 60, slow = Math.max(1, whole / 120), fast = Math.max(10, whole / 6);
    target = Math.max(0, Math.min(whole - 0.3, target + scrub.dir * (slow + (fast - slow) * scrub.amount * scrub.amount) * dt));
    clipMark();
  }, 50);

  function burns(img) {
    const r = () => Math.random() * 2 - 1;
    const near = 1.12, far = 1.0;
    const [s0, s1] = Math.random() < 0.5 ? [far, near] : [near, far];
    const x0 = r() * 3, y0 = r() * 2, x1 = r() * 3, y1 = r() * 2;
    img.style.transition = 'none';
    img.style.transform = `translate(${x0}%, ${y0}%) scale(${s0})`;
    void img.offsetWidth;            // the start drawn, then the way to the end
    img.style.transition = `transform ${EVERY_MS + FADE_MS * 2}ms linear`;
    img.style.transform = `translate(${x1}%, ${y1}%) scale(${s1})`;
  }

  // When, where, its text: from the asset's details, asked once; the
  // caption, and the side panel.
  async function describe(a) {
    part.when.textContent = when(a.taken);
    part.where.textContent = part.text.textContent = '';
    infoOf(a, null);
    let d = details.get(a.id);
    if (!d) {
      try { d = await I.details(a.id); details.set(a.id, d); } catch { return; }
    }
    if (list[at] !== a) return;
    part.when.textContent = when(d.taken || a.taken);
    part.where.textContent = [d.city, d.country].filter(Boolean).join(', ');
    part.text.textContent = d.text;
    infoOf(a, d);
  }

  // ---------------------------------------------------------- the side panel
  // Its date as the heading, then Plats, Bibliotek (whose: one's own or a
  // partner's), Kamera and Text, those there are;
  // under them what may be done to it, one marked (up and down).
  function actionsOf(a) {
    return [
      // A clip: Spela (or Pausa) first, X's as everywhere in the viewer.
      ...(a.video ? [{ key: 'play', icon: clipOn() && !clipOn().paused ? 'pause' : 'play', label: clipOn() && !clipOn().paused ? 'Pausa' : 'Spela', value: 'X' }] : []),
      // Only a shortcut at a row's right (X), never anything else.
      { key: 'favorite', icon: 'heart', label: a.favorite ? 'Ta bort som favorit' : 'Gör till favorit' },
      { key: 'not_photo', icon: 'folder', label: moving.has(a.id) ? 'Avbryt flytten' : 'Ej foto, flytta till filer' },
      { key: 'trash', icon: 'backspace', label: sure ? 'Tryck A igen för att ta bort' : 'Ta bort' },
    ];
  }
  function infoOf(a, d) {
    part.infoTitle.textContent = when((d && d.taken) || a.taken) || (a.video ? 'Videoklipp' : 'Bild');
    const rows = [
      ['Plats', d ? [d.city, d.country].filter(Boolean).join(', ') : ''],
      ['Bibliotek', d ? d.owner : ''],
      ['Kamera', d ? d.camera : ''],
      ['Text', d ? d.text : ''],
    ].filter(([, v]) => v);
    part.infoList.innerHTML = '';
    for (const [k, v] of rows) part.infoList.append(el('dt', '', k), el('dd', '', v));
    if (!d) part.infoList.append(el('dd', 'pv-info-wait', 'Frågar Immich…'));
    part.actions.innerHTML = '';
    actionsOf(a).forEach((act, i) => {
      const row = el('div', `pv-action${i === choice ? ' pv-marked' : ''}${act.key === 'trash' && sure ? ' pv-sure' : ''}`);
      row.append(M.icons.svg(act.icon), el('span', 'pv-action-label', act.label));
      // On its way: the row of holes punched one at a time, as a tile of
      // the home page going to its page.
      if (act.key === 'not_photo' && moving.has(a.id)) row.appendChild(moving.get(a.id).holes);
      if (act.value) row.appendChild(el('span', 'pv-action-value', act.value));
      part.actions.appendChild(row);
    });
  }
  const redraw = () => infoOf(list[at], details.get(list[at].id) || null);
  function panel(open) {
    part.info.hidden = !open;
    root.classList.toggle('pv-with-info', open);
    choice = 0; sure = 0;
    if (open) { redraw(); caption.classList.remove('pv-shown'); }
  }

  // A row of holes, punched one after the other and over again until it
  // stops (shared/tiles.js punch's look).
  function holes() {
    const ns = 'http://www.w3.org/2000/svg', N = 7, PITCH = 20;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'pv-holes');
    svg.setAttribute('viewBox', `0 0 ${N * PITCH} ${PITCH}`);
    const dots = [];
    for (let i = 0; i < N; i++) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', String(i * PITCH + PITCH / 2));
      c.setAttribute('cy', String(PITCH / 2));
      c.setAttribute('r', '6');
      svg.appendChild(c);
      dots.push(c);
    }
    let step = 0;
    const draw = () => { const lit = step++ % (N + 2); dots.forEach((d, i) => d.classList.toggle('punched', i < lit)); };
    draw();
    const timer = setInterval(draw, 160);
    return { svg, stop: () => clearInterval(timer) };
  }

  // What the panel's choice does, in Immich (the daemon's /api/bilder).
  async function act(key) {
    const a = list[at];
    if (!a) return;
    // Ej foto on its way: A again calls it off.
    if (key === 'not_photo' && moving.has(a.id)) {
      fetch('/api/bilder/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) });
      return;
    }
    if (key === 'play') { playHere(); return; }
    if (key === 'trash' && !sure) { sure = Date.now(); redraw(); setTimeout(() => { if (sure && Date.now() - sure >= SURE_MS) { sure = 0; redraw(); } }, SURE_MS); return; }
    sure = 0;
    const body = { id: a.id, ...(key === 'favorite' ? { on: !a.favorite } : {}) };
    let r;
    try {
      r = await (await fetch(`/api/bilder/${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    } catch { r = { ok: false, message: 'Boxen svarar inte' }; }
    if (!r.ok) {
      M.hud.toast(r.message === 'no_key' ? 'Immich saknar nyckel' : r.message || 'Det gick inte', 'info');
      if (list[at]) redraw();
      return;
    }
    // Ej foto: on its way in the background; the holes until the daemon
    // says it is done (the "bilder" event, below), browsing on meanwhile.
    if (key === 'not_photo') {
      const h = holes();
      moving.set(a.id, { holes: h.svg, stop: h.stop });
      redraw();
      return;
    }
    changed = true;
    if (key === 'favorite') {
      a.favorite = !a.favorite;
      M.hud.toast(a.favorite ? 'Favorit' : 'Inte favorit längre', 'heart');
      redraw();
    } else {
      M.hud.toast('Lagd i papperskorgen', 'check');
      gone(a.id);
    }
  }
  // One out of the list (in the trash, or moved to the Drive): the next
  // shown if it was the one on screen.
  function gone(id) {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const shown = i === at;
    list.splice(i, 1);
    if (i < at) at--;
    if (!list.length) { viewer.close(); return; }
    at %= list.length;
    if (shown && viewer.isOpen()) draw(false);
    else if (viewer.isOpen()) part.count.textContent = list.length > 1 ? `${at + 1} av ${list.length}` : '';
  }
  // The daemon's word on an Ej foto (its toast says it everywhere): moved,
  // the picture goes; failed or called off, it stays, its row as before.
  M.bridge.on('bilder', (e) => {
    const m = e && moving.get(e.id);
    if (!m) return;
    m.stop();
    moving.delete(e.id);
    if (e.action === 'moved') {
      changed = true;
      if (viewer.isOpen()) gone(e.id);
      else if (M.browse) M.browse.route();          // back on the grid already: drawn without it
    }
    if (viewer.isOpen() && list[at] && !part.info.hidden) redraw();
  });

  function showCaption(keep) {
    if (!part.info.hidden) return;                 // the panel says it all
    caption.classList.add('pv-shown');
    clearTimeout(captionTimer);
    if (!keep) captionTimer = setTimeout(() => caption.classList.remove('pv-shown'), CAPTION_MS);
  }

  function step(by, fade) {
    if (!list.length) return;
    scrub = null; target = null;
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
    if (show) {
      timer = setInterval(tick, EVERY_MS);
      alive(true);
      if (part.info.hidden) caption.classList.remove('pv-shown');
      // The one on screen moves too, from now.
      const img = layers[front].querySelector('img');
      if (img && list[at] && !list[at].video) burns(img);
    }
    else {
      for (const img of root.querySelectorAll('.pv-layer img')) { img.style.transition = 'none'; img.style.transform = ''; }
      M.bridge.daemon({ type: 'activity', playing: false });
    }
  }
  // Something plays, as a video says it (main.js), so the screensaver waits.
  function alive(now) {
    if (!now && Date.now() - said < 30000) return;
    said = Date.now();
    M.bridge.daemon({ type: 'activity', playing: true });
  }

  // In mpv instead, when the browser cannot play it.
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
    noKeyboard: true,                // Y (Sök) does nothing over it (main.js)
    isOpen() { return !!root && !root.hidden; },
    open(assets, index = 0, { slideshow: start = false } = {}) {
      if (!assets || !assets.length) return;
      build();
      list = assets;
      changed = false;
      at = Math.max(0, Math.min(assets.length - 1, index));
      layers.forEach((l) => { l.innerHTML = ''; l.classList.remove('pv-on', 'pv-fade'); });
      root.hidden = false;
      panel(false);
      M.nav.captured = this;
      if (start && list[at].video) { const i = list.findIndex((a) => !a.video); if (i >= 0) at = i; }
      show = start;
      draw(false);
      if (start) slideshow(true); else { slideshow(false); showCaption(); }
    },
    close() {
      if (!this.isOpen()) return;
      slideshow(false);
      for (const v of root.querySelectorAll('video')) v.pause();
      scrub = null; target = null;
      root.hidden = true;
      if (M.nav.captured === this) M.nav.captured = null;
      // Something was changed (a favourite, the trash): the view anew.
      if (changed && M.browse) { M.browse.route(); return; }
      // Back on the grid, on the picture last seen (the grid's items are
      // the viewer's list, in its order).
      const card = list[at] && document.querySelector(`.view [data-key="${CSS.escape(`asset:${list[at].id}`)}"]`);
      if (card) M.nav.focus(card);
      else if (M.grid && M.grid.active) M.grid.active.focusIndex(at);
    },
    // B: the panel closed, else the viewer. A: the panel, and there what is
    // marked. X: a clip plays, a picture starts or stops the slideshow.
    onKeyDown(e) {
      const open = !part.info.hidden;
      if (e.key === 'Escape') { if (open) panel(false); else this.close(); return; }
      if (e.key === ' ') {
        if (e.repeat) return;
        if (list[at] && list[at].video) { playHere(); return; }
        slideshow(!show);
        if (open) redraw(); else if (!show) showCaption();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        step(e.key === 'ArrowLeft' ? -1 : 1, false);
        if (M.sound) M.sound.tick(e.key);
        if (show) { clearInterval(timer); timer = setInterval(tick, EVERY_MS); } else if (!open) showCaption();
        return;
      }
      if (open && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const n = actionsOf(list[at]).length;
        choice = (choice + (e.key === 'ArrowUp' ? n - 1 : 1)) % n;
        sure = 0;
        redraw();
        if (M.sound) M.sound.tick(e.key);
        return;
      }
      if (e.key === 'Enter' && !e.repeat) {
        if (open) act(actionsOf(list[at])[choice].key);
        else panel(true);
      }
    },
  };
  // The keyboard takes the pad while open; it comes back here.
  M.bridge.on('keyboard:close', () => { if (viewer.isOpen() && !M.nav.captured) M.nav.captured = viewer; });

  M.players = M.players || {};
  M.players.photo = viewer;
})(window.PioneerTV);
