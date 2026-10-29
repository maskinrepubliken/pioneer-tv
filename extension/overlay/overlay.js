// Pioneer TV overlay page: every menu, every toast and the screensaver,
// over every window.
//
// Loaded by system/overlay.py, a WebKit view on labwc's top layer, from the
// daemon (/ext/overlay/). It talks to the daemon over the WebSocket like the
// Spel pages; the daemon sends it Home, and Y and B while its menu is open,
// and every toast (daemon/pioneertv/overlay.py). The window takes the
// keyboard only while a menu or its keyboard (Sök) is open, so the pad
// drives the page below the rest of the time; what the menu cannot do here
// (go home, back, reload, open a page) it asks the page to do (bridge.relay).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;
  const menu = M.hud.menu;
  // overlay.py listens here; in a browser (designing) there is nobody.
  const host = (msg) => {
    try { window.webkit.messageHandlers.pioneertv.postMessage(JSON.stringify(msg)); } catch {}
  };

  // The keyboard goes back to the window below only once every key is up.
  // The menu closes on a key's press (B, or A on Tillbaka); a window that
  // gets the keyboard while that key is still down is told it is held, and
  // Chromium took the B that closed the menu as its own Escape and left
  // fullscreen (seen on the box over SVT1). Registered before the spatial
  // navigation, which stops the keys the menu handles.
  const down = new Set();
  let letGo = null;
  let giveUp = null;             // the fallback for a key up that never comes
  window.addEventListener('keydown', (e) => down.add(e.code), true);
  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
    if (!down.size && letGo) letGo();
  }, true);

  b.init();
  M.nav.init();
  b.state.tvMode = true;
  document.documentElement.classList.add('pioneertv-tv');

  // Once per connection (state comes with every status, every ten seconds).
  let greeted = false;
  b.on('state', (s) => {
    if (s.daemonConnected && !greeted) b.daemon({ type: 'hello', client: 'overlay' });
    greeted = s.daemonConnected;
    if (!s.daemonConnected && menu.isOpen()) menu.close();
  });

  // Home: the quick menu, or away with it. The home page asks for a panel
  // of its own (Live, Sök). Held, Home goes to the home page: away with
  // everything here.
  const away = () => { if (M.keyboard.isOpen()) M.keyboard.close(); menu.close(); };
  b.on('menu', (e) => {
    if (e && e.panel) return M.mainMenu.panel(e.panel);
    if (e && e.open) return menu.isOpen() || menu.open(M.mainMenu.spec());
    // Over a site's video: its panel (below), the quick menu one step in.
    if (!menu.isOpen() && webVideo()) return webPanel();
    menu.toggle();
  });
  b.on('home', () => { if (!held) away(); });
  // Y: away with the keyboard, else with the menu (as on the pages).
  b.on('keyboard', () => (M.keyboard.isOpen() ? M.keyboard.close() : menu.close()));
  b.on('escape', () => (M.keyboard.isOpen() ? M.keyboard.close() : menu.back()));
  // The page a choice opened has loaded: the menu waiting on it goes.
  b.on('loaded', () => { if (menu.punching) menu.close(); });
  // Nothing of a menu stays under the screensaver.
  b.on('saver', (e) => { if (e.show && !held) away(); });

  // The window has the keyboard while the menu or the keyboard is open, and
  // the daemon is told (it routes Y and B here then, and pauses what plays).
  // Going from one to the other (Sök) is not a close and an open.
  let mine = false;
  function sync() {
    const now = menu.isOpen() || M.keyboard.isOpen();
    if (now === mine) return;
    mine = now;
    if (now) { letGo = null; clearTimeout(giveUp); host({ keyboard: true }); }
    else releaseKeyboard();
    b.daemon({ type: 'overlay_menu', open: now });
  }
  function releaseKeyboard() {
    const done = () => { clearTimeout(giveUp); letGo = null; if (!mine) host({ keyboard: false }); };
    clearTimeout(giveUp);
    giveUp = setTimeout(() => { down.clear(); done(); }, 1500);   // a key up that never came
    letGo = done;
    if (!down.size) done();
  }
  for (const ev of ['menu:open', 'menu:close', 'keyboard:open', 'keyboard:close']) b.on(ev, () => queueMicrotask(sync));
  // Sök's keyboard over the menu: the menu has the pad again when it goes.
  b.on('keyboard:close', () => { if (menu.isOpen() && !M.nav.captured) M.nav.captured = menu; });

  // The toasts and the pad's colours (overlay/hud.js).
  M.hud.listen(b);

  // ------------------------------------------------------------ pause panels
  // A game or a video, held where it is by the daemon ("held"), with its
  // panel over it. B closes the panel and carries on (a choice that closes
  // it runs in the same turn, so that is checked a moment later); so do X
  // (its filled row, Fortsätt) and Home, which the daemon takes itself.
  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  async function post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch {
      return { ok: false, message: 'Boxen svarar inte' };
    }
  }
  let held = null;               // { kind, resume, e } while a panel is open
  let chose = false;             // a choice closed the panel, not B
  function panel(kind, e, title, items, note, at, resume, spec) {
    held = { kind, resume, e };
    chose = false;
    menu.open(spec || { title: title || 'Pausat', note, items });
    menu.index = at || 0;
    menu.highlight();
  }
  const pick = (f) => () => { chose = true; f(); };
  b.on('menu:close', () => {
    if (!held) return;
    queueMicrotask(() => {
      if (!chose && held && !menu.isOpen()) held.resume();
      if (!menu.isOpen()) held = null;
    });
  });
  function closePanel(kind) {
    if (held && held.kind === kind && menu.isOpen()) { chose = true; held = null; menu.close(); }
  }

  // A game (games.py): Fortsätt spela, Spara läge, Ladda läge, Starta om,
  // TV-volym, Avsluta; each one of RetroArch's own commands. Holding B quits.
  const games = (path, body) => post(`/api/games${path}`, body);
  function gamePanel(e, at = 0) {
    const note = document.createElement('div');
    note.className = 'pioneertv-menu-note';
    (e.players || []).forEach((name, i) => {
      const p = document.createElement('p');
      p.textContent = `Spelare ${i + 1} · ${name}`;
      note.appendChild(p);
    });
    panel('game', e, e.title, [
      { label: 'Fortsätt spela', icon: 'play', primary: true, run: pick(() => games('/resume', { load: 'auto' })) },
      { label: 'Spara läge', icon: 'check', keep: true, run: async () => {
        const r = await games('/save_point');
        M.hud.toast(r.ok === false ? (r.message || 'Det gick inte att spara') : 'Läget är sparat', r.ok === false ? 'info' : 'check');
        if (r.ok !== false && held && held.kind === 'game') gamePanel({ ...e, point: Date.now() / 1000 }, 1);   // Ladda läge has a time now
      } },
      { label: 'Ladda läge', icon: 'back', detail: e.point ? hhmm(e.point) : 'inget sparat', disabled: !e.point,
        run: pick(() => games('/resume', { load: 'point' })) },
      { label: 'Starta om', icon: 'reload', run: pick(() => games('/resume', { load: 'none' })) },
      { label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, keep: true, run: () => b.cec('mute') },
      { label: 'Avsluta', icon: 'power', run: pick(() => games('/quit')) },
    ], note, at, () => games('/resume', { load: 'auto' }));
  }
  b.on('games', (e) => (e.state === 'held' ? gamePanel(e) : closePanel('game')));

  // ------------------------------------------------------------ the media panel
  // One panel for whatever plays: a film in mpv (video.py), a site's video
  // (content/webvideo.js in each of the page's frames), the box's music and
  // radio (audio.py). The same rows in the same order, those that apply:
  //
  //   Fortsätt (a film, a video: the panel paused it) or Pausa / Spela (the
  //   music: it plays on under the menu); Spola ◀ ▶ 15 s; Spola ◀ ▶ 2 min;
  //   Gå till ◀ ▶ (a mark on the timeline, a twentieth at a press; A goes
  //   there); Från början; Låt ◀ ▶ (the queue); Ljud; Undertexter;
  //   TV-volym ◀ ▶; Meny (the quick menu, one step in); Sluta.
  //
  // A source says what plays and does it:
  //   { kind, title, live, time, duration, paused, index, count, audio, subs,
  //     to(t), toggle(), skip(dir), track(kind, list, current), stop(), first }
  // The open panel follows it by the words of its rows only, in place (drawn
  // anew, the whole menu went and came back: it blinked over SVT Play).
  // Where a seek was put stands until the source has got there (or a moment
  // has passed), and a time that plays runs on between its words.
  const STEPS = [[15, 'Spola', '15 s'], [120, 'Spola långt', '2 min']];
  const clock = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const lengthOf = (src) => (src.live ? src.end || src.time : src.duration) || 0;
  const where = (src) => (src.live ? (src.end - src.time > 30 ? `${clock(src.end - src.time)} efter direkt` : 'direkt') : `${clock(src.time)} av ${clock(src.duration)}`);
  let media = null;              // { src, spec, aim, target } while a media panel is in the menu
  function mediaOpen() { return media && menu.isOpen() && menu.stack.includes(media.spec); }
  function mediaSpec(src, at = 0) {
    media = { src, aim: null, target: null, spec: null };
    const m = media;
    const items = [];
    const seekTo = (t) => {
      t = Math.max(0, Math.min(lengthOf(src) || t, t));
      src.to(t);
      src.time = t;
      m.aim = { time: t, until: Date.now() + 2500 };
      refresh();
    };
    items.push(src.first(m));
    if (!src.live || src.end) {
      for (const [size, label, says] of STEPS) {
        items.push({ label, icon: 'arrowRight', keep: true, run: () => {}, say: () => `◀ ▶ ${says} · ${where(src)}`,
          step: (dir) => seekTo(src.time + dir * size) });
      }
    }
    if (!src.live && src.duration) {
      // A mark on the timeline: a twentieth at a press, A goes there.
      items.push({ label: 'Gå till', icon: 'clock', keep: true,
        say: () => { const t = m.target == null ? src.time : m.target; return `◀ ${bar(t / src.duration)} ▶ ${clock(t)}`; },
        step: (dir) => {
          const base = m.target == null ? src.time : m.target;
          m.target = Math.max(0, Math.min(src.duration - 1, base + dir * src.duration / 20));
          refresh();
        },
        run: () => { if (m.target != null) { seekTo(m.target); m.target = null; refresh(); } } });
      items.push({ label: 'Från början', icon: 'reload', keep: true, run: () => seekTo(0) });
    }
    if (src.count > 1) {
      items.push({ label: 'Låt', icon: 'vinyl', keep: true, run: () => src.skip(1), say: () => `◀ ▶ ${src.index + 1} av ${src.count}`,
        step: (dir) => src.skip(dir) });
    }
    if (src.audio && src.audio.length > 1) {
      items.push({ label: 'Ljud', icon: 'volume', keep: true, say: () => (src.audio.find((t) => t.selected) || src.audio[0]).label,
        run: () => src.track('audio') });
    }
    if (src.subs && src.subs.length) {
      items.push({ label: 'Undertexter', icon: 'info', keep: true, say: () => (src.subs.find((t) => t.selected) || { label: 'Av' }).label,
        run: () => src.track('subtitles') });
    }
    items.push({ label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, keep: true, run: () => b.cec('mute') });
    if (src.menu) items.push({ label: 'Meny', icon: 'menu', detail: 'snabbmenyn', keep: true, run: () => menu.push(M.mainMenu.spec()) });
    items.push(src.last);
    for (const it of items) if (it.say) it.detail = it.say();
    m.spec = { title: src.title || 'Spelas', items, at };
    return m.spec;
  }
  // A line of ten as the timeline, the mark where it would go.
  const bar = (share) => { const n = Math.max(0, Math.min(9, Math.round(share * 9))); return '─'.repeat(n) + '●' + '─'.repeat(9 - n); };
  // The open panel's words, from where its source is now.
  function refresh() {
    if (!mediaOpen()) return;
    if (media.src.title && media.spec.title !== media.src.title) {
      media.spec.title = media.src.title;
      const t = menu.stack[menu.stack.length - 1] === media.spec && menu.root && menu.root.querySelector('.pioneertv-menu-title');
      if (t) t.textContent = media.src.title;
    }
    for (const it of media.spec.items) {
      const text = it.say ? it.say() : null;
      const label = it.sayLabel ? it.sayLabel() : null;
      if (text != null) it.detail = text;
      if (label != null) it.label = label;
      if (!it.el) continue;
      const d = it.el.querySelector('.pioneertv-menu-detail');
      if (d && text != null && d.textContent !== text) d.textContent = text;
      const l = it.el.querySelector('.pioneertv-menu-label');
      if (l && label != null && l.textContent !== label) l.textContent = label;
    }
  }
  // Word from the source: what it says, unless a seek is still on its way.
  function heard(src, said) {
    if (!media || media.src !== src) return;
    // Another song: no seek on its way, no mark on its timeline.
    if (said.index != null && said.index !== src.index) { media.aim = null; media.target = null; }
    const aim = media.aim;
    Object.assign(src, said);
    if (aim && Date.now() < aim.until && Math.abs((said.time || 0) - aim.time) > 3) src.time = aim.time;
    else media.aim = null;
    src.at = Date.now();
    refresh();
  }
  // A time that plays runs on between the source's words.
  setInterval(() => {
    if (!mediaOpen() || media.src.paused || media.src.live) return;
    const src = media.src;
    const now = Date.now();
    src.time = Math.min(lengthOf(src) || Infinity, src.time + (now - (src.at || now)) / 1000);
    src.at = now;
    refresh();
  }, 1000);
  // Ljud and Undertexter: A steps to the next track.
  const nextTrack = (list, none) => {
    const all = none ? [none, ...list] : list;
    const now = all.find((t) => t.selected) || all[0];
    return all[(all.indexOf(now) + 1) % all.length];
  };
  const mark = (list, chosen) => list.map((t) => ({ ...t, selected: t.id === chosen.id }));

  // A film in mpv (video.py): held paused by the daemon while the panel is
  // open; B, Fortsätt or Home carry on, holding B stops it.
  const video = (path, body) => post(`/api/video${path}`, body);
  function videoPanel(e) {
    const src = {
      kind: 'video', title: e.title, live: false, time: e.time || 0, duration: e.duration || 0, paused: true,
      audio: e.audio || [], subs: e.subtitles || [],
      to: (t) => video('/to', { at: t }),
      track: async (kind) => {
        const list = kind === 'audio' ? src.audio : src.subs;
        const next = nextTrack(list, kind === 'audio' ? null : { id: 'no', label: 'Av' });
        const r = await video('/track', { kind, id: next.id });
        if (r.ok === false) return;
        if (kind === 'audio') src.audio = mark(src.audio, next); else src.subs = mark(src.subs, next);
        refresh();
      },
      first: () => ({ label: 'Fortsätt', icon: 'play', primary: true, run: pick(() => video('/resume')) }),
      last: { label: 'Sluta titta', icon: 'power', detail: 'håll B', run: pick(() => video('/stop')) },
    };
    panel('video', e, null, null, null, 0, () => video('/resume'), mediaSpec(src));
  }
  b.on('video', (e) => (e.state === 'held' ? videoPanel(e) : closePanel('video')));

  // A site's video (SVT Play, Cineasterna, any page; content/webvideo.js in
  // each of the page's frames says how its video is). The menu opening
  // paused it (the media event); closing it carries on, a seek where it
  // was put.
  const frames = new Map();      // frame -> what it said last, and when
  const webVideo = () => {
    let best = null;
    for (const [id, s] of frames) {
      if (Date.now() - s.at > 60000) { frames.delete(id); continue; }
      if (s.present && (!best || s.area > best.area)) best = s;
    }
    return best;
  };
  const pageTitle = () => { for (const s of frames.values()) if (s.top && s.title) return s.title; return ''; };
  const tell = (frame, action, value) => b.relay('webvideo', { frame, action, value });
  let webSrc = null;
  b.on('webvideo', (e) => {
    frames.set(e.frame, { ...e, at: Date.now() });
    if (webSrc && webSrc.frame === e.frame) heard(webSrc, { time: e.time, duration: e.duration, end: e.end, live: e.live, paused: e.paused, subs: e.subs });
  });
  function webPanel() {
    const v = webVideo();
    if (!v) return;
    const src = webSrc = {
      kind: 'web', frame: v.frame, title: v.title || pageTitle() || 'Video', live: v.live, time: v.time, duration: v.duration, end: v.end,
      paused: true, subs: v.subs, menu: true,
      to: (t) => tell(v.frame, 'to', t),
      track: () => tell(v.frame, 'subs', nextTrack(src.subs, { id: -1, label: 'Av' }).id),
      first: () => ({ label: 'Fortsätt', icon: 'play', primary: true, run: pick(() => {}) }),
      last: { label: 'Sluta titta', icon: 'back', detail: 'tillbaka', run: pick(() => b.back()) },
    };
    panel('web', v, null, null, null, 0, () => {}, mediaSpec(src));
  }

  // The box's music and radio (audio.py): it plays on under the menu; the
  // quick menu's first row (Spelas nu) opens its panel, one step in.
  const sound = (action, body) => post(`/api/audio/${action}`, body);
  let audioState = { state: 'idle' };
  let audioSrc = null;
  function fromAudio(s) {
    const it = s.item || {};
    return { title: it.artist ? `${it.name} · ${it.artist}` : it.name, live: s.live, time: s.time || 0, duration: s.duration || it.seconds || 0,
      paused: s.state !== 'playing', index: s.index, count: s.kind === 'music' ? s.count : 0, state: s.state };
  }
  b.on('audio', (s) => {
    audioState = s;
    if (!audioSrc) return;
    if (s.state === 'idle') {
      if (mediaOpen() && media.src === audioSrc) { while (menu.stack[menu.stack.length - 1] !== media.spec) menu.stack.pop(); menu.back(); }
      audioSrc = null;
      return;
    }
    const was = audioSrc.count;
    heard(audioSrc, fromAudio(s));
    if (was !== audioSrc.count && mediaOpen()) refresh();
  });
  fetch('/api/audio').then((r) => r.json()).then((s) => { if (s && s.state) audioState = s; }).catch(() => {});
  function audioSpec() {
    const src = audioSrc = {
      kind: 'audio', ...fromAudio(audioState),
      to: (t) => sound('to', { at: t }),
      skip: (dir) => sound(dir > 0 ? 'next' : 'prev'),
      first: () => ({ label: audioSrc.paused ? 'Spela' : 'Pausa', icon: 'play', primary: true, keep: true,
        sayLabel: () => (src.paused ? 'Spela' : 'Pausa'), run: () => sound('toggle') }),
      last: { label: 'Sluta spela', icon: 'power', keep: true, run: () => sound('stop') },
    };
    return mediaSpec(src);
  }
  // The quick menu's row for it (main-menu.js), while something plays.
  function nowRow() {
    const s = audioState;
    if (!s || s.state === 'idle' || !s.item) return null;
    return { label: s.item.name, icon: s.kind === 'radio' ? 'radio' : 'vinyl', detail: s.state === 'paused' ? 'pausad' : 'spelas nu', sub: audioSpec };
  }

  M.overlay = { host };
  M.media = { nowRow };
})(window.PioneerTV);
