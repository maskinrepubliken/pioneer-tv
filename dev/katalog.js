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

  // The quick menu, and a panel the home page opens (live, search).
  const quickMenu = (P) => { daemonUp(P); P.hud.menu.open(P.mainMenu.spec()); };
  const panel = (name) => ({ P }) => { daemonUp(P); P.mainMenu.panel(name); };

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
  const FILM = `${L}browse.html?library=film&section=movies&tv=1`;
  const SERIER = `${L}browse.html?library=film&section=tvshows&tv=1`;
  const VIDEOR = `${L}browse.html?library=film&section=homevideos&tv=1`;
  const GAME = `${L}game.html?rom=101`;
  // A song playing, muted (the catalogue makes no sound).
  // A grid filtered as Y and the keyboard would: the words in the search field.
  const filterGrid = (words) => ({ doc }) => {
    const f = doc.getElementById('search');
    f.value = words;
    f.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // The browse page's column at the left, opened on where the page is.
  const railOpen = ({ P, doc }) => { doc.getElementById('rail').classList.add('open'); P.nav.focus(doc.querySelector('.rail-item.aktiv .rail-mark')); };
  const playSong = async ({ doc }) => { doc.querySelector('.row').click(); doc.getElementById('audio').muted = true; await sleep(500); };
  const GAME_PICTURE = '/romm/assets/cover/101.svg';
  // A site's video, as content/webvideo.js says it is.
  const WEBVIDEO = { frame: 'f1', top: true, present: true, title: 'Rapport 19.30', area: 1, time: 754, duration: 1800, end: 1800,
    live: false, paused: true, subs: [{ id: 0, label: 'Svenska', selected: true }, { id: 1, label: 'Svenska (textning)' }] };
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
    { part: 'Komponenter', group: 'Menyer i overlayn', files: 'overlay/hud.js (hud.menu) · overlay/overlay.css (.pioneertv-menu) · overlay/main-menu.js (snabbmenyn) · overlay/overlay.js (pausmenyerna) · content/webvideo.js (en sajts video)',
      used: 'Ett och samma kort över allt. Hem öppnar snabbmenyn (håll Hem går till hemsidan); i ett spel (RetroArch), en film (mpv) eller över en video på en sajt (SVT Play, Cineasterna) är det en pausmeny. Hemsidans Live och Sök är paneler på samma kort. B tar ett steg tillbaka.',
      items: [
        { name: 'Snabbmenyn över hemsidan', under: HOME, url: OVERLAY, setup: ({ P }) => quickMenu(P) },
        { name: 'Snabbmenyn över en sida', under: FILM, url: OVERLAY, setup: ({ P }) => quickMenu(P) },
        { name: 'Live', under: HOME, url: OVERLAY, setup: panel('live') },
        { name: 'Sök: tangentbordet', under: HOME, url: OVERLAY, setup: panel('search') },
        { name: 'Sök: var', under: HOME, url: OVERLAY,
          setup: ({ P, doc }) => { panel('search')({ P }); const f = doc.querySelector('.pioneertv-search-field input'); f.value = 'mario'; P.keyboard.done(); } },
        { name: 'Spelets pausmeny', under: GAME_PICTURE, url: OVERLAY,
          setup: ({ P }) => P.bridge.emit('games', { state: 'held', title: 'Tetris & Dr. Mario', point: Date.now() / 1000 - 3600, players: ['Rosa handkontroll', 'Grön handkontroll'] }) },
        { name: 'Spelets pausmeny, inget sparat läge', under: GAME_PICTURE, url: OVERLAY,
          setup: ({ P }) => P.bridge.emit('games', { state: 'held', title: 'Super Mario World', point: null, players: ['Rosa handkontroll'] }) },
        { name: 'Filmens pausmeny', under: FILM_PICTURE, url: OVERLAY,
          setup: ({ P }) => P.bridge.emit('video', { state: 'held', title: 'Avsnitt 3',
            audio: [{ id: 1, label: 'Engelska', selected: true }, { id: 2, label: 'Svenska · Kommentar' }],
            subtitles: [{ id: 1, label: 'Svenska' }, { id: 2, label: 'Engelska' }] }) },
        { name: 'En sajts video (SVT Play, Cineasterna)', under: FILM_PICTURE, url: OVERLAY,
          setup: ({ P }) => { P.bridge.emit('webvideo', WEBVIDEO); P.bridge.emit('menu', {}); },
          note: 'Hem över en video på en sajt (content/webvideo.js): spola med ◀ ▶, 10 s ett tryck, 30 s hållet. I fullskärm spolar ◀ ▶ och A pausar utan panelen.' },
        { name: 'En sajts direktsändning', under: FILM_PICTURE, url: OVERLAY,
          setup: ({ P }) => { P.bridge.emit('webvideo', { ...WEBVIDEO, live: true, duration: null, time: 3500, end: 3620, subs: [], title: 'SVT1' }); P.bridge.emit('menu', {}); } },
      ] },
    { part: 'Komponenter', group: 'Skärmsläckaren', files: 'overlay/saver.js · overlay/saver.css · overlay/maze.js · overlay/maze/textures.png · overlay/mandelbrot.js · overlay/tao.js · daemon idle.py · daemon covers.py (finds)',
      used: 'Över allt, ritad av overlayn, när ingen handkontroll är ansluten och inget spelas. En handkontroll som slås på tar bort den. Labyrint (standard) eller Eld, under Inställningar → TV. När boxen vilar blir den ett helskärmsmeddelande (Vilar, där).',
      items: [
        { name: 'Labyrinten', under: HOME, url: OVERLAY, setup: ({ P }) => { P.saver.as('labyrint'); P.saver.show(); },
          note: 'Standard. En labyrint utan slut i Ultima-stil som vandras av sig själv; omslagen som finns på boxen ligger där och plockas upp, med namn.' },
        { name: 'Labyrinten, ett fynd', under: HOME, url: OVERLAY, setup: async ({ P }) => { P.saver.as('labyrint'); P.saver.show(); await new Promise((r) => setTimeout(r, 9000)); } },
        { name: 'Elden och ett citat', under: HOME, url: OVERLAY, setup: ({ P }) => { P.saver.as('eld'); P.saver.show(); },
          note: 'Som en öppen eld: glöd i rost och ockra, starkast nertill, som fladdrar och dallrar uppåt. En zoom tar en kvart. Ett nytt citat, så stort som skärmen tar, var tredje minut.' },
        { name: 'Djupt inne', under: HOME, url: OVERLAY, setup: ({ P }) => { P.saver.as('eld'); P.saver.show(); P.saver.jump(0.5); },
          note: 'Nära det djupaste av en zoom.' },
      ] },
    { part: 'Komponenter', group: 'Skärmtangentbordet', files: 'content/keyboard.js', used: 'Y på alla sidor, i sidans textfält eller bakom den runda sökknappen; Sök i overlayn.',
      items: [
        { name: 'På en sida', url: FILM, ready: '.card', setup: ({ P, doc }) => P.keyboard.open(doc.getElementById('search')) },
      ] },
    { part: 'Komponenter', group: 'Pekaren', files: 'content/cursor.js', used: 'Högra spaken, på alla sidor.',
      items: [
        { name: 'Pekaren på en sida', url: FILM, ready: '.card',
          setup: ({ P }) => { for (let i = 0; i < 12; i++) P.bridge.emit('pointer', { dx: 14, dy: 7 }); } },
      ] },
    { part: 'Komponenter', group: 'Helskärmsmeddelande', files: 'launcher/shared/screen.js (M.screen) · launcher/shared/screen.css (.pioneertv-screen) · launcher/shared/views.js (message, loading, error) · launcher/game.html · game/game.js (spela ett spel)',
      used: 'Allt som tar hela skärmen för en mening: bläddringssidans vy som laddar eller inte når sin källa (samma ord för RomM och Jellyfin; X försöker igen, B tillbaka), att spela ett spel (game.html, hela den sidan är ett sådant, tills RetroArchs fönster täcker skärmen), filmen (players/video.js) och skärmsläckaren när boxen vilar (overlay/saver.js). Samma design överallt.',
      items: [
        { name: 'Laddar…', url: SPEL, ready: '.card', setup: ({ doc, P }) => P.views.loading(doc.getElementById('view')),
          note: 'Bläddringssidan, tills källan svarat (om det tar mer än en kort stund).' },
        { name: 'Ingen API-nyckel (RomM)', url: `${SPEL}&mockerror=no_key`, ready: '.pioneertv-screen:not([hidden])' },
        { name: 'Nyckeln godtas inte (Jellyfin)', url: `${MUSIK}&mockerror=auth`, ready: '.pioneertv-screen:not([hidden])' },
        { name: 'Källan svarar inte (Jellyfin)', url: `${FILM}&mockerror=down`, ready: '.pioneertv-screen:not([hidden])', note: 'Försöker igen två gånger först, några sekunder.' },
        { name: 'Spelet hämtas', url: GAME, ready: '.pioneertv-screen', note: 'Spela ett spel: innan RomM svarat.' },
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
        { name: 'Vilar (TV:n av)', under: HOME, url: OVERLAY, setup: ({ P }) => { P.saver.show(); P.saver.rest(true); },
          note: 'Skärmsläckaren på i 5 min, eller TV:n av med sin fjärrkontroll: TV:n av, och bara Vilar, stilla, tills TV:n är på igen.' },
      ] },
    { part: 'Komponenter', group: 'Vänsterkolumnen', files: 'launcher/browse/rail.js · browse/rail.css · libraries/*.js (rail)',
      used: 'Bläddringssidan, för alla bibliotek: Sök och bibliotekets vägar in, med ikon eller initial. Utfälld med namnen när fokus är där, eller pekaren rör sig över den.',
      items: [
        { name: 'I vila (Spel, en konsol)', url: `${SPEL}#/platform/2`, ready: '.rail-mark', note: 'Bara ikonerna och initialerna; den man är i i bläck.' },
        { name: 'Utfälld: Spel', url: SPEL, ready: '.rail-mark', setup: railOpen, note: 'Senast spelade, Samlingar, och konsolerna med sin handkontroll.' },
        { name: 'Utfälld: Musik', url: MUSIK, ready: '.rail-mark', setup: railOpen },
        { name: 'Utfälld: Film', url: FILM, ready: '.rail-mark', setup: railOpen, note: 'Upptäck, Alla filmer, Samlingar (när Jellyfin har några) och genrerna, var och en med sin ikon.' },
        { name: 'Utfälld: Serier', url: SERIER, ready: '.rail-mark', setup: railOpen },
        { name: 'Utfälld: Videor', url: VIDEOR, ready: '.rail-mark', setup: railOpen, note: 'Upptäck och Kanaler.' },
      ] },
    { part: 'Komponenter', group: 'Spelas nu', files: 'launcher/players/audio.js · launcher/players/audio.css',
      used: 'Musik: en låt spelar i sidan; Spelas nu täcker den, och i rubriken medan man bläddrar.',
      items: [
        { name: 'Spelas nu', url: `${MUSIK}#/album/album1`, ready: '.row', setup: playSong },
        { name: 'I rubriken medan man bläddrar', url: `${MUSIK}#/album/album1`, ready: '.row',
          setup: async (ctx) => { await playSong(ctx); ctx.P.players.audio.nowPlaying.close(); } },
      ] },

    { part: 'Komponenter', group: 'Omslag som saknas', files: 'launcher/shared/mockups.js (M.mockups) · launcher/shared/views.js (cover, mock) · libraries/*.js (mock)',
      used: 'Där ett spel, ett album eller en film saknar omslag: en tom förpackning av sitt slag med namnet på, ritad här. Spelen får sin konsols egen låda, så lik originalet som det går (NES, SNES, N64, Mega Drive, Master System, PC, Game Boy, GBC, GBA, DS, PlayStation 1 och 2, Saturn, Dreamcast, Neo Geo, arkad); album en skiva i sitt omslag, filmer ett fodral, avsnitt och klipp en filmruta.',
      items: [
        { name: 'Alla sorter', url: '/dev/mockups.html', ready: 'figure', note: 'dev/mockups.html: varje låda, fodral och omslag sida vid sida.' },
        { name: 'NES', url: `${SPEL}#/platform/4`, ready: '.grid .card', note: 'Det tredje spelet på varje konsol saknar omslag i exempeldatan.' },
        { name: 'SNES', url: `${SPEL}#/platform/1`, ready: '.grid .card', setup: ({ P }) => P.grid.active.focusIndex(5) },
        { name: 'Nintendo 64', url: `${SPEL}#/platform/2`, ready: '.grid .card' },
        { name: 'Mega Drive', url: `${SPEL}#/platform/3`, ready: '.grid .card' },
        { name: 'PC (DOS)', url: `${SPEL}#/platform/5`, ready: '.grid .card' },
        { name: 'Game Boy Advance', url: `${SPEL}#/platform/6`, ready: '.grid .card' },
        { name: 'PlayStation', url: `${SPEL}#/platform/7`, ready: '.grid .card' },
        { name: 'Arkad', url: `${SPEL}#/platform/8`, ready: '.grid .card' },
        { name: 'Album', url: `${MUSIK}#/albums`, ready: '.grid .card' },
        { name: 'Ett album utan omslag', url: `${MUSIK}#/album/album3`, ready: '.row' },
        { name: 'Filmer', url: FILM, ready: '.card' },
        { name: 'Videor', url: VIDEOR, ready: '.card' },
        { name: 'En film utan affisch', url: `${FILM}#/item/film3`, ready: '.knapp.primar' },
        { name: 'En serie utan affisch, avsnitt utan bild', url: `${SERIER}#/series/serie2`, ready: '.row' },
      ] },

    { part: 'Sidor', group: 'Hem', files: 'launcher/index.html · home/home.js · home/home.css · shared/tiles.js · shared/tiles.css · shared/services.js',
      used: 'Håll Hem, eller Hem i snabbmenyn. Tjänsterna som rutor; Live och Sök öppnas som paneler i overlayn, Inställningar är en egen sida.',
      items: [
        { name: 'Hem', url: HOME, ready: '.tiles-tile', setup: ({ P }) => daemonUp(P) },
      ] },
    { part: 'Sidor', group: 'Hyllor', files: 'launcher/browse.html · browse/planks.js · browse/planks.css · browse/shelf.js · browse/grid.js · browse/cards.js (card) · libraries/*.js',
      used: 'Bläddringssidan, för alla bibliotek: omslag som står på hyllplan i sin egen form, namnet under planet, hyllorna från kant till kant och inget som skrollar i sidled. Långa samlingar är rutnät: bara raderna runt fokus i sidan, L1/R1 hoppar en bokstav, sök filtrerar, infon under hyllorna.',
      items: [
        { name: 'Spel · Senast spelade', url: SPEL, ready: '.card', note: 'Lådor. X tar bort, en efter en; håll X ångrar.' },
        { name: 'Spel · En konsol', url: `${SPEL}#/platform/1`, ready: '.grid .card', note: 'Rutnät, med det valda spelets info under hyllorna.' },
        { name: 'Spel · En konsol, längre ned', url: `${SPEL}#/platform/1`, ready: '.grid .card', setup: ({ P }) => P.grid.active.focusIndex(9) },
        { name: 'Spel · En samling', url: `${SPEL}#/collection/own/2`, ready: '.grid .card' },
        { name: 'Spel · Sök', url: `${SPEL}#/search/mario`, ready: '.grid .card' },
        { name: 'Spel · Sök utan träffar', url: `${SPEL}#/search/zzz`, ready: '.dusty', note: 'Sökorden som rubrik; inga träffar: en dammig tom hylla med spindelväv under.' },
        { name: 'Spel · En konsol, filtrerad utan träffar', url: `${SPEL}#/platform/1`, ready: '.grid .card', setup: filterGrid('zz'), note: 'Y på en hylla: rubriken SNES: ”zz”, och den dammiga hyllan.' },
        { name: 'Film · Sök utan träffar', url: `${FILM}#/search/zzz`, ready: '.dusty' },
        { name: 'Musik · Album', url: `${MUSIK}#/albums`, ready: '.grid .card', note: 'Kvadrater, i ett rutnät.' },
        { name: 'Musik · Album, filtrerade', url: `${MUSIK}#/albums`, ready: '.grid .card', setup: filterGrid('s'), note: 'Y skriver; rutnätet visar bara det som matchar, medan man skriver.' },
        { name: 'Musik · En artist', url: `${MUSIK}#/artist/artist2`, ready: '.card', note: 'Blanda allt (X) och Spela allt, runda till höger i rubriken, och artistens album på en hylla.' },
        { name: 'Film · Upptäck', url: FILM, ready: '.card', note: 'Hemsidans Film: Fortsätt titta, Senast tillagt och Jellyfins rekommendationer (Eftersom du såg …, Med …).' },
        { name: 'Film · Alla filmer', url: `${FILM}#/all`, ready: '.grid .card', note: 'Rutnät med bokstavshopp och filmens text under hyllorna.' },
        { name: 'Film · En genre', url: `${FILM}#/genre/komedi`, ready: '.grid .card', note: 'Komedi: Jellyfins Comedy och Komedi som en.' },
        { name: 'Film · Samlingar', url: `${FILM}#/collections`, ready: '.grid .card', note: 'Jellyfins samlingar (box sets); syns i kolumnen bara när det finns några.' },
        { name: 'Film · En samling', url: `${FILM}#/folder/samling1`, ready: '.card' },
        { name: 'Serier · Upptäck', url: SERIER, ready: '.card', note: 'Nästa avsnitt, Fortsätt titta, Senast tillagt.' },
        { name: 'Serier · Alla serier', url: `${SERIER}#/all`, ready: '.grid .card' },
        { name: 'Videor · Upptäck', url: VIDEOR, ready: '.card', note: 'Fortsätt titta, Senast tillagt och kanalerna (mapparna).' },
        { name: 'Videor · Kanaler', url: `${VIDEOR}#/channels`, ready: '.card--stack', note: 'Mapparna som Spels samlingar: ett kort var, de senaste klippen i en hög.' },
        { name: 'Videor · En kanal', url: `${VIDEOR}#/folder/kanal2`, ready: '.grid .card', note: 'Klippen i ett rutnät.' },
        { name: 'Film · Sök', url: `${FILM}#/search/s`, ready: '.card', note: 'Bara filmer: sökningen håller sig i sektionen.' },
        { name: 'Serier · Sök', url: `${SERIER}#/search/avsnitt`, ready: '.card' },
      ] },
    { part: 'Sidor', group: 'Kort', files: 'launcher/browse.html · browse/cards.js (stack) · browse/cards.css (.card--stack) · browse/shelf.js · browse/grid.js · libraries/*.js',
      used: 'Bläddringssidan: en helhet som ett kort, dess bild eller de första i en hög, namnet och en rad under. Samlingar, spellistor och artister.',
      items: [
        { name: 'Spel · Samlingar', url: `${SPEL}#/collections`, ready: '.card' },
        { name: 'Spel · Samlingar, medan omslagen kommer', url: `${SPEL}#/collections`, ready: '.card',
          setup: ({ P, doc }) => doc.querySelectorAll('.card--stack').forEach((c) => P.cards.pile(c, null)),
          note: 'Korten kommer direkt, omslagen efter hand (RomM tar en stund per samling).' },
        { name: 'Musik · Blanda allt och spellistor', url: MUSIK, ready: '.card' },
        { name: 'Musik · Artister', url: `${MUSIK}#/artists`, ready: '.grid .card', note: 'Namnen, långa, i tre kolumner (artister har inga bilder): L1/R1 hoppar en bokstav.' },
        { name: 'Musik · Sök', url: `${MUSIK}#/search/kom`, ready: '.card, .row', note: 'Artister som kort, album på en hylla, låtar i en lista.' },
      ] },
    { part: 'Sidor', group: 'Detaljsidor', files: 'launcher/browse.html · browse/detail.js · browse/cards.js (row) · libraries/*.js',
      used: 'Bläddringssidan, en sak: bilden till vänster, namn, text, knappar, val, flikar och en lista bredvid.',
      items: [
        { name: 'Film · En film', url: `${FILM}#/item/film1`, ready: '.knapp.primar' },
        { name: 'Serier · Ett avsnitt, påbörjat', url: `${SERIER}#/item/serie1-s1e3`, ready: '.knapp.primar' },
        { name: 'Videor · Ett klipp, utan undertexter', url: `${VIDEOR}#/item/klipp1`, ready: '.knapp.primar' },
        { name: 'Serier · En serie, säsonger och avsnitt', url: `${SERIER}#/series/serie1`, ready: '.row' },
        { name: 'Musik · Ett album', url: `${MUSIK}#/album/album1`, ready: '.row' },
        { name: 'Musik · En spellista', url: `${MUSIK}#/playlist/lista1`, ready: '.row' },
      ] },
    { part: 'Sidor', group: 'Radio', files: 'launcher/radio.html · radio/radio.js · radio/radio.css', used: 'Hemsidan → Live → P1–P4.',
      items: [
        { name: 'Radio', url: `${L}radio.html?channel=132&name=P1`, ready: (doc) => doc.getElementById('now-title').textContent !== '…', note: 'Hämtar tablån från Sveriges Radio på riktigt.' },
      ] },
    { part: 'Sidor', group: 'Inställningar', files: 'daemon/pioneertv/web/settings.html · settings.js · settings.css', used: 'Snabbmenyn eller hemsidan → Inställningar.',
      items: [
        { name: 'Inställningar', url: '/static/settings.html?mock=1', ready: '.card', note: 'Med inställningssidans egen exempeldata.' },
        { name: 'Loggar', url: '/static/settings.html?mock=1#logs', ready: 'pre.log-full', note: 'En flik på inställningssidan: en knapp per tjänst; daemonens och CEC:s logg uppdateras medan de visas.' },
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
