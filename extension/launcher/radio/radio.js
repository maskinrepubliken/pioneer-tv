// Pioneer TV radio player. Opened from a radio tile as
// radio.html?channel=<Sveriges Radio channel id>&name=<label>. The box plays
// the channel's live MP3 itself (daemon/pioneertv/audio.py), so it plays on
// when the page is left, under the screensaver too, until something else
// plays; this page starts it (or finds it playing) and shows what is on now
// and next from SR's open API (which allows cross-site requests).
(function (M) {
  const b = M.bridge;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const channel = (params.get('channel') || '').replace(/\D/g, '');
  const name = params.get('name') || 'Radio';
  M.launcherUrl = new URL('index.html?tv=1', location.href).href;

  const playBtn = $('play');
  const stateEl = $('state');
  $('station').textContent = name;
  document.title = `${name} – Pioneer TV`;

  // What the button says is what it will do; the state line says what is.
  function setState(text, error) {
    stateEl.textContent = text;
    stateEl.classList.toggle('fel', !!error);
  }
  let st = { state: 'idle' };
  const mine = () => st.kind === 'radio' && st.item && String(st.item.channel) === channel;
  function sync() {
    const on = mine() && st.state !== 'idle';
    playBtn.textContent = on && st.state !== 'paused' ? 'Pausa' : 'Spela';
    setState(!on ? 'Tyst' : st.state === 'loading' ? 'Laddar…' : st.state === 'paused' ? 'Pausad' : 'Spelar');
  }
  function heard(s) { if (s && s.state) { st = s; sync(); } }
  b.on('audio', heard);

  async function ask(action, body) {
    try {
      const r = await fetch(`/api/audio/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const data = await r.json();
      heard(data);
      if (data.ok === false) setState(`Fel: ${data.message || 'kunde inte starta ljudet'}`, true);
    } catch {
      setState('Fel: boxen svarar inte', true);
    }
  }
  function play() {
    if (!channel) { setState('Fel: ingen kanal angiven', true); return; }
    setState('Laddar…');
    ask('radio', { channel, name, url: `https://sverigesradio.se/topsy/direkt/srapi/${channel}.mp3` });
  }
  function toggle() { if (mine() && st.state !== 'idle') ask('toggle'); else play(); }

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
  // Already playing (back on the page): left as it is.
  fetch('/api/audio').then((r) => r.json()).then((s) => { heard(s); if (!mine()) play(); }).catch(play);
  requestAnimationFrame(() => M.nav.focus(playBtn, { scroll: false }));
})(window.PioneerTV);
