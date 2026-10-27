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
  // name, url (in the frame), under (a page behind a transparent overlay),
  // ready (a selector to wait for), setup (puts the page in its state),
  // note (what to look for).
  const OVERLAY = '/ext/overlay/index.html';
  const GAME_PICTURE = '/romm/assets/cover/101.svg';
  const FILM_PICTURE = '/jellyfin/Items/serie1-s1e3/Images/Primary?tag=p';
  const VIEWS = [
    { group: 'Startsidan', items: [
      { name: 'Startsidan', url: `${L}index.html?tv=1`, ready: '.tile' },
      { name: 'Snabbmenyn (sidans egen, utan overlay)', url: `${L}index.html?tv=1`, ready: '.tile', setup: ({ P }) => { daemonUp(P); P.hud.menu.open(); } },
      { name: 'Live-listan', url: `${L}index.html?tv=1`, ready: '.tile', setup: ({ doc }) => doc.querySelector('[data-service="live"]').click() },
      { name: 'Skärmtangentbordet (sök)', url: `${L}index.html?tv=1&demo=keyboard`, ready: '.tile', wait: 1200 },
      { name: 'Loggar', url: `${L}index.html?tv=1&demo=logs`, ready: '.tile', wait: 1200 },
      { name: 'Notis', url: `${L}index.html?tv=1`, ready: '.tile', setup: ({ P }) => P.hud.toast('Rosa handkontroll ansluten', 'gamepad', 600000) },
      { name: 'Skärmsläckaren', url: `${L}index.html?tv=1`, ready: '.tile', setup: tryTheSaver(false),
        note: 'Hoppar till ett nytt ställe varje minut; en knapp tar bort den. På TV:n ritar overlayn den.' },
    ] },
    { group: 'Overlayn (ritas över alla fönster)', items: [
      { name: 'Snabbmenyn', under: `${L}index.html?tv=1`, url: OVERLAY, setup: ({ P }) => { daemonUp(P); P.hud.menu.open(); } },
      { name: 'Pausmeny i ett spel', under: GAME_PICTURE, url: OVERLAY,
        setup: ({ P }) => P.bridge.emit('games', { state: 'held', title: 'Tetris & Dr. Mario', point: Date.now() / 1000 - 3600, players: ['Rosa handkontroll', 'Grön handkontroll'] }) },
      { name: 'Pausmeny i ett spel, inget sparat läge', under: GAME_PICTURE, url: OVERLAY,
        setup: ({ P }) => P.bridge.emit('games', { state: 'held', title: 'Super Mario World', point: null, players: ['Rosa handkontroll'] }) },
      { name: 'Pausmeny i en film', under: FILM_PICTURE, url: OVERLAY,
        setup: ({ P }) => P.bridge.emit('video', { state: 'held', title: 'Avsnitt 3',
          audio: [{ id: 1, label: 'Engelska', selected: true }, { id: 2, label: 'Svenska · Kommentar' }],
          subtitles: [{ id: 1, label: 'Svenska' }, { id: 2, label: 'Engelska' }] }) },
      { name: 'Notis', under: `${L}index.html?tv=1`, url: OVERLAY, setup: ({ P }) => P.hud.toast('Läget är sparat', 'check', 600000) },
      { name: 'Skärmsläckaren', under: `${L}index.html?tv=1`, url: OVERLAY, setup: tryTheSaver(true),
        note: 'En knapp tar bort den (på TV:n tar daemonen emot knappen, och den gör inget annat).' },
    ] },
    { group: 'Spel', items: [
      { name: 'Start: senast spelade, konsoler, samlingar', url: `${L}spel.html?tv=1`, ready: '.spel-card' },
      { name: 'En konsol', url: `${L}spel.html?tv=1#/platform/1`, ready: '.spel-card--grid' },
      { name: 'En samling', url: `${L}spel.html?tv=1#/collection/own/1`, ready: '.spel-card--grid' },
      { name: 'Sök', url: `${L}spel.html?tv=1#/search/mario`, ready: '.spel-card' },
      { name: 'Fel: ingen API-nyckel', url: `${L}spel.html?tv=1&mockerror=no_key`, ready: '.spel-message' },
      { name: 'Fel: nyckeln godtas inte', url: `${L}spel.html?tv=1&mockerror=auth`, ready: '.spel-message' },
      { name: 'Fel: RomM svarar inte', url: `${L}spel.html?tv=1&mockerror=down`, ready: '.spel-message', note: 'Försöker igen två gånger först, några sekunder.' },
    ] },
    { group: 'Spela ett spel (innan och mellan RetroArch)', items: [
      { name: 'Laddar (innan spelet hämtats)', url: `${L}spela.html?rom=101`, wait: 1500 },
      { name: 'Laddar, med megabyte', url: `${L}spela.html?rom=101`, wait: 1500,
        setup: ({ P }) => P.bridge.emit('games', { state: 'loading', got: 12.4e6, total: 31.5e6 }) },
      { name: 'Startar', url: `${L}spela.html?rom=101`, wait: 1500, setup: ({ P }) => P.bridge.emit('games', { state: 'running' }),
        note: 'Står kvar under RetroArchs fönster tills spelet täcker skärmen.' },
      { name: 'Pausmenyn utan overlay', url: `${L}spela.html?rom=101`, wait: 1500,
        setup: async ({ P }) => { P.bridge.emit('games', { state: 'running' }); await sleep(100); P.bridge.emit('games', { state: 'paused' }); },
        note: 'Bara när overlayn inte kör (Weston). Bilden bakom är RetroArchs skärmdump.' },
      { name: 'Fel: spelet kunde inte startas', url: `${L}spela.html?rom=101`, wait: 1500,
        setup: ({ P }) => P.bridge.emit('games', { state: 'error', message: 'Spelet kunde inte startas: core not found' }) },
    ] },
    { group: 'Musik', items: [
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
      { name: 'Fel: ingen API-nyckel', url: `${L}musik.html?tv=1&mockerror=no_key`, ready: '.spel-message' },
      { name: 'Fel: nyckeln godtas inte', url: `${L}musik.html?tv=1&mockerror=auth`, ready: '.spel-message' },
      { name: 'Fel: Jellyfin svarar inte', url: `${L}musik.html?tv=1&mockerror=down`, ready: '.spel-message' },
    ] },
    { group: 'Film & serier', items: [
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
      { name: 'Fel: Jellyfin svarar inte', url: `${L}film.html?tv=1&mockerror=down`, ready: '.spel-message' },
    ] },
    { group: 'Övrigt', items: [
      { name: 'Radio', url: `${L}radio.html?channel=132&name=P1`, wait: 2000, note: 'Hämtar tablån från Sveriges Radio på riktigt.' },
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
    const h = document.createElement('h2');
    h.textContent = g.group;
    sec.appendChild(h);
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
      c.textContent = u.pathname.split('/').pop() + u.search + u.hash;
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
      stage.style.cssText = 'position:absolute;inset:0';
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
