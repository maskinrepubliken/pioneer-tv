// The catalogue of every view (dev/katalog.html). Each entry opens one of
// the box's own pages in a 1280x720 frame and puts it in one of its states
// through the page's own code (its PioneerTV object), with the stand-in data
// from dev/mock.py behind it. To add a view: an entry in VIEWS below.
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = '/ext/launcher/';

  // ------------------------------------------------------------ helpers
  // Waits for a selector in the frame's document, or for a test of it to
  // come true.
  async function waitFor(doc, ready, ms = 6000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const found = typeof ready === 'function' ? ready(doc) : doc.querySelector(ready);
      if (found) return found;
      await sleep(50);
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

  // The main menu, and a submenu of it (by its label).
  const mainMenu = (P) => { daemonUp(P); P.hud.menu.open(P.mainMenu.spec()); };
  const submenu = (label) => ({ P }) => {
    mainMenu(P);
    const m = P.hud.menu;
    m.index = m.items.findIndex((it) => it.label === label);
    m.activate();
  };

  // ------------------------------------------------------------ the views
  // Two parts: the shared components (each once, with its variants, drawn by
  // whichever host shows it on the box) and the pages. A group has files
  // (where its code is), used (where it shows) and items; an item has name,
  // url (in the frame), under (a page behind a transparent overlay), ready (a
  // selector to wait for), setup (puts the page in its state), note, zoom.
  const OVERLAY = '/ext/overlay/index.html';
  const HOME = `${L}index.html?tv=1`;
  const SPEL = `${L}browse.html?library=spel&tv=1`;
  const MUSIK = `${L}browse.html?library=musik&tv=1`;
  const FILM = `${L}browse.html?library=film&tv=1`;
  const GAME = `${L}game.html?rom=101`;
  // A song playing, muted (the catalogue makes no sound).
  const playSong = async ({ doc }) => { doc.querySelector('.row').click(); doc.getElementById('audio').muted = true; await sleep(500); };
  const GAME_PICTURE = '/romm/assets/cover/101.svg';
  const FILM_PICTURE = '/jellyfin/Items/serie1-s1e3/Images/Primary?tag=p';
  const LONG = 600000;
  // zoom: the part of the screen a small view shows, [x, y, width] of 1280x720.
  const TOAST_CORNER = [560, 0, 720];
  // A toast as the box shows it: drawn by the overlay over whatever is on
  // screen. Small, it is drawn here with the overlay's own toast.js and
  // toast.css (no frame, so the whole group shows at once); large, in the
  // overlay itself.
  const toast = (text, icon, note) => ({
    name: text, under: HOME, url: OVERLAY, note, zoom: TOAST_CORNER,
    setup: ({ P }) => P.hud.toast(text, icon, LONG),
    draw: (stage) => {
      const card = window.PioneerTV.toastCard(text, icon);
      card.classList.add('pioneertv-toast-show');
      stage.appendChild(card);
    },
  });
  const VIEWS = [
    { part: 'Komponenter', group: 'Notis', files: 'overlay/toast.js · overlay/toast.css · overlay/hud.js (hud.toast)',
      used: 'Över allt på skärmen, ritad av overlayn. Sidorna skickar sina dit (content/hud.js), inställningssidan via /api/toast och daemonen med händelsen toast.',
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
        toast('Sparat', '', 'settings.js · Spara'),
        toast('Ansluten till Småhusbyn', '', 'settings.js · Wi-Fi'),
        toast('Misslyckades: nätverket svarar inte', '', 'settings.js · ett fel'),
      ] },
    { part: 'Komponenter', group: 'Huvudmenyn', files: 'overlay/main-menu.js · overlay/hud.js (hud.menu) · overlay/overlay.css (.pioneertv-menu)',
      used: 'Hem öppnar den över allt; håll Hem går till klockan och öppnar den. En knapp på hemsidan öppnar den också. B tar ett steg tillbaka.',
      items: [
        { name: 'Över hemsidan', under: HOME, url: OVERLAY, setup: ({ P }) => mainMenu(P) },
        { name: 'Över en sida', under: FILM, url: OVERLAY, setup: ({ P }) => mainMenu(P) },
        { name: 'Live', under: HOME, url: OVERLAY, setup: submenu('Live') },
        { name: 'Sök: tangentbordet', under: HOME, url: OVERLAY, setup: submenu('Sök') },
        { name: 'Sök: var', under: HOME, url: OVERLAY,
          setup: ({ P, doc }) => { submenu('Sök')({ P }); const f = doc.querySelector('.pioneertv-search-field input'); f.value = 'mario'; P.keyboard.done(); } },
        { name: 'Inställningar', under: HOME, url: OVERLAY, setup: submenu('Inställningar'), note: 'Varje rad öppnar sin flik på inställningssidan; boxens status längst ner.' },
      ] },
    { part: 'Komponenter', group: 'Pausmenyer', files: 'overlay/overlay.js · overlay/hud.js (hud.menu)',
      used: 'Hem i ett spel (RetroArch) eller en film (mpv): samma kort som huvudmenyn.',
      items: [
        { name: 'Spelets pausmeny', under: GAME_PICTURE, url: OVERLAY,
          setup: ({ P }) => P.bridge.emit('games', { state: 'held', title: 'Tetris & Dr. Mario', point: Date.now() / 1000 - 3600, players: ['Rosa handkontroll', 'Grön handkontroll'] }) },
        { name: 'Spelets pausmeny, inget sparat läge', under: GAME_PICTURE, url: OVERLAY,
          setup: ({ P }) => P.bridge.emit('games', { state: 'held', title: 'Super Mario World', point: null, players: ['Rosa handkontroll'] }) },
        { name: 'Filmens pausmeny', under: FILM_PICTURE, url: OVERLAY,
          setup: ({ P }) => P.bridge.emit('video', { state: 'held', title: 'Avsnitt 3',
            audio: [{ id: 1, label: 'Engelska', selected: true }, { id: 2, label: 'Svenska · Kommentar' }],
            subtitles: [{ id: 1, label: 'Svenska' }, { id: 2, label: 'Engelska' }] }) },
      ] },
    { part: 'Komponenter', group: 'Skärmsläckaren', files: 'overlay/saver.js · overlay/saver.css · overlay/mandelbrot.js · overlay/tao.js · daemon idle.py',
      used: 'Över allt, ritad av overlayn, när ingen handkontroll är ansluten och inget spelas. En handkontroll som slås på tar bort den.',
      items: [
        { name: 'Elden och ett citat', under: HOME, url: OVERLAY, setup: ({ P }) => P.saver.show(),
          note: 'Som en öppen eld: glöd i rost och ockra, starkast nertill, som fladdrar och dallrar uppåt. En zoom tar en kvart. Ett nytt citat, så stort som skärmen tar, var tredje minut.' },
        { name: 'Djupt inne', under: HOME, url: OVERLAY, setup: ({ P }) => { P.saver.show(); P.saver.jump(0.5); },
          note: 'Nära det djupaste av en zoom.' },
        { name: 'Vilar (TV:n av)', under: HOME, url: OVERLAY, setup: ({ P }) => { P.saver.show(); P.saver.rest(true); },
          note: 'Skärmsläckaren på i 5 min, eller TV:n av med sin fjärrkontroll: TV:n av, och bara Vilar, stilla, tills TV:n är på igen.' },
      ] },
    { part: 'Komponenter', group: 'Skärmtangentbordet', files: 'content/keyboard.js', used: 'Y på alla sidor, i sidans textfält; Sök i huvudmenyn (i overlayn).',
      items: [
        { name: 'På en sida', url: FILM, ready: '.card', setup: ({ P, doc }) => P.keyboard.open(doc.getElementById('search')) },
      ] },
    { part: 'Komponenter', group: 'Loggar', files: 'content/logs.js', used: 'Inställningar → System.',
      items: [
        { name: 'Loggar', url: FILM, ready: '.card', setup: ({ P }) => P.logs.open(0) },
      ] },
    { part: 'Komponenter', group: 'Pekaren', files: 'content/cursor.js', used: 'Högra spaken, på alla sidor.',
      items: [
        { name: 'Pekaren på en sida', url: FILM, ready: '.card',
          setup: ({ P }) => { for (let i = 0; i < 12; i++) P.bridge.emit('pointer', { dx: 14, dy: 7 }); } },
      ] },
    { part: 'Komponenter', group: 'Vyns meddelanden', files: 'launcher/shared/views.js (M.views) · launcher/shared/base.css (.view-message)',
      used: 'Bläddringssidan, för alla bibliotek: samma ord och samma ruta, för RomM och Jellyfin.',
      items: [
        { name: 'Laddar…', url: SPEL, ready: '.card', setup: ({ doc, P }) => P.views.loading(doc.getElementById('view')),
          note: 'Visas tills källan svarat.' },
        { name: 'Ingen API-nyckel (RomM)', url: `${SPEL}&mockerror=no_key`, ready: '.view-message' },
        { name: 'Nyckeln godtas inte (Jellyfin)', url: `${MUSIK}&mockerror=auth`, ready: '.view-message' },
        { name: 'Källan svarar inte (Jellyfin)', url: `${FILM}&mockerror=down`, ready: '.view-message', note: 'Försöker igen två gånger först, några sekunder.' },
      ] },
    { part: 'Komponenter', group: 'Helskärmsmeddelande', files: 'launcher/shared/screen.js (M.screen) · launcher/shared/screen.css (.pioneertv-screen)',
      used: 'Allt som tar hela skärmen för en mening: spelet på väg (game/game.js), filmen (players/video.js) och skärmsläckaren när boxen vilar (overlay/saver.js). Samma design överallt.',
      items: [
        { name: 'Spelet laddas', url: GAME, ready: '.pioneertv-screen',
          setup: ({ P }) => P.bridge.emit('games', { state: 'loading', got: 12.4e6, total: 31.5e6 }) },
        { name: 'Spelet startar', url: GAME, ready: '.pioneertv-screen', setup: ({ P }) => P.bridge.emit('games', { state: 'running' }),
          note: 'Står kvar under RetroArchs fönster tills spelet täcker skärmen.' },
        { name: 'Filmen startar', url: `${FILM}#/item/film1`, ready: '.knapp.primar',
          setup: ({ P }) => { P.players.video.state = 'starting'; P.players.video.show('Startar…', 'Fyren'); }, note: 'Står kvar under mpv:s fönster tills filmen täcker skärmen.' },
        { name: 'Filmen är slut', url: `${FILM}#/item/film1`, ready: '.knapp.primar',
          setup: ({ P }) => { P.players.video.state = 'running'; P.bridge.emit('video', { state: 'ended' }); } },
        { name: 'Spelet kunde inte startas', url: GAME, ready: '.pioneertv-screen',
          setup: ({ P }) => P.bridge.emit('games', { state: 'error', message: 'Spelet kunde inte startas: core not found' }) },
        { name: 'Videon kunde inte spelas', url: `${FILM}#/item/film1`, ready: '.knapp.primar',
          setup: ({ P }) => P.players.video.failed('Videon kunde inte spelas') },
        { name: 'Vilar', under: HOME, url: OVERLAY, setup: ({ P }) => { P.saver.show(); P.saver.rest(true); } },
      ] },
    { part: 'Komponenter', group: 'Spelas nu', files: 'launcher/players/audio.js · launcher/players/audio.css',
      used: 'Musik: en låt spelar i sidan; Spelas nu täcker den, och i rubriken medan man bläddrar.',
      items: [
        { name: 'Spelas nu', url: `${MUSIK}#/album/album1`, ready: '.row', setup: playSong },
        { name: 'I rubriken medan man bläddrar', url: `${MUSIK}#/album/album1`, ready: '.row',
          setup: async (ctx) => { await playSong(ctx); ctx.P.players.audio.nowPlaying.close(); } },
      ] },

    { part: 'Sidor', group: 'Hem', files: 'launcher/index.html · home/home.js · home/home.css · shared/tiles.js · shared/tiles.css · shared/services.js',
      used: 'Håll Hem. Tjänsterna som rutor; Live, Sök och Inställningar öppnas som paneler i overlayn. Samma rutor som huvudmenyn.',
      items: [
        { name: 'Hem', url: HOME, ready: '.tiles-tile', setup: ({ P }) => daemonUp(P) },
      ] },
    { part: 'Sidor', group: 'Bläddra: hylla', files: 'launcher/browse.html · browse/page.js · browse/shelf.js · browse/cards.js · libraries/*.js',
      used: 'Ett biblioteks början, en artist, ett filmbibliotek, en mapp, sök: sektioner med rader, rutnät och kort, för alla bibliotek.',
      items: [
        { name: 'Spel: senast spelade, konsoler, samlingar', url: SPEL, ready: '.card' },
        { name: 'Musik: blanda allt, album, artister, spellistor', url: MUSIK, ready: '.card' },
        { name: 'Musik: en artist', url: `${MUSIK}#/artist/artist2`, ready: '.card' },
        { name: 'Musik: sök', url: `${MUSIK}#/search/kom`, ready: '.card, .row' },
        { name: 'Film: fortsätt titta och alla filmer', url: FILM, ready: '.card' },
        { name: 'Film: serier', url: `${FILM}#/lib/lib-serier`, ready: '.card' },
        { name: 'Film: hemvideor, mappar och klipp', url: `${FILM}#/lib/lib-hem`, ready: '.card' },
        { name: 'Film: en mapp', url: `${FILM}#/folder/mapp1`, ready: '.card' },
        { name: 'Film: sök', url: `${FILM}#/search/s`, ready: '.card' },
      ] },
    { part: 'Sidor', group: 'Bläddra: rutnät', files: 'launcher/browse.html · browse/grid.js · browse/cards.js · libraries/*.js',
      used: 'Långa samlingar: bara raderna runt fokus i sidan, L1/R1 hoppar en bokstav, sökfältet filtrerar. Infopanelen när biblioteket har en.',
      items: [
        { name: 'Spel: en konsol', url: `${SPEL}#/platform/1`, ready: '.grid .card' },
        { name: 'Spel: en samling', url: `${SPEL}#/collection/own/1`, ready: '.grid .card' },
        { name: 'Spel: sök', url: `${SPEL}#/search/mario`, ready: '.grid .card' },
        { name: 'Musik: album', url: `${MUSIK}#/albums`, ready: '.grid .card' },
        { name: 'Musik: artister', url: `${MUSIK}#/artists`, ready: '.grid .card' },
      ] },
    { part: 'Sidor', group: 'Bläddra: detalj', files: 'launcher/browse.html · browse/detail.js · browse/cards.js · libraries/*.js',
      used: 'En sak: bilden till vänster, namn, text, knappar, val, flikar och en lista bredvid.',
      items: [
        { name: 'Film: en film', url: `${FILM}#/item/film1`, ready: '.knapp.primar' },
        { name: 'Film: ett avsnitt, påbörjat', url: `${FILM}#/item/serie1-s1e3`, ready: '.knapp.primar' },
        { name: 'Film: ett klipp (inga undertexter)', url: `${FILM}#/item/klipp1`, ready: '.knapp.primar' },
        { name: 'Film: en serie, säsonger och avsnitt', url: `${FILM}#/series/serie1`, ready: '.row' },
        { name: 'Musik: ett album', url: `${MUSIK}#/album/album1`, ready: '.row' },
        { name: 'Musik: en spellista', url: `${MUSIK}#/playlist/lista1`, ready: '.row' },
      ] },
    { part: 'Sidor', group: 'Spela ett spel', files: 'launcher/game.html · game/game.js · game/game.css', used: 'Innan RetroArchs fönster täcker skärmen.',
      items: [
        { name: 'Laddar (innan spelet hämtats)', url: GAME, ready: '.pioneertv-screen' },
      ] },
    { part: 'Sidor', group: 'Radio', files: 'launcher/radio.html · radio/radio.js · radio/radio.css', used: 'Huvudmenyn → Live → P1–P4.',
      items: [
        { name: 'Radio', url: `${L}radio.html?channel=132&name=P1`, ready: (doc) => doc.getElementById('now-title').textContent !== '…', note: 'Hämtar tablån från Sveriges Radio på riktigt.' },
      ] },
    { part: 'Sidor', group: 'Inställningar', files: 'daemon/pioneertv/web/settings.html · settings.js', used: 'Huvudmenyn → Inställningar → en flik.',
      items: [
        { name: 'Inställningar', url: '/static/settings.html?mock=1', ready: '.card', note: 'Med inställningssidans egen exempeldata.' },
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
    style.textContent = '.card { content-visibility: visible !important; }';
    doc.head.appendChild(style);
    if (entry.ready) await waitFor(doc, entry.ready);
    await sleep(60);
    if (entry.setup) {
      try {
        await entry.setup({ win, doc, P: win.PioneerTV });
      } catch (err) {
        console.error(entry.name, err);
      }
    }
    return frame;
  }

  // A small view that draws itself here (a toast), on the ink of the home
  // page, in the same 1280x720 canvas as the frames.
  function drawHere(entry, stage) {
    const canvas = document.createElement('div');
    canvas.className = 'drawn';
    entry.draw(canvas);
    stage.appendChild(canvas);
  }

  // ------------------------------------------------------------ the index
  // #grupp=<name> shows one group (its views are the only ones drawn),
  // #vy=<id> one view large; both together keep the group behind the view.
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/^-|-$/g, '');
  const parse = () => Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map((p) => p.split('=').map(decodeURIComponent)));
  const hashOf = (o) => '#' + Object.entries(o).filter(([, v]) => v).map(([key, v]) => `${key}=${encodeURIComponent(v)}`).join('&');
  const sections = document.getElementById('sections');
  const toc = document.getElementById('toc');
  const all = [];
  const parts = {};
  const allLink = document.createElement('a');
  allLink.href = '#';
  allLink.textContent = 'Alla';
  allLink.className = 'toc-all';
  toc.appendChild(allLink);
  VIEWS.forEach((g, gi) => {
    g.slug = slug(g.group);
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = `g${gi}`;
    if (g.part !== (VIEWS[gi - 1] || {}).part) {
      const p = document.createElement('h2');
      p.className = 'part';
      p.textContent = g.part;
      sections.appendChild(p);
      parts[g.part] = p;
      const t = document.createElement('span');
      t.className = 'toc-part';
      t.textContent = g.part;
      toc.appendChild(t);
    }
    g.section = sec;
    const h = document.createElement('h3');
    h.textContent = g.group;
    sec.appendChild(h);
    const meta = document.createElement('dl');
    meta.className = 'meta';
    for (const [key, v] of [['Kod', g.files], ['Används', g.used]]) {
      if (!v) continue;
      const dt = document.createElement('dt'); dt.textContent = key;
      const dd = document.createElement('dd'); dd.textContent = v;
      meta.append(dt, dd);
    }
    sec.appendChild(meta);
    const a = document.createElement('a');
    a.href = hashOf({ grupp: g.slug });
    a.textContent = g.group;
    a.dataset.grupp = g.slug;
    toc.appendChild(a);
    const grid = document.createElement('div');
    grid.className = 'grid';
    g.items.forEach((entry, ii) => {
      entry.id = `${gi}-${ii}`;
      entry.group = g.group;
      all.push(entry);
      const card = document.createElement('a');
      card.className = 'card';
      card.href = hashOf({ vy: entry.id });
      card.addEventListener('click', (e) => { e.preventDefault(); location.hash = hashOf({ grupp: parse().grupp, vy: entry.id }); });
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

  function showGroup(name) {
    const g = VIEWS.find((x) => x.slug === name);
    VIEWS.forEach((x) => { x.section.hidden = !!g && x !== g; });
    for (const [part, h] of Object.entries(parts)) h.hidden = !!g && g.part !== part;
    toc.querySelectorAll('a').forEach((a) => a.classList.toggle('on', g ? a.dataset.grupp === name : a === allLink));
    if (g) window.scrollTo(0, 0);
  }

  // Small views are drawn when they come near the screen, a few at a time,
  // and drawn again after a save (version) when they are or come in sight.
  let version = 0;
  const near = new Set();
  const queue = [];
  let running = 0;
  function want(entry) {
    if (entry.drawn === version || entry.busy || queue.includes(entry)) return;
    queue.push(entry);
    pump();
  }
  function pump() {
    while (running < 6 && queue.length) {
      const entry = queue.shift();
      running++;
      entry.busy = true;
      const drawing = version;
      const stage = document.createElement('div');
      stage.className = 'small';
      stage.style.cssText = 'position:absolute;inset:0;transform-origin:0 0';
      if (entry.zoom) {
        const [x, y, w] = entry.zoom;
        stage.style.transform = `scale(${1280 / w}) translate(${-x * 0.3}px, ${-y * 0.3}px)`;
      }
      // Under the one it replaces, which stays until this one is drawn.
      entry.thumb.insertBefore(stage, entry.thumb.firstChild);
      const done = entry.draw ? Promise.resolve(drawHere(entry, stage)) : load(entry, stage);
      done.finally(() => {
        running--;
        entry.busy = false;
        entry.drawn = drawing;
        entry.thumb.querySelectorAll('.small').forEach((s) => { if (s !== stage) s.remove(); });
        const w = entry.thumb.querySelector('.wait');
        if (w) w.remove();
        if (drawing !== version && near.has(entry)) want(entry);
        pump();
      });
    }
  }
  const byThumb = new Map(all.map((e) => [e.thumb, e]));
  const seen = new IntersectionObserver((list) => {
    for (const it of list) {
      const entry = byThumb.get(it.target);
      if (it.isIntersecting) { near.add(entry); want(entry); }
      else near.delete(entry);
    }
  }, { rootMargin: '400px' });
  all.forEach((e) => seen.observe(e.thumb));
  // Those drawn here cost nothing: all of them at once.
  const drawAll = () => all.filter((e) => e.draw).forEach(want);
  drawAll();

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
    const stage = document.createElement('div');
    stage.className = 'stage';
    // The view drawn before stays on top until this one is ready.
    bigStage.insertBefore(stage, bigStage.firstChild);
    fit();
    const frame = await load(entry, stage);
    if (current !== entry || !stage.isConnected) return;
    bigStage.querySelectorAll('.stage').forEach((s) => { if (s !== stage) s.remove(); });
    // The keyboard goes to the view: its own focused element, inside the frame.
    frame.contentWindow.focus();
    const P = frame.contentWindow.PioneerTV;
    const inner = (P && P.nav && P.nav.current) || frame.contentDocument.body;
    try { inner.focus({ preventScroll: true }); } catch {}
    stage.addEventListener('mousedown', () => frame.contentWindow.focus());
  }
  function route() {
    const h = parse();
    showGroup(h.grupp);
    const entry = h.vy && all.find((e) => e.id === h.vy);
    if (entry) { if (entry !== current) { bigStage.innerHTML = ''; openBig(entry); } }
    else { big.hidden = true; bigStage.innerHTML = ''; current = null; }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', fit);
  document.getElementById('big-close').addEventListener('click', () => { location.hash = hashOf({ grupp: parse().grupp }); });
  document.getElementById('big-again').addEventListener('click', () => current && openBig(current));
  route();

  // ------------------------------------------------------------ a save redraws
  // The preview server says when a file under extension/, the settings
  // page or dev/ last changed (/__changes). The views in sight, and the one
  // open large, are drawn again; the rest when they come into sight. A
  // change to the catalogue itself reloads it.
  let last = null;
  async function watch() {
    let now;
    try {
      const r = await fetch('/__changes', { cache: 'no-store' });
      if (!r.ok) return;                   // an older server: no watching
      now = await r.json();
    } catch {
      setTimeout(watch, 3000);             // the server restarting
      return;
    }
    if (last && now.t !== last.t) {
      if (/^dev\/katalog\./.test(now.path)) { location.reload(); return; }
      version++;
      near.forEach(want);
      drawAll();
      if (current) openBig(current);
      const note = document.getElementById('changed');
      note.textContent = `Ritar om · ${now.path}`;
      note.hidden = false;
      clearTimeout(watch.hide);
      watch.hide = setTimeout(() => { note.hidden = true; }, 2500);
    }
    last = now;
    setTimeout(watch, 1000);
  }
  watch();
})();
