// The catalogue of every view (dev/katalog.html). Each entry opens one of
// the box's own pages in a 1280x720 frame and puts it in one of its states
// through the page's own code (its PioneerTV object), with the stand-in data
// from dev/mock.py behind it. To add a view: an entry in VIEWS below.
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = '/ext/launcher/';

  // ------------------------------------------------------------ helpers
  // Waits for a selector in the frame's document.
  async function waitFor(doc, selector, ms = 6000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const el = doc.querySelector(selector);
      if (el) return el;
      await sleep(80);
    }
    return null;
  }

  // The daemon as the menus see it: connected, with a status to show.
  const STATUS = {
    type: 'status',
    wifi: { state: 'connected', ssid: 'Småhusbyn', signal: 62 },
    tailscale: { state: 'running', server_online: true, server_name: 'Film & serier', ips: ['100.127.191.97'] },
    interfaces: [], system: { temp_c: 54 },
    gamepads: [{ name: 'Rosa handkontroll', battery: 80 }],
  };
  function daemonUp(P) {
    const b = P.bridge;
    Object.defineProperty(b.state, 'daemonConnected', { get: () => true, set: () => {}, configurable: true });
    b.state.status = STATUS;
    b.emit('state', b.state);
  }

  // The screensaver, and a key takes it away as the daemon does on the box
  // (there the press does nothing else; here it reaches the page below).
  const tryTheSaver = (overlay) => ({ P }) => {
    if (overlay) P.bridge.emit('saver', { show: true }); else P.hud.saver.show();
    // The spatial navigation hands every key to a captured layer first.
    P.nav.captured = {
      onKeyDown() {
        P.nav.captured = null;
        if (overlay) P.bridge.emit('saver', { show: false }); else P.hud.saver.hide();
      },
    };
  };

  // ------------------------------------------------------------ the views
  // Two parts: the shared components (each once, with its variants, drawn by
  // whichever host shows it on the box) and the pages. A group has files
  // (where its code is), used (where it shows) and items; an item has name,
  // url (in the frame), under (a page behind a transparent overlay), ready (a
  // selector to wait for), setup (puts the page in its state), note, zoom.
  const OVERLAY = '/ext/overlay/index.html';
  const HOME = `${L}index.html?tv=1`;
  const GAME_PICTURE = '/romm/assets/cover/101.svg';
  const FILM_PICTURE = '/jellyfin/Items/serie1-s1e3/Images/Primary?tag=p';
  const LONG = 600000;
  // zoom: the part of the screen a small view shows, [x, y, width] of 1280x720.
  const TOAST_CORNER = [560, 0, 720];
  // A toast as the box shows it: drawn by the overlay over whatever is on screen.
  const toast = (text, icon, note) => ({
    name: text, under: HOME, url: OVERLAY, note, zoom: TOAST_CORNER,
    setup: ({ P }) => P.hud.toast(text, icon, LONG),
  });
  const VIEWS = [
    { part: 'Komponenter', group: 'Notis', files: 'content/hud.js (hud.toast) · content/content.css (.pioneertv-toast)',
      used: 'Allt på skärmen. Overlayn ritar den; sidan själv bara när overlayn är nere (hud.listen). Daemonen skickar sina via händelsen toast.',
      items: [
        toast('Rosa handkontroll ansluten', 'gamepad', 'hud.listen · gamepad'),
        toast('Rosa handkontroll frånkopplad', 'gamepad', 'hud.listen · gamepad'),
        toast('Tangentbord anslutet', 'keyboard', 'hud.listen · keyboard_present'),
        toast('Tangentbord frånkopplat', 'keyboard', 'hud.listen · keyboard_present'),
        toast('Volym +', 'volume', 'hud.listen · volume (ui.volume_toast)'),
        toast('Volym −', 'volume', 'hud.listen · volume'),
        toast('Ljud av', 'mute', 'hud.listen · volume'),
        toast('Läget är sparat', 'check', 'overlay.js · spelets pausmeny, Spara'),
        toast('Det gick inte att spara', 'info', 'overlay.js · spelets pausmeny, Spara'),
        toast('Söker efter uppdatering…', 'reload', 'daemon main.py · uppdatering'),
        toast('Redan senaste versionen (01b8c7c)', 'check', 'daemon main.py · uppdatering'),
        toast('Uppdaterar 69fe69d → 01b8c7c, startar om strax', 'reload', 'daemon main.py · uppdatering'),
        toast('Uppdatering: inget nätverk', 'info', 'daemon main.py · uppdatering, fel'),
        toast('Kunde inte starta uppdatering: …', 'info', 'daemon main.py · uppdatering, fel'),
        toast('Daemon ansluten · www.svtplay.se', 'info', 'content/main.js · när daemonen kommer och går'),
        toast('Ingen daemon · www.svtplay.se', 'info', 'content/main.js'),
        toast('Inget textfält på sidan', 'keyboard', 'content/keyboard.js · Y på en sida utan textfält'),
        toast('Videon hakade upp sig, försöker igen', 'reload', 'content/video.js'),
        toast('Vänster/höger justerar · B lämnar', 'info', 'content/spatial-nav.js · A på ett reglage'),
        toast('Upp/ner väljer · B lämnar', 'info', 'content/spatial-nav.js · A på en lista'),
        toast('Lämnade reglaget', 'info', 'content/spatial-nav.js'),
        toast('Inga låtar i biblioteket', 'info', 'launcher/musik.js · Blanda allt'),
        toast('Borttaget · X ångra', 'gamepad', 'launcher/spel.js · X på ett senast spelat'),
        toast('M', '', 'launcher/spel.js · hopp till en bokstav'),
        { name: 'Utan overlay: sidan ritar den', url: HOME, ready: '.tile',
          setup: ({ P }) => P.hud.toast('Rosa handkontroll ansluten', 'gamepad', LONG),
          note: 'Samma kod och stil, i sidans eget lager.' },
        { name: 'Inställningssidans egen notis', url: '/static/settings.html?mock=1', wait: 1500, zoom: TOAST_CORNER,
          setup: ({ doc }) => { const t = doc.getElementById('toast'); if (t) { t.textContent = 'Sparat'; t.classList.add('show'); } },
          note: 'En annan, enklare: daemon/pioneertv/web/settings.js (toast). Sparat, Klart, Misslyckades: …' },
      ] },
    { part: 'Komponenter', group: 'Snabbmenyn', files: 'content/hud.js (hud.menu) · content/content.css (.pioneertv-menu)',
      used: 'Hem-knappen överallt. Overlayn ritar den; sidan själv när overlayn är nere.',
      items: [
        { name: 'I overlayn', under: HOME, url: OVERLAY, setup: ({ P }) => { daemonUp(P); P.hud.menu.open(); } },
        { name: 'Utan overlay: sidan ritar den', url: HOME, ready: '.tile', setup: ({ P }) => { daemonUp(P); P.hud.menu.open(); } },
      ] },
    { part: 'Komponenter', group: 'Panel', files: 'content/hud.js (hud.menu.open({ title, note, items }))',
      used: 'Snabbmenyns ram med egna val: startsidan och overlayns pausmenyer.',
      items: [
        { name: 'Live-listan (startsidan)', url: HOME, ready: '.tile', setup: ({ doc }) => doc.querySelector('[data-service="live"]').click() },
        { name: 'Sök: var (startsidan)', url: HOME, ready: '.tile',
          setup: ({ doc }) => { const f = doc.getElementById('search-form'); f.querySelector('input').value = 'mario'; f.requestSubmit(); } },
        { name: 'Spelets pausmeny', under: GAME_PICTURE, url: OVERLAY, note: 'overlay/overlay.js',
          setup: ({ P }) => P.bridge.emit('games', { state: 'held', title: 'Tetris & Dr. Mario', point: Date.now() / 1000 - 3600, players: ['Rosa handkontroll', 'Grön handkontroll'] }) },
        { name: 'Spelets pausmeny, inget sparat läge', under: GAME_PICTURE, url: OVERLAY, note: 'overlay/overlay.js',
          setup: ({ P }) => P.bridge.emit('games', { state: 'held', title: 'Super Mario World', point: null, players: ['Rosa handkontroll'] }) },
        { name: 'Filmens pausmeny', under: FILM_PICTURE, url: OVERLAY, note: 'overlay/overlay.js',
          setup: ({ P }) => P.bridge.emit('video', { state: 'held', title: 'Avsnitt 3',
            audio: [{ id: 1, label: 'Engelska', selected: true }, { id: 2, label: 'Svenska · Kommentar' }],
            subtitles: [{ id: 1, label: 'Svenska' }, { id: 2, label: 'Engelska' }] }) },
      ] },
    { part: 'Komponenter', group: 'Skärmsläckaren', files: 'content/hud.js (hud.saver) · content/content.css (.pioneertv-saver) · daemon idle.py',
      used: 'Alla bläddringsvyer efter en stund utan knapptryck, aldrig medan något spelas. Overlayn ritar den; sidan när overlayn är nere.',
      items: [
        { name: 'I overlayn', under: HOME, url: OVERLAY, setup: tryTheSaver(true),
          note: 'En knapp tar bort den (på TV:n tar daemonen emot knappen, och den gör inget annat).' },
        { name: 'Utan overlay: sidan ritar den', url: HOME, ready: '.tile', setup: tryTheSaver(false),
          note: 'Hoppar till ett nytt ställe varje minut.' },
      ] },
    { part: 'Komponenter', group: 'Skärmtangentbordet', files: 'content/keyboard.js', used: 'Y på alla sidor; sökfälten.',
      items: [
        { name: 'Sök på startsidan', url: `${HOME}&demo=keyboard`, ready: '.tile', wait: 1200 },
      ] },
    { part: 'Komponenter', group: 'Loggar', files: 'content/logs.js', used: 'Inställningar → System, och snabbmenyn.',
      items: [
        { name: 'Loggar', url: `${HOME}&demo=logs`, ready: '.tile', wait: 1200 },
      ] },
    { part: 'Komponenter', group: 'Pekaren', files: 'content/cursor.js', used: 'Högra spaken, på alla sidor.',
      items: [
        { name: 'Pekaren på startsidan', url: HOME, ready: '.tile',
          setup: ({ P }) => { for (let i = 0; i < 12; i++) P.bridge.emit('pointer', { dx: 14, dy: 7 }); } },
      ] },
    { part: 'Komponenter', group: 'Sidornas meddelanden', files: 'launcher/views.js (M.views) · launcher/spel.css (.spel-message)',
      used: 'Spel, Musik och Film & serier: samma ord och samma ruta för alla.',
      items: [
        { name: 'Laddar…', url: `${L}spel.html?tv=1`, ready: '.spel-card', setup: ({ doc, P }) => P.views.loading(doc.getElementById('view')),
          note: 'Visas tills tjänsten svarat.' },
        { name: 'Ingen API-nyckel (RomM)', url: `${L}spel.html?tv=1&mockerror=no_key`, ready: '.spel-message' },
        { name: 'Nyckeln godtas inte (Jellyfin)', url: `${L}musik.html?tv=1&mockerror=auth`, ready: '.spel-message' },
        { name: 'Tjänsten svarar inte (Jellyfin)', url: `${L}film.html?tv=1&mockerror=down`, ready: '.spel-message', note: 'Försöker igen två gånger först, några sekunder.' },
      ] },

    { part: 'Sidor', group: 'Startsidan', files: 'launcher/index.html · launcher.js · launcher.css', used: 'Hem.',
      items: [
        { name: 'Startsidan', url: HOME, ready: '.tile' },
      ] },
    { part: 'Sidor', group: 'Spel', files: 'launcher/spel.html · spel.js · spel.css · romm.js', used: 'Rutan Spel.',
      items: [
        { name: 'Start: senast spelade, konsoler, samlingar', url: `${L}spel.html?tv=1`, ready: '.spel-card' },
        { name: 'En konsol', url: `${L}spel.html?tv=1#/platform/1`, ready: '.spel-card--grid' },
        { name: 'En samling', url: `${L}spel.html?tv=1#/collection/own/1`, ready: '.spel-card--grid' },
        { name: 'Sök', url: `${L}spel.html?tv=1#/search/mario`, ready: '.spel-card' },
      ] },
    { part: 'Sidor', group: 'Spela ett spel', files: 'launcher/spela.html · spela.js · spela.css', used: 'Innan RetroArchs fönster täcker skärmen.',
      items: [
        { name: 'Laddar (innan spelet hämtats)', url: `${L}spela.html?rom=101`, wait: 1500 },
        { name: 'Laddar, med megabyte', url: `${L}spela.html?rom=101`, wait: 1500,
          setup: ({ P }) => P.bridge.emit('games', { state: 'loading', got: 12.4e6, total: 31.5e6 }) },
        { name: 'Startar', url: `${L}spela.html?rom=101`, wait: 1500, setup: ({ P }) => P.bridge.emit('games', { state: 'running' }),
          note: 'Står kvar under RetroArchs fönster tills spelet täcker skärmen.' },
        { name: 'Fel: spelet kunde inte startas', url: `${L}spela.html?rom=101`, wait: 1500,
          setup: ({ P }) => P.bridge.emit('games', { state: 'error', message: 'Spelet kunde inte startas: core not found' }) },
      ] },
    { part: 'Sidor', group: 'Musik', files: 'launcher/musik.html · musik.js · musik.css · jellyfin.js', used: 'Rutan Musik.',
      items: [
        { name: 'Start: blanda allt, album, artister, spellistor', url: `${L}musik.html?tv=1`, ready: '.musik-card' },
        { name: 'Album', url: `${L}musik.html?tv=1#/albums`, ready: '.musik-card' },
        { name: 'Artister', url: `${L}musik.html?tv=1#/artists`, ready: '.musik-card' },
        { name: 'Ett album', url: `${L}musik.html?tv=1#/album/album1`, ready: '.musik-song' },
        { name: 'En spellista', url: `${L}musik.html?tv=1#/playlist/lista1`, ready: '.musik-song' },
        { name: 'En artist', url: `${L}musik.html?tv=1#/artist/artist2`, ready: '.musik-card' },
        { name: 'Sök', url: `${L}musik.html?tv=1#/search/kom`, ready: '.musik-card, .musik-song' },
        { name: 'Spelas nu', url: `${L}musik.html?tv=1#/album/album1`, ready: '.musik-song',
          setup: async ({ doc }) => { doc.getElementById('audio').muted = true; doc.querySelector('.musik-song').click(); await sleep(600); } },
        { name: 'Spelas nu, i rubriken medan man bläddrar', url: `${L}musik.html?tv=1#/album/album1`, ready: '.musik-song',
          setup: async ({ doc, P }) => { doc.getElementById('audio').muted = true; doc.querySelector('.musik-song').click(); await sleep(400); P.musik.np.close(); } },
      ] },
    { part: 'Sidor', group: 'Film & serier', files: 'launcher/film.html · film.js · film.css · jellyfin.js', used: 'Rutan Film & serier.',
      items: [
        { name: 'Filmer: fortsätt titta och alla filmer', url: `${L}film.html?tv=1`, ready: '.film-card' },
        { name: 'Serier', url: `${L}film.html?tv=1#/lib/lib-serier`, ready: '.film-card' },
        { name: 'Hemvideor: mappar och klipp', url: `${L}film.html?tv=1#/lib/lib-hem`, ready: '.film-card' },
        { name: 'En mapp', url: `${L}film.html?tv=1#/folder/mapp1`, ready: '.film-card' },
        { name: 'En serie: säsonger och avsnitt', url: `${L}film.html?tv=1#/series/serie1`, ready: '.film-episode' },
        { name: 'En film', url: `${L}film.html?tv=1#/item/film1`, ready: '.knapp.primar' },
        { name: 'Ett avsnitt, påbörjat', url: `${L}film.html?tv=1#/item/serie1-s1e3`, ready: '.knapp.primar' },
        { name: 'Ett klipp (inga undertexter)', url: `${L}film.html?tv=1#/item/klipp1`, ready: '.knapp.primar' },
        { name: 'Sök', url: `${L}film.html?tv=1#/search/s`, ready: '.film-card' },
        { name: 'Startar (innan mpv täcker)', url: `${L}film.html?tv=1#/item/film1`, ready: '.knapp.primar',
          setup: ({ P }) => { P.film.player.state = 'starting'; P.film.player.show('Startar…', 'Fyren'); } },
        { name: 'Slut', url: `${L}film.html?tv=1#/item/film1`, ready: '.knapp.primar',
          setup: ({ P }) => { P.film.player.state = 'running'; P.bridge.emit('video', { state: 'ended' }); } },
        { name: 'Fel: videon kunde inte spelas', url: `${L}film.html?tv=1#/item/film1`, ready: '.knapp.primar',
          setup: ({ P }) => { P.film.player.state = 'starting'; P.bridge.emit('video', { state: 'error', message: 'Videon kunde inte spelas' }); } },
      ] },
    { part: 'Sidor', group: 'Radio', files: 'launcher/radio.html · radio.js', used: 'Live-listan → en kanal i P1–P4.',
      items: [
        { name: 'Radio', url: `${L}radio.html?channel=132&name=P1`, wait: 2000, note: 'Hämtar tablån från Sveriges Radio på riktigt.' },
      ] },
    { part: 'Sidor', group: 'Inställningar', files: 'daemon/pioneertv/web/settings.html · settings.js', used: 'Snabbmenyn → Inställningar.',
      items: [
        { name: 'Inställningar', url: '/static/settings.html?mock=1', wait: 1500, note: 'Med inställningssidans egen exempeldata.' },
      ] },
  ];

  // ------------------------------------------------------------ drawing a view
  async function load(entry, stage) {
    stage.innerHTML = '';
    if (entry.under) {
      // A page, or a picture standing in for a game's or a film's (filling the screen).
      const picture = /\.svg$|\/Images\//.test(entry.under);
      const under = document.createElement(picture ? 'img' : 'iframe');
      under.src = entry.under;
      under.tabIndex = -1;
      if (picture) under.style.cssText = 'position:absolute;inset:0;width:1280px;height:720px;object-fit:cover';
      stage.appendChild(under);
    }
    const frame = document.createElement('iframe');
    // ?katalog: the page starts its shell (main.js) though it is in a frame.
    const url = new URL(entry.url, location.href);
    url.searchParams.set('katalog', '1');
    frame.src = url.href;
    frame.allow = 'autoplay';
    stage.appendChild(frame);
    await new Promise((r) => frame.addEventListener('load', r, { once: true }));
    const win = frame.contentWindow, doc = frame.contentDocument;
    for (let i = 0; i < 50 && !win.PioneerTV; i++) await sleep(50);
    // Cards are skipped while off screen (content-visibility); in a small
    // frame that loaded off screen they would stay blank.
    const style = doc.createElement('style');
    style.textContent = '.film-card, .musik-card { content-visibility: visible !important; }';
    doc.head.appendChild(style);
    if (entry.ready) await waitFor(doc, entry.ready);
    if (entry.wait) await sleep(entry.wait);
    await sleep(150);
    if (entry.setup) {
      try {
        await entry.setup({ win, doc, P: win.PioneerTV });
      } catch (err) {
        console.error(entry.name, err);
      }
    }
    return frame;
  }

  // ------------------------------------------------------------ the index
  const sections = document.getElementById('sections');
  const toc = document.getElementById('toc');
  const all = [];
  VIEWS.forEach((g, gi) => {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = `g${gi}`;
    if (g.part !== (VIEWS[gi - 1] || {}).part) {
      const p = document.createElement('h2');
      p.className = 'part';
      p.textContent = g.part;
      sections.appendChild(p);
      const t = document.createElement('span');
      t.className = 'toc-part';
      t.textContent = g.part;
      toc.appendChild(t);
    }
    const h = document.createElement('h3');
    h.textContent = g.group;
    sec.appendChild(h);
    const meta = document.createElement('dl');
    meta.className = 'meta';
    for (const [k, v] of [['Kod', g.files], ['Används', g.used]]) {
      if (!v) continue;
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      meta.append(dt, dd);
    }
    sec.appendChild(meta);
    const a = document.createElement('a');
    a.href = `#g${gi}`;
    a.textContent = g.group;
    toc.appendChild(a);
    const grid = document.createElement('div');
    grid.className = 'grid';
    g.items.forEach((entry, ii) => {
      entry.id = `${gi}-${ii}`;
      entry.group = g.group;
      all.push(entry);
      const card = document.createElement('a');
      card.className = 'card';
      card.href = `#vy=${entry.id}`;
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const wait = document.createElement('div');
      wait.className = 'wait';
      wait.textContent = 'Ritar…';
      thumb.appendChild(wait);
      card.appendChild(thumb);
      const b = document.createElement('b');
      b.textContent = entry.name;
      card.appendChild(b);
      if (entry.note) { const s = document.createElement('span'); s.textContent = entry.note; card.appendChild(s); }
      const c = document.createElement('code');
      const u = new URL(entry.url, location.href);
      c.textContent = u.pathname.split('/').slice(-2).join('/') + u.search + u.hash;
      card.appendChild(c);
      grid.appendChild(card);
      entry.thumb = thumb;
    });
    sec.appendChild(grid);
    sections.appendChild(sec);
  });

  // Small views load when they come near the screen, a few at a time.
  const queue = [];
  let running = 0;
  function pump() {
    while (running < 4 && queue.length) {
      const entry = queue.shift();
      running++;
      const stage = document.createElement('div');
      stage.style.cssText = 'position:absolute;inset:0;transform-origin:0 0';
      if (entry.zoom) {
        const [x, y, w] = entry.zoom;
        stage.style.transform = `scale(${1280 / w}) translate(${-x * 0.3}px, ${-y * 0.3}px)`;
      }
      entry.thumb.appendChild(stage);
      load(entry, stage).finally(() => {
        running--;
        const w = entry.thumb.querySelector('.wait');
        if (w) w.remove();
        pump();
      });
    }
  }
  const seen = new IntersectionObserver((list) => {
    for (const it of list) {
      if (!it.isIntersecting) continue;
      seen.unobserve(it.target);
      queue.push(all.find((e) => e.thumb === it.target));
      pump();
    }
  }, { rootMargin: '400px' });
  all.forEach((e) => seen.observe(e.thumb));

  // ------------------------------------------------------------ one view, large
  const big = document.getElementById('big');
  const bigStage = document.getElementById('big-stage');
  let current = null;
  function fit() {
    const stage = bigStage.querySelector('.stage');
    if (!stage) return;
    const s = Math.min(bigStage.clientWidth / 1280, bigStage.clientHeight / 720);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  async function openBig(entry) {
    current = entry;
    big.hidden = false;
    document.getElementById('big-title').textContent = `${entry.group} · ${entry.name}`;
    document.getElementById('big-note').textContent = entry.note || '';
    document.getElementById('big-open').href = entry.url;
    bigStage.innerHTML = '';
    const stage = document.createElement('div');
    stage.className = 'stage';
    bigStage.appendChild(stage);
    fit();
    const frame = await load(entry, stage);
    // The keyboard goes to the view: its own focused element, inside the frame.
    frame.contentWindow.focus();
    const P = frame.contentWindow.PioneerTV;
    const inner = (P && P.nav && P.nav.current) || frame.contentDocument.body;
    try { inner.focus({ preventScroll: true }); } catch {}
    stage.addEventListener('mousedown', () => frame.contentWindow.focus());
  }
  function route() {
    const m = /#vy=([\d-]+)/.exec(location.hash);
    const entry = m && all.find((e) => e.id === m[1]);
    if (entry) openBig(entry);
    else { big.hidden = true; bigStage.innerHTML = ''; current = null; }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', fit);
  document.getElementById('big-close').addEventListener('click', () => { location.hash = ''; });
  document.getElementById('big-again').addEventListener('click', () => current && openBig(current));
  route();
})();
