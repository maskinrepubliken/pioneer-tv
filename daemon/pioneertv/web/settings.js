// Pioneer TV settings page. Vanilla JS, talks to /api/*. Open with ?mock=1 to
// design without a daemon.
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const mainHost = $('#main');
  let generation = 0;
  const MOCK = new URLSearchParams(location.search).has('mock');

  // A toast is the overlay's, over every window, as everywhere else.
  function toast(text) {
    if (MOCK) return;
    fetch('/api/toast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, ms: 2200 }) }).catch(() => {});
  }

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) el.setAttribute(k, v);
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined) el.append(c.nodeType ? c : String(c));
    return el;
  }

  // ---------------------------------------------------------------- API
  async function api(method, path, body) {
    if (MOCK) return mock(method, path, body);
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.message) || (data && data.error) || `${res.status}`);
    return data;
  }

  function mock(method, path, body) {
    const wait = (v, ms = 250) => new Promise((r) => setTimeout(() => r(v), ms));
    if (path === '/api/status') return wait({
      wifi: { available: true, device: 'wlan0', state: 'connected', ssid: 'Lyresten', signal: 72 },
      tailscale: { installed: true, state: 'running', ips: ['100.101.102.103'], dns_name: 'pioneer-tv.tail1234.ts.net',
        peers: [{ host: 'jellyfin', online: true }, { host: 'laptop', online: true }, { host: 'phone', online: false }] },
      interfaces: [{ name: 'eth0', up: true, addresses: ['192.168.1.40'] }, { name: 'wlan0', up: true, addresses: ['192.168.1.41'] }],
      system: { hostname: 'pioneer-tv', temp_c: 54.3, throttled: 0, throttled_now: false, throttled_ever: false, mem_total_mb: 921, mem_available_mb: 380, uptime_s: 86400 * 3 + 3600, load1: 0.8, disk: { total_mb: 29000, free_mb: 21000 } },
      gamepads: [{ name: 'Wireless Controller', battery: 65 }, { name: '8BitDo Pro 2', battery: null }],
      keyboard_present: false,
      cec: { enabled: true, phys_addr: '1.0.0.0', tv_power: 'on' }, audio: { available: true, sink: { name: 'TV (HDMI)', volume: 1 } },
      version: '0.1.0', git: { available: true, commit: '1a2b3c4', branch: 'main', date: '2026-09-10' }, page: 'https://www.svtplay.se/',
    });
    if (path === '/api/settings' && method === 'GET') return wait({
      sections: [
        { id: 'general', title: 'Allmänt', fields: [
          { path: 'ui.screensaver', type: 'choice', label: 'Skärmsläckare', options: [['labyrint', 'Labyrint'], ['eld', 'Eld']], value: 'labyrint' },
          { path: 'ui.home_minutes', type: 'number', label: 'Gå hem efter, utan knapptryck (0 = aldrig)', min: 0, max: 120, step: 1, unit: 'min', value: 30 },
          { path: 'ui.auto_keyboard', type: 'bool', label: 'Öppna skärmtangentbordet automatiskt i textfält', value: true } ] },
        { id: 'controls', title: 'Kontroller', fields: [
          { path: 'mouse.max_speed', type: 'number', label: 'Pekarhastighet', min: 200, max: 3000, step: 100, unit: 'px/s', value: 1100 },
          { path: 'gamepad.long_press_ms', type: 'number', label: 'Långtryck', min: 300, max: 2000, step: 100, unit: 'ms', value: 800 } ] },
        { id: 'tv', title: 'TV', fields: [
          { path: 'cec.enabled', type: 'bool', label: 'HDMI-CEC', value: true },
          { path: 'cec.osd_name', type: 'text', label: 'Namn som TV:n visar', value: 'Pioneer TV', maxlength: 14 },
          { path: 'ui.tv_off_minutes', type: 'number', label: 'Stäng av TV:n när skärmsläckaren varit på (0 = aldrig)', min: 0, max: 120, step: 1, unit: 'min', value: 20 } ] },
        { id: 'controls_bt', title: 'Bluetooth', fields: [
          { path: 'bluetooth.auto_connect', type: 'bool', label: 'Ring upp parade handkontroller som inte är anslutna', value: true } ] },
        { id: 'romm', title: 'RomM', fields: [
          { path: 'romm.url', type: 'text', label: 'Adress till RomM', value: 'https://spel.example.se' },
          { path: 'romm.api_key', type: 'text', label: 'API-nyckel', secret: true, value: '', is_set: true } ] },
        { id: 'jellyfin', title: 'Jellyfin', fields: [
          { path: 'jellyfin.url', type: 'text', label: 'Adress till Jellyfin (utan /web/)', value: 'http://100.123.142.8:8096' },
          { path: 'jellyfin.api_key', type: 'text', label: 'API-nyckel', secret: true, value: '', is_set: true },
          { path: 'jellyfin.user', type: 'text', label: 'Användare vars spellistor visas', value: '' } ] },
        { id: 'remote', title: 'Fjärråtkomst', fields: [
          { path: 'remote.token', type: 'text', label: 'Åtkomstnyckel (tom = bara lokalt / Tailscale serve)', secret: true, value: '', is_set: false } ] },
      ],
    });
    if (path.startsWith('/api/wifi/networks')) return wait([
      { ssid: 'Lyresten', signal: 72, security: 'WPA2', active: true }, { ssid: 'Grannen', signal: 40, security: 'WPA2', active: false }, { ssid: 'Cafe', signal: 25, security: '', active: false } ], 900);
    if (path.startsWith('/api/bluetooth')) return wait([
      { mac: 'AA:BB:CC:DD:EE:01', name: 'Wireless Controller', connected: true, paired: true, trusted: true, battery: 65, icon: 'input-gaming' },
      { mac: 'AA:BB:CC:DD:EE:02', name: '8BitDo Pro 2', connected: false, paired: true, trusted: true, battery: null, icon: 'input-gaming' },
      { mac: 'AA:BB:CC:DD:EE:03', name: 'Xbox Wireless Controller', connected: false, paired: false, trusted: false, battery: null, icon: 'input-gaming' } ], path.includes('scan') ? 2000 : 300);
    if (path === '/api/update/status') return wait({ running: false, log: '[update] repo /home/pi/pioneer-tv, branch main, at 1a2b3c4\n[update] already up to date (1a2b3c4)', last: { status: 'ok', message: 'already up to date', from: '1a2b3c4', to: '1a2b3c4', time: Date.now() / 1000 - 3600 } });
    if (path.startsWith('/api/update') && method === 'GET') return wait({ available: true, repo: '/home/pi/pioneer-tv', commit: '1a2b3c4', branch: 'main', date: '2026-09-10', subject: 'Soften the paper design', remote: '5d6e7f8', behind: 2, dirty: false,
      commits: ['5d6e7f8 2026-09-11 Add update button to menus', '9a8b7c6 2026-09-11 Fix CEC monitor parsing'] }, 1200);
    if (path === '/api/update' && method === 'POST') return wait({ ok: true, message: 'Running as unit: pioneer-tv-update.service' });
    if (path === '/api/cec/topology') return wait('Driver Info:\n\tDriver Name                : vc4_hdmi\n\tPhysical Address           : 1.0.0.0\n\tLogical Address            : 4 (Playback Device 1)\n\nTopology:\n\tSystem Information for device 0 (TV):\n\t\tVendor ID: 0x00e091 (LG)\n\t\tPower Status: On');
    if (path === '/api/cec/trace') return wait('09:20:01 >> cec-ctl --to 0 --user-control-pressed ui-cmd=volume-up\n09:20:01 >> cec-ctl --to 0 --user-control-released\n09:20:07 << Received from TV to Playback Device 1 (0 to 4): USER_CONTROL_PRESSED (0x44):\n09:20:07 <<     ui-cmd: up (0x01)\n09:20:07 << Received from TV to Playback Device 1 (0 to 4): USER_CONTROL_RELEASED (0x45)');
    if (path === '/api/services') return wait({ romm: { state: 'ok', version: '5.4.0', user: 'lyret' },
      jellyfin: { state: 'down' } }, 900);
    if (path === '/api/cec/raw') return wait({ ok: true, output: 'Transmit from Playback Device 1 to TV (4 to 0):\n\tGIVE_DEVICE_POWER_STATUS (0x8f)\n    Received from TV (0):\n\tREPORT_POWER_STATUS (0x90):\n\t\tpwr-state: on (0x00)' }, 400);
    if (path === '/api/images') return wait({ enabled: true, files: 2814, bytes: 412e6, max_bytes: 10240 * 1024 * 1024, max_px: 600, prefetch_at: '03:30',
      last_night: { new: 2810, had: 4, failed: 0, seconds: 1460, time: Date.now() / 1000 - 30000 } });
    if (path.startsWith('/api/logs')) return wait('2026-09-10T07:00:01 pioneertv INFO pioneertv 0.1.0\n2026-09-10T07:00:02 pioneertv.cec INFO CEC registered as playback device\n');
    return wait({ ok: true, message: 'mock' });
  }


  // ---------------------------------------------------------------- helpers
  const bars = (sig) => sig == null ? '' : '▂▄▆█'.slice(0, Math.max(1, Math.round(sig / 25))).padEnd(4, '·');
  const dot = (cls) => h('span', { class: `dot ${cls}` });
  const fmtUptime = (s) => s == null ? '–' : (s >= 86400 ? `${Math.floor(s / 86400)} d ` : '') + `${Math.floor((s % 86400) / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  const iconHtml = (name) => (window.PioneerTV && PioneerTV.icons ? PioneerTV.icons.html(name) : '');

  // ---------------------------------------------------------------- rows
  // The view is one column of rows, each the view's full width and each one
  // stop for the d-pad: up and down go from one to the next in order, left
  // goes to the column of tabs (or steps a value, on a row marked ◀ ▶).
  // Everything else (a status card, a heading, a line of text) is only read.
  //
  // row({ label, sub, detail, run, step, primary, key }): a button. run is
  // A; step(dir) is left and right (-1, 1). key names it across a redraw,
  // so the focus stays on it (else its label does).
  function row({ label, sub, detail, run, step, primary, disabled, key }) {
    const det = h('span', { class: 'row-detail' });
    if (detail && detail.nodeType) det.append(detail); else if (detail != null) det.textContent = detail;
    const el = h('button', { class: `row stop${primary ? ' primary' : ''}${step ? ' row-step' : ''}`, type: 'button', disabled: disabled ? '' : null, 'data-key': key || label },
      h('span', { class: 'row-text' }, h('span', { class: 'row-label' }, label), sub ? h('span', { class: 'row-sub' }, sub) : ''),
      det);
    if (run) el.addEventListener('click', () => run(el));
    if (step) el.step = step;
    el.say = (text) => { det.textContent = text; };
    return el;
  }
  // One that asks twice: the first A says "tryck A igen", the second does it.
  function confirmRow(opts, fn) {
    let armed = 0;
    const r = row({ ...opts, detail: opts.detail || '', run: async () => {
      if (!armed) { armed = setTimeout(() => { armed = 0; r.say(opts.detail || ''); }, 4000); r.say('tryck A igen'); return; }
      clearTimeout(armed); armed = 0; r.say(opts.detail || ''); await fn();
    } });
    return r;
  }
  // A text field as a row: its label, the field at the right (A opens the
  // on-screen keyboard); the field is the stop.
  function inputRow(label, input, sub) {
    input.classList.add('stop');
    input.dataset.key = label;
    return h('label', { class: 'row row-input', 'data-pioneertv-ring': '' },
      h('span', { class: 'row-text' }, h('span', { class: 'row-label' }, label), sub ? h('span', { class: 'row-sub' }, sub) : ''), input);
  }
  // A long text to read (a log), as a stop so the page can be scrolled to it.
  const logBox = (text, cls = '') => h('pre', { class: `log stop ${cls}`, tabindex: '0' }, text);
  const rows = (...r) => h('div', { class: 'rows' }, ...r);

  // ---------------------------------------------------------------- settings
  // Each field of the settings' schema as a row, saved when it is changed
  // (a number once it has stood still a moment).
  const saveTimers = {};
  function save(path, value, later) {
    clearTimeout(saveTimers[path]);
    const go = async () => {
      try { await api('PUT', '/api/settings', { values: { [path]: value } }); toast('Sparat'); }
      catch (e) { toast(`Misslyckades: ${e.message}`); }
    };
    if (later) saveTimers[path] = setTimeout(go, 700); else go();
  }
  function fieldRow(f) {
    if (f.type === 'bool') {
      let on = !!f.value;
      const sw = h('span', { class: 'switch', 'aria-checked': String(on) });
      const r = row({ label: f.label, detail: sw, run: () => { on = !on; sw.setAttribute('aria-checked', String(on)); save(f.path, on); } });
      r.setAttribute('role', 'switch');
      return r;
    }
    if (f.type === 'choice') {
      let at = Math.max(0, f.options.findIndex(([v]) => v === f.value));
      const text = () => `◀ ${f.options[at][1]} ▶`;
      const turn = (dir) => { at = (at + dir + f.options.length) % f.options.length; r.say(text()); save(f.path, f.options[at][0]); };
      const r = row({ label: f.label, detail: text(), run: () => turn(1), step: turn });
      return r;
    }
    if (f.type === 'number') {
      let v = Number(f.value) || 0;
      const places = String(f.step || 1).split('.')[1]?.length || 0;
      const text = () => `◀ ${v.toFixed(places).replace('.', ',')}${f.unit ? ` ${f.unit}` : ''} ▶`;
      const r = row({ label: f.label, detail: text(), step: (dir) => {
        const next = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, +(v + dir * (f.step || 1)).toFixed(places)));
        if (next === v) return;
        v = next; r.say(text()); save(f.path, v, true);
      } });
      return r;
    }
    const input = h('input', { type: f.secret ? 'password' : 'text', value: f.value ?? '', maxlength: f.maxlength, autocomplete: f.secret ? 'new-password' : 'off',
      placeholder: f.secret ? (f.is_set ? '•••••••• (satt)' : 'inte satt') : '' });
    input.addEventListener('change', () => {
      if (f.secret && !input.value) return;            // empty: the key set before stays
      save(f.path, input.value);
      if (f.secret) { input.value = ''; input.placeholder = '•••••••• (satt)'; }
    });
    return inputRow(f.label, input);
  }
  const fieldRows = (s, id) => {
    const section = s.sections.find((x) => x.id === id);
    return section ? section.fields.map(fieldRow) : [];
  };
  const settings = () => api('GET', '/api/settings');

  // ---------------------------------------------------------------- status
  // How each part is, read at the top of its own tab: the network on Wi-Fi,
  // Tailscale and the services on Tjänster, the TV on TV, the Pi on System.
  const status = () => api('GET', '/api/status');
  const card = (title, ...c) => h('div', { class: 'card pioneertv-card' }, h('h3', {}, title), ...c);
  function netCard(s) {
    const w = s.wifi;
    const eth = (s.interfaces || []).find((i) => i.name.startsWith('e'));
    const wlan = (s.interfaces || []).find((i) => i.name.startsWith('w')) || { addresses: [] };
    return card('Nätverk',
      h('div', { class: 'big' }, dot(w.state === 'connected' ? 'ok' : w.available ? 'warn' : 'bad'), w.state === 'connected' ? `${w.ssid} ` : w.available ? 'Wi-Fi ej ansluten' : 'Ingen Wi-Fi', w.signal != null ? h('span', { class: 'bars muted' }, ` ${bars(w.signal)} ${w.signal}%`) : ''),
      kv([['Ethernet', eth && eth.addresses.length ? eth.addresses.join(', ') : 'ej ansluten'], ['Wi-Fi IP', wlan.addresses.join(', ') || '–']]));
  }
  function tailscaleCard(s) {
    const t = s.tailscale;
    return card('Anslutning',
      h('div', { class: 'big' }, dot(t.state === 'running' ? 'ok' : t.installed ? 'warn' : 'bad'), t.state === 'running' ? 'Ansluten' : t.installed ? `Tailscale ${t.state}` : 'Ej installerat'),
      kv([['IP', (t.ips || []).join(', ') || '–'], ['Namn', t.dns_name || '–'], ['Peers', `${(t.peers || []).filter((p) => p.online).length} av ${(t.peers || []).length} online`]]));
  }
  function cecCard(s) {
    return card('TV (HDMI-CEC)',
      h('div', { class: 'big' }, dot(s.cec.enabled ? (s.cec.tv_power === 'on' ? 'ok' : 'warn') : 'bad'), s.cec.enabled ? (s.cec.tv_power === 'on' ? 'TV på' : s.cec.tv_power ? `TV ${s.cec.tv_power}` : 'TV okänd') : 'CEC av'),
      kv([['Fysisk adress', s.cec.phys_addr || '–'], ['Ljud', !s.audio || !s.audio.available ? 'ingen ljudserver' : s.audio.sink ? `${s.audio.sink.name} · ${Math.round(s.audio.sink.volume * 100)} %` : 'ingen utgång vald']]));
  }
  // RomM's or Jellyfin's: whether it answers and takes the key (/api/services).
  const SERVICE_STATE = { ok: ['ok', 'Ansluten'], auth: ['bad', 'Nyckeln godtas inte'], down: ['bad', 'Svarar inte'], unset: ['warn', 'Adress eller nyckel saknas'] };
  function serviceCard(st) {
    if (!st) return card('Anslutning', h('div', { class: 'big muted spin' }, 'Frågar…'));
    const [cls, text] = SERVICE_STATE[st.state] || ['bad', st.state];
    const pairs = [];
    if (st.server) pairs.push(['Server', st.server]);
    if (st.version) pairs.push(['Version', st.version]);
    if (st.user) pairs.push(['Användare', st.user]);
    return card('Anslutning', h('div', { class: 'big' }, dot(cls), text), pairs.length ? kv(pairs) : '');
  }
  function systemCard(s) {
    const sys = s.system;
    return card('Pi:n',
      h('div', { class: 'big' }, dot(sys.throttled_now ? 'bad' : sys.throttled_ever ? 'warn' : 'ok'), sys.temp_c != null ? `${sys.temp_c} °C` : sys.hostname),
      kv([['Ström', sys.throttled == null ? 'okänd' : sys.throttled_now ? 'underspänning / strypt nu' : sys.throttled_ever ? 'har strypts sedan start' : 'ok'],
        ['Minne', sys.mem_total_mb ? `${sys.mem_available_mb} MB ledigt av ${sys.mem_total_mb}` : '–'],
        ['Last', sys.load1 != null ? sys.load1.toFixed(2) : '–'], ['Upptid', fmtUptime(sys.uptime_s)],
        ['Disk', sys.disk && sys.disk.total_mb ? `${Math.round(sys.disk.free_mb / 1024)} GB ledigt` : '–'],
        ['Visar', s.page || '–']]));
  }

  async function cec(command) { try { await api('POST', '/api/cec', { command }); toast(`CEC: ${command}`); } catch (e) { toast(`CEC misslyckades: ${e.message}`); } }
  async function sysAction(action) { toast('Kör…'); try { const r = await api('POST', '/api/system', { action }); toast(r.ok ? 'Klart' : r.message); } catch (e) { toast(`Misslyckades: ${e.message}`); } }

  // ---------------------------------------------------------------- views
  // The parts whose journal the Loggar tab shows, and the CEC bus.
  const LOG_UNITS = [
    ['pioneer-tv-daemon', 'Daemon'], ['pioneer-tv-display', 'Skärm'], ['chromium', 'Chromium'],
    ['pioneer-tv-update', 'Uppdatering'], ['bluetooth', 'Bluetooth'], ['NetworkManager', 'Nätverk'],
    ['tailscaled', 'Tailscale'], ['cec', 'CEC'],
  ];

  const views = {
    // Allmänt: how the box behaves on the screen, the screensaver first.
    async general(show) {
      const s = await settings();
      const preview = (kind) => api('POST', '/api/saver/preview', { kind }).catch((e) => toast(`Misslyckades: ${e.message}`));
      show(h('h1', {}, 'Allmänt'),
        rows(...fieldRows(s, 'general')),
        h('h2', {}, 'Förhandsgranska skärmsläckaren'),
        h('p', { class: 'muted' }, 'Visas på TV:n nu; nästa knapptryck tar bort den.'),
        rows(row({ label: 'Visa Labyrint', key: 'preview-labyrint', run: () => preview('labyrint') }),
          row({ label: 'Visa Eld', key: 'preview-eld', run: () => preview('eld') })));
    },

    // TV: the set itself. Its state, CEC, and CEC's tests and trace.
    async tv(show) {
      const [s, st] = await Promise.all([settings(), status()]);
      const topo = logBox('Hämtar…', 'small');
      const trace = logBox('Hämtar…', 'small');
      const rawOut = logBox('', 'small');
      rawOut.hidden = true;
      const rawIn = h('input', { type: 'text', placeholder: '--to 0 --give-device-power-status' });
      let traceTimer = null;
      const loadTopo = async () => { topo.textContent = await api('GET', '/api/cec/topology').catch((e) => `Fel: ${e.message}`); };
      const loadTrace = async () => {
        clearTimeout(traceTimer);
        if (!trace.isConnected) return;
        trace.textContent = (await api('GET', '/api/cec/trace').catch((e) => `Fel: ${e.message}`)) || '(inget ännu)';
        trace.scrollTop = trace.scrollHeight;
        traceTimer = setTimeout(loadTrace, 2000);
      };
      const runRaw = async (args) => {
        rawOut.hidden = false; rawOut.textContent = 'Kör…';
        try { const r = await api('POST', '/api/cec/raw', { args }); rawOut.textContent = r.output || '(inget svar)'; }
        catch (e) { rawOut.textContent = `Fel: ${e.message}`; }
        loadTrace();
      };
      rawIn.addEventListener('change', () => { if (rawIn.value.trim()) runRaw(rawIn.value); });
      show(h('h1', {}, 'TV'),
        cecCard(st),
        rows(...fieldRows(s, 'tv')),
        h('h2', {}, 'Testa'),
        rows(
          row({ label: 'TV på', run: () => cec('tv_on') }),
          row({ label: 'TV av', run: () => cec('tv_off') }),
          row({ label: 'Volym', detail: '◀ ▶ · A: ljud av', run: () => cec('mute'), step: (dir) => cec(dir > 0 ? 'volume_up' : 'volume_down') }),
          row({ label: 'Byt till Pi-ingången', run: () => cec('active_source') }),
          row({ label: 'Fråga TV:n om strömmen', run: () => runRaw('--to 0 --give-device-power-status') })),
        rawOut,
        h('h2', {}, 'Felsökning'),
        h('p', { class: 'muted' }, 'Bussen enligt cec-ctl. Pi:n ska stå som Playback Device och TV:n som logisk adress 0.'),
        rows(row({ label: 'Läs om topologin', run: loadTopo })),
        topo,
        h('h2', {}, 'Rått kommando'),
        h('p', { class: 'muted' }, 'Argument till cec-ctl (enheten läggs till automatiskt), till exempel ', h('code', {}, '--to 0 --image-view-on'), '. Körs när fältet är ifyllt.'),
        rows(inputRow('Kommando', rawIn)),
        h('h2', {}, 'CEC-spår'),
        h('p', { class: 'muted' }, '>> skickat av daemonen, << mottaget från bussen. Tryck på TV:ns fjärrkontroll och se om tryckningarna dyker upp.'),
        trace);
      loadTopo();
      loadTrace();
    },

    async controls(show) {
      const [s, st] = await Promise.all([settings(), status()]);
      show(h('h1', {}, 'Kontroller'),
        rows(...fieldRows(s, 'controls')),
        h('h2', {}, 'Tangentbord'),
        h('p', { class: 'muted' }, st.keyboard_present ? 'Ett tangentbord är anslutet, så skärmtangentbordet öppnas inte automatiskt.' : 'Ett USB-tangentbord fungerar direkt; när ett är anslutet öppnas inte skärmtangentbordet automatiskt.'),
        h('p', { class: 'muted' }, 'Hela knappmappningen står i /etc/pioneer-tv/config.toml.'));
    },

    // Bluetooth: the devices (pads first among them), each a row whose A
    // does what it needs (para, anslut, koppla från), and whether paired
    // pads are called up by themselves.
    async bluetooth(show) {
      const s = await settings();
      const draw = (devices, scanning) => {
        const list = [];
        for (const d of devices) {
          const state = d.connected ? 'Ansluten' : d.paired ? 'Parad, ej ansluten' : 'Ny enhet';
          const sub = `${state}${d.battery != null ? ` · batteri ${d.battery}%` : ''} · ${d.mac}`;
          const [action, word, busy] = d.connected ? ['disconnect', 'Koppla från'] : d.paired ? ['connect', 'Anslut', 'Ansluter…'] : ['pair', 'Para', 'Parar…'];
          list.push(row({ label: d.name, sub, detail: word, key: d.mac, run: () => bt(action, d, busy) }));
          if (d.paired) list.push(confirmRow({ label: `Ta bort ${d.name}`, key: `remove-${d.mac}` }, () => bt('remove', d)));
        }
        show(h('h1', {}, 'Bluetooth'),
          h('p', { class: 'muted' }, 'Sätt kontrollen i parningsläge (PS: håll Share + PS. Xbox: håll parningsknappen. 8BitDo: håll Select), sök sedan.'),
          rows(row({ label: scanning ? 'Söker (8 s)…' : 'Sök efter enheter', key: 'scan', primary: true, disabled: scanning, run: scan })),
          list.length ? rows(...list) : h('p', { class: 'muted' }, 'Inga Bluetooth-enheter kända.'),
          h('h2', {}, 'Inställningar'),
          rows(...fieldRows(s, 'controls_bt')));
      };
      const scan = async () => { draw(await api('GET', '/api/bluetooth/devices'), true); draw(await api('POST', '/api/bluetooth/scan', { seconds: 8 }), false); };
      const bt = async (action, d, busy) => {
        if (busy) toast(`${busy} ${d.name}`);
        try { const r = await api('POST', `/api/bluetooth/${action}`, { mac: d.mac }); toast(r.ok ? 'Klart' : r.message); }
        catch (e) { toast(`Misslyckades: ${e.message}`); }
        draw(await api('GET', '/api/bluetooth/devices'), false);
      };
      draw(await api('GET', '/api/bluetooth/devices'), false);
    },

    // Wi-Fi: the network, then the networks in range, each a row (A joins
    // it; a locked one asks for its password in a row below first), and
    // one to save that is not in range.
    async wifi(show) {
      const st = await status();
      show(h('h1', {}, 'Wi-Fi'), netCard(st), h('p', { class: 'muted spin' }, 'Söker nätverk…'));
      const nets = await api('GET', '/api/wifi/networks?rescan=1');
      const list = [];
      for (const n of nets) {
        const connect = async (password) => {
          toast(`Ansluter till ${n.ssid}…`);
          try { const r = await api('POST', '/api/wifi/connect', { ssid: n.ssid, password }); toast(r.ok ? `Ansluten till ${n.ssid}` : r.message); views.wifi(show); }
          catch (e) { toast(`Misslyckades: ${e.message}`); }
        };
        const pw = h('input', { type: 'password', placeholder: 'skriv och anslut' });
        pw.addEventListener('change', () => { if (pw.value) connect(pw.value); });
        const pwRow = inputRow(`Lösenord till ${n.ssid}`, pw);
        pwRow.hidden = true;
        list.push(row({ label: n.ssid, sub: `${n.signal}% · ${n.security || 'öppet'}`, detail: n.active ? 'Ansluten' : bars(n.signal), key: `net-${n.ssid}`,
          run: () => {
            if (n.active) return;
            if (!n.security) return connect('');
            pwRow.hidden = false;
            focusStop(pw);
          } }), pwRow);
        if (n.active) list.push(confirmRow({ label: `Glöm ${n.ssid}`, key: `forget-${n.ssid}` }, async () => { await api('POST', '/api/wifi/forget', { ssid: n.ssid }); toast('Glömt'); views.wifi(show); }));
      }
      // Save a network that is not in range right now (home Wi-Fi before the box moves).
      const addSsid = h('input', { type: 'text' });
      const addPw = h('input', { type: 'password' });
      let hidden = false;
      const sw = h('span', { class: 'switch', 'aria-checked': 'false' });
      show(h('h1', {}, 'Wi-Fi'), netCard(st),
        rows(row({ label: 'Sök igen', key: 'rescan', run: () => views.wifi(show) }), ...list),
        nets.length ? '' : h('p', { class: 'muted' }, 'Inga nätverk hittades (Ethernet är ändå att föredra för strömning).'),
        h('h2', {}, 'Spara ett nätverk som inte är i närheten'),
        h('p', { class: 'muted' }, 'Boxen ansluter när nätverket dyker upp, till exempel hemma efter att den satts upp någon annanstans.'),
        rows(inputRow('Nätverkets namn', addSsid), inputRow('Lösenord', addPw),
          row({ label: 'Dolt nätverk', detail: sw, run: () => { hidden = !hidden; sw.setAttribute('aria-checked', String(hidden)); } }),
          row({ label: 'Spara nätverket', key: 'add', run: async () => {
            if (!addSsid.value.trim()) { toast('Skriv nätverkets namn'); return; }
            try { const r = await api('POST', '/api/wifi/add', { ssid: addSsid.value.trim(), password: addPw.value, hidden }); toast(r.ok ? `Sparade ${addSsid.value.trim()}` : r.message); views.wifi(show); }
            catch (e) { toast(`Misslyckades: ${e.message}`); }
          } })));
    },

    // Tjänster: Tailscale, and where the box's sources are, whether they
    // answer, and their keys, as passwords (left empty, a key set before is
    // kept). The home page's tiles are the settings file's
    // (/etc/pioneer-tv/settings.json), not set here.
    async services(show) {
      const [s, st] = await Promise.all([settings(), status()]);
      const at = { romm: h('div', {}, serviceCard()), jellyfin: h('div', {}, serviceCard()) };
      const t = st.tailscale;
      show(h('h1', {}, 'Tjänster'),
        h('p', { class: 'muted' }, 'Spelen kommer från RomM, filmerna och musiken från Jellyfin. Nycklarna visas inte; ett tomt fält behåller den som är satt. Rutorna på startsidan står i /etc/pioneer-tv/settings.json.'),
        h('h2', {}, 'Tailscale'),
        tailscaleCard(st),
        t.installed && t.state !== 'running' ? rows(row({ label: 'Starta Tailscale', run: () => sysAction('tailscale_up') })) : '',
        h('h2', {}, 'RomM'), at.romm, rows(...fieldRows(s, 'romm')),
        h('h2', {}, 'Jellyfin'), at.jellyfin, rows(...fieldRows(s, 'jellyfin')));
      const svc = await api('GET', '/api/services').catch(() => ({}));
      at.romm.replaceChildren(serviceCard(svc.romm || { state: 'down' }));
      at.jellyfin.replaceChildren(serviceCard(svc.jellyfin || { state: 'down' }));
    },

    async system(show) {
      // ---- update from the git repo
      const upd = h('div');
      let pollTimer = null;
      let lastInfo = null;
      const drawUpdate = (info, st) => {
        clearTimeout(pollTimer);
        const running = st && st.running;
        const lines = [];
        if (!info || info.available === false) {
          lines.push(h('p', { class: 'muted' }, (info && info.error) || 'Ingen git-utcheckning hittad. Installera med system/install.sh från ett klonat repo.'));
        } else {
          lines.push(h('div', { class: 'big' }, `Version ${info.commit}`, h('span', { class: 'hint' }, ` · ${info.branch} · ${info.date}`)));
          lines.push(h('p', { class: 'muted' }, info.subject));
          if (info.error) lines.push(h('p', { class: 'muted' }, dot('bad'), info.error));
          else if (info.behind > 0) {
            lines.push(h('p', {}, dot('warn'), `${info.behind} ${info.behind === 1 ? 'ny ändring' : 'nya ändringar'} på GitHub:`));
            lines.push(h('ul', { class: 'commits' }, info.commits.map((c) => h('li', {}, c))));
          } else if (info.remote) lines.push(h('p', {}, dot('ok'), 'Senaste versionen.'));
          if (info.dirty) lines.push(h('p', { class: 'muted' }, 'Lokala ändringar i repot; uppdateringen kräver en ren utcheckning.'));
        }
        if (st && st.last) lines.push(h('p', { class: 'hint' }, `Senaste körning ${new Date(st.last.time * 1000).toLocaleString('sv-SE')}: ${st.last.message} (${st.last.status})`));
        upd.replaceChildren(card('Programvara', ...lines),
          rows(row({ label: 'Sök efter uppdatering', disabled: running, run: () => refreshUpdate(true) }),
            row({ label: running ? 'Uppdaterar…' : 'Installera uppdatering', key: 'install', primary: true, disabled: running || !(info && info.behind > 0), run: () => startUpdate() }),
            confirmRow({ label: 'Installera om ändå', disabled: running }, () => startUpdate(true))),
          st && (running || st.log) ? logBox(st.log || '', 'small') : '');
        const pre = upd.querySelector('pre');
        if (pre) pre.scrollTop = pre.scrollHeight;
        if (running) pollTimer = setTimeout(async () => drawUpdate(info, await api('GET', '/api/update/status').catch(() => ({ running: true, log: 'Daemonen startar om…' }))), 2000);
      };
      const refreshUpdate = async (fetch) => {
        if (fetch) toast('Hämtar från GitHub…');
        try {
          const [info, st] = await Promise.all([api('GET', `/api/update?fetch=${fetch ? 1 : 0}`), api('GET', '/api/update/status')]);
          lastInfo = info;
          drawUpdate(info, st);
        } catch (e) { drawUpdate({ available: false, error: e.message }, null); }
      };
      const startUpdate = async (force) => {
        try { await api('POST', '/api/update', { force: !!force }); toast('Uppdatering startad'); }
        catch (e) { toast(`Misslyckades: ${e.message}`); return; }
        drawUpdate(lastInfo, { running: true, log: 'Startar…' });
      };

      // ---- the covers and posters kept on the disk (imagecache.py)
      const pics = h('div', {}, card('Omslag på disken', h('p', { class: 'muted spin' }, 'Räknar…')));
      const drawPics = async () => {
        let st;
        try { st = await api('GET', '/api/images'); } catch (e) { pics.replaceChildren(card('Omslag på disken', h('p', { class: 'muted' }, e.message))); return; }
        const mb = (b) => `${Math.round(b / 1048576).toLocaleString('sv-SE')} MB`;
        pics.replaceChildren(card('Omslag på disken',
          st.enabled ? h('p', {}, `${st.files.toLocaleString('sv-SE')} bilder, ${mb(st.bytes)} av högst ${mb(st.max_bytes)}.`) : h('p', { class: 'muted' }, 'Av (images.cache_mb är 0).'),
          h('p', { class: 'muted' }, `Omslag från RomM och bilder från Jellyfin, krympta till högst ${st.max_px || 600} px. De sparas första gången de visas${st.prefetch_at ? `, och alla hämtas varje natt kl ${st.prefetch_at}` : ''}; sedan kommer de från disken. De som inte använts på längst tid får gå när det blir fullt.`),
          st.last_night ? h('p', { class: 'hint' }, `Senaste natten ${new Date(st.last_night.time * 1000).toLocaleString('sv-SE')}: ${st.last_night.new} nya, ${st.last_night.had} fanns redan, ${st.last_night.failed} misslyckades (${Math.round(st.last_night.seconds / 60)} min).`) : ''),
        st.enabled ? rows(confirmRow({ label: 'Töm omslagen' }, async () => {
          try { await api('POST', '/api/images/clear'); toast('Tömt'); } catch (e) { toast(`Misslyckades: ${e.message}`); }
          drawPics();
        })) : '');
      };

      // ---- reached from elsewhere: over Tailscale, or with the key
      const [st, s] = await Promise.all([status(), settings()]);
      const t = st.tailscale;
      const url = t.dns_name ? `https://${t.dns_name}/` : (t.ips || [])[0] ? `http://${t.ips[0]}:8765/` : null;
      show(h('h1', {}, 'System'),
        systemCard(st),
        upd,
        pics,
        h('h2', {}, 'Fjärråtkomst'),
        h('p', { class: 'muted' }, 'Enklast: kör på Pi:n ', h('code', {}, 'sudo tailscale serve --bg 8765'), '. Då nås den här sidan från alla dina Tailscale-enheter på ', url || 'Pi:ns Tailscale-adress', ' utan öppna portar. Åtkomstnyckeln behövs bara om du binder daemonen till 0.0.0.0 i config.toml.'),
        rows(...fieldRows(s, 'remote')),
        h('h2', {}, 'Starta om'),
        rows(row({ label: 'Starta om Chromium', run: () => sysAction('restart_ui') }),
          row({ label: 'Starta om daemonen', run: () => sysAction('restart_daemon') }),
          confirmRow({ label: 'Starta om Pi:n' }, () => sysAction('reboot')),
          confirmRow({ label: 'Stäng av Pi:n' }, () => sysAction('shutdown'))));
      refreshUpdate(false);
      drawPics();
    },

    // The journal of each of the box's parts, and the CEC bus as the daemon
    // sees it: ◀ ▶ picks the part (A fetches it again); the daemon's log and
    // the CEC trace follow live while they are on screen.
    async logs(show) {
      const pre = logBox('Hämtar…', 'log-full');
      let timer = null;
      let at = 0;
      const load = async () => {
        clearTimeout(timer);
        const now = LOG_UNITS[at][0];
        try {
          const text = await api('GET', now === 'cec' ? '/api/cec/trace' : `/api/logs?unit=${encodeURIComponent(now)}&lines=200`);
          if (!pre.isConnected || now !== LOG_UNITS[at][0]) return;
          pre.textContent = text || '(tomt)';
        } catch (e) {
          if (!pre.isConnected) return;
          pre.textContent = `Kunde inte hämta loggen: ${e.message}`;
        }
        pre.scrollTop = pre.scrollHeight;
        if (pre.isConnected && (now === 'pioneer-tv-daemon' || now === 'cec')) timer = setTimeout(load, now === 'cec' ? 2000 : 5000);
      };
      const text = () => `◀ ${LOG_UNITS[at][1]} ▶`;
      const pick = row({ label: 'Visa', detail: text(), run: () => { pre.textContent = 'Hämtar…'; load(); },
        step: (dir) => { at = (at + dir + LOG_UNITS.length) % LOG_UNITS.length; pick.say(text()); pre.textContent = 'Hämtar…'; load(); } });
      show(h('h1', {}, 'Loggar'), rows(pick), pre);
      load();
    },
  };

  // ---------------------------------------------------------------- the column
  // The tabs, in groups: [group, [[view, name, icon]]]. The page opens on
  // Allmänt.
  const TABS = [
    ['Boxen', [['general', 'Allmänt', 'home'], ['tv', 'TV', 'tv'], ['controls', 'Kontroller', 'keyboard']]],
    ['Anslutet', [['bluetooth', 'Bluetooth', 'gamepad'], ['wifi', 'Wi-Fi', 'wifi'], ['services', 'Tjänster', 'link']]],
    ['Underhåll', [['system', 'System', 'gear'], ['logs', 'Loggar', 'pulse']]],
  ];
  const FIRST = 'general';
  // Old tabs' addresses.
  const MOVED = { gamepads: 'bluetooth', status: 'general', remote: 'system' };
  const rail = $('#rail'), nav = $('#nav');
  for (const [group, tabs] of TABS) {
    nav.append(h('section', { class: 'rail-group' }, h('h2', { class: 'rail-group-label' }, group),
      tabs.map(([view, name, ic]) => {
        const mark = h('button', { class: 'pioneertv-round rail-mark', type: 'button', 'aria-label': name, 'data-view': view, 'data-icon': ic });
        return h('div', { class: 'rail-item', 'data-view': view, onclick: () => { location.hash = '#' + view; } }, mark, h('span', { class: 'rail-label' }, name));
      })));
  }
  // The icons, once icons.js is in (it loads beside this, see settings.html).
  const icons = () => {
    if (!(window.PioneerTV && PioneerTV.icons)) return;
    for (const m of nav.querySelectorAll('.rail-mark:empty')) m.innerHTML = iconHtml(m.dataset.icon);
  };
  icons();
  window.addEventListener('load', icons);
  // The pointer opens it too, as on the browse pages.
  rail.addEventListener('mousemove', (e) => { if (e.movementX || e.movementY) rail.classList.add('open'); });
  rail.addEventListener('mouseover', (e) => { if (!e.isTrusted) rail.classList.add('open'); });
  rail.addEventListener('mouseout', (e) => { if (!rail.contains(e.relatedTarget)) rail.classList.remove('open'); });
  const marks = () => [...nav.querySelectorAll('.rail-mark')];
  const here = () => nav.querySelector('.rail-item.active .rail-mark');
  // Into the column from elsewhere (the pointer): to the tab shown. Within
  // it, a tab's ring with the focus shows that tab.
  nav.addEventListener('focusin', (e) => {
    const view = e.target && e.target.dataset && e.target.dataset.view;
    if (!view) return;
    if (!nav.contains(e.relatedTarget) && here() && here() !== e.target) { here().focus(); return; }
    if (location.hash !== '#' + view) location.hash = '#' + view;
  });

  // ---------------------------------------------------------------- the d-pad
  // The page's own, not the spatial navigation's guess by distance (which
  // went from a row to the column and back): registered before the
  // extension's (it comes at document_idle), so it sees the arrows first.
  // In the column, up and down go through the tabs, right goes into the
  // view (to the row one was last on there). In the view, up and down go
  // row by row; left steps a ◀ ▶ row's value, else goes to the column;
  // right steps it. B in the view goes to the column; in the column, home.
  const stops = () => [...mainHost.querySelectorAll('.stop')].filter((el) => !el.disabled && el.offsetParent);
  const lastStop = {};                 // view -> the key of the row last on
  let shown = FIRST;
  function focusStop(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    if (mainHost.contains(el)) el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.5 ? 'start' : 'center' });
  }
  const keyOf = (el) => el && el.dataset && el.dataset.key;
  const intoView = () => {
    const all = stops();
    focusStop((lastStop[shown] && all.find((el) => keyOf(el) === lastStop[shown])) || all[0]);
  };
  mainHost.addEventListener('focusin', (e) => { if (keyOf(e.target)) lastStop[shown] = keyOf(e.target); });
  const keyboardOpen = () => document.documentElement.classList.contains('pioneertv-keyboard-open');
  const typing = (el) => el && el.tagName === 'INPUT';
  window.addEventListener('keydown', (e) => {
    if (keyboardOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    const a = document.activeElement;
    const inRail = nav.contains(a);
    const inView = mainHost.contains(a);
    let done = true;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      if (inRail) { const m = marks(); focusStop(m[m.indexOf(a) + dir]); }
      else if (inView) {
        const all = stops();
        const i = all.indexOf(a);
        if (i < 0) intoView();
        else if (all[i + dir]) focusStop(all[i + dir]);
        else if (dir < 0) window.scrollTo({ top: 0 });
      } else focusStop(here());
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      if (inView && a.step) a.step(dir);
      else if (inView) { if (dir < 0) focusStop(here()); }
      else if (inRail) { if (dir > 0) intoView(); }
      else focusStop(here());
    } else if (e.key === 'Escape') {
      if (typing(a)) done = false;                    // leaves the field (spatial-nav.js)
      else if (inView) focusStop(here());
      else if (!e.repeat) api('POST', '/api/home').catch(() => {});
    } else if (e.key === ' ' && !e.repeat && !typing(a)) {
      // X (the pad's, as Space) presses the view's filled row, as on every
      // page of the box.
      const p = stops().find((el) => el.classList.contains('primary'));
      if (p) p.click(); else done = false;
    } else done = false;
    if (done) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ---------------------------------------------------------------- routing
  function route() {
    let view = (location.hash || `#${FIRST}`).slice(1);
    view = MOVED[view] || (views[view] ? view : FIRST);
    shown = view;
    for (const it of nav.querySelectorAll('.rail-item')) {
      it.classList.toggle('active', it.dataset.view === view);
      // The page opens with the focus on the tab shown.
      it.firstChild.toggleAttribute('data-pioneertv-initial', it.dataset.view === view);
    }
    // Each route renders into its own element, so a slow view from an earlier
    // route can never overwrite the current one. Drawn again (a device
    // connected, a network joined), the focus stays on the row it was on.
    const gen = ++generation;
    const el = h('div');
    mainHost.replaceChildren(el);
    const draw = (...children) => {
      if (gen !== generation) return;
      const a = document.activeElement;
      const was = el.contains(a) ? keyOf(a) : null;
      el.replaceChildren(...children);
      if (was) { const again = stops().find((s) => keyOf(s) === was); if (again) again.focus({ preventScroll: true }); else intoView(); }
    };
    views[view](draw).catch((e) => { draw(h('h1', {}, 'Fel'), h('p', {}, e.message)); });
  }
  window.addEventListener('hashchange', route);
  route();
  if (!rail.contains(document.activeElement)) here().focus();
  api('GET', '/api/status').then((s) => { $('#foot').textContent = `Maskinrepubliken · ${s.system.hostname} · ${s.git && s.git.commit ? s.git.commit : 'v' + s.version}${MOCK ? ' · mock' : ''}`; }).catch(() => {});
})();
