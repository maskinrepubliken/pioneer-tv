// Pioneer TV radio player. Opened from a radio tile as
// radio.html?channel=<Sveriges Radio channel id>&name=<label>. Streams the
// channel's live MP3 and shows what is on now and next from SR's open API
// (both allow cross-site requests, so no extra permissions are needed).
(function (M) {
  const b = M.bridge;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const channel = (params.get('channel') || '').replace(/\D/g, '');
  const name = params.get('name') || 'Radio';
  M.launcherUrl = new URL('index.html?tv=1', location.href).href;

  const audio = $('audio');
  const playBtn = $('play');
  const stateEl = $('state');
  $('station').textContent = name;
  document.title = `${name} – Pioneer TV`;

  // What the button says is what it will do; the state line says what is.
  function setState(text, error) {
    stateEl.textContent = text;
    stateEl.classList.toggle('fel', !!error);
  }
  function sync() {
    playBtn.textContent = audio.paused ? 'Spela' : 'Pausa';
  }

  function play() {
    if (!channel) { setState('Fel: ingen kanal angiven', true); return; }
    // A fresh connection each time: a live stream resumed after a pause would
    // otherwise play from where it stopped.
    audio.src = `https://sverigesradio.se/topsy/direkt/srapi/${channel}.mp3`;
    setState('Laddar…');
    audio.play().catch(() => setState('Fel: kunde inte starta ljudet', true));
  }
  function pause() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setState('Pausad');
    sync();
  }
  function toggle() { audio.paused ? play() : pause(); }

  audio.addEventListener('playing', () => { setState('Spelar'); sync(); });
  audio.addEventListener('waiting', () => setState('Laddar…'));
  audio.addEventListener('pause', sync);
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) { setState('Fel: strömmen svarar inte', true); sync(); } });

  playBtn.addEventListener('click', toggle);
  $('home').addEventListener('click', () => b.home());

  // X on the pad arrives as Space; B as Escape.
  window.addEventListener('keydown', (e) => {
    if (M.nav.captured) return;                     // the menu or keyboard has the pad
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) toggle(); }
    else if (e.key === 'Escape') { e.preventDefault(); b.home(); }
  });

  // ------------------------------------------------------ now and next
  const srDate = (s) => { const m = /\((\d+)\)/.exec(s || ''); return m ? new Date(Number(m[1])) : null; };
  const hhmm = (d) => d ? d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '';

  async function schedule() {
    if (!channel) return;
    try {
      const r = await fetch(`https://api.sr.se/api/v2/scheduledepisodes/rightnow?channelid=${channel}&format=json`);
      const c = (await r.json()).channel || {};
      if (c.name && !params.get('name')) $('station').textContent = c.name;
      const now = c.currentscheduledepisode;
      $('now-title').textContent = now ? (now.title || (now.program && now.program.name) || '') : 'Ingen tablå just nu';
      $('now-times').textContent = now ? `${hhmm(srDate(now.starttimeutc))}–${hhmm(srDate(now.endtimeutc))}` : '';
      const next = c.nextscheduledepisode;
      $('next').hidden = !next;
      if (next) {
        $('next-time').textContent = hhmm(srDate(next.starttimeutc));
        $('next-title').textContent = next.title || (next.program && next.program.name) || '';
      }
    } catch {
      $('now-title').textContent = 'Tablån kunde inte hämtas';
      $('now-times').textContent = '';
    }
  }

  schedule();
  setInterval(schedule, 60000);
  play();
  requestAnimationFrame(() => M.nav.focus(playBtn, { scroll: false }));
})(window.PioneerTV);
