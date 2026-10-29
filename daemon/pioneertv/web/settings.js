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
  const icon = (name) => (window.PioneerTV && PioneerTV.icons) ? h('span', { class: 'item-icon' }, PioneerTV.icons.svg(name)) : h('span', { class: 'item-icon' }, '·');
  const dot = (cls) => h('span', { class: `dot ${cls}` });
  const fmtUptime = (s) => s == null ? '–' : (s >= 86400 ? `${Math.floor(s / 86400)} d ` : '') + `${Math.floor((s % 86400) / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

  function confirmBtn(label, cls, fn) {
    let armed = false;
    const b = h('button', { class: cls, onclick: async () => {
      if (!armed) { armed = true; b.textContent = `${label} – tryck igen`; setTimeout(() => { armed = false; b.textContent = label; }, 4000); return; }
      armed = false; b.textContent = label; await fn();
    } }, label);
    return b;
  }

  // ---------------------------------------------------------------- views
  // The parts whose journal the Loggar tab shows, and the CEC bus.
  const LOG_UNITS = [
    ['pioneer-tv-daemon', 'Daemon'], ['pioneer-tv-display', 'Skärm'], ['chromium', 'Chromium'],
    ['pioneer-tv-update', 'Uppdatering'], ['bluetooth', 'Bluetooth'], ['NetworkManager', 'Nätverk'],
    ['tailscaled', 'Tailscale'], ['cec', 'CEC'],
  ];

  // ---------------------------------------------------------------- status
  // How each part is, shown at the top of its own tab (there is no Status
  // tab): the network on Wi-Fi, Tailscale with the services on Tjänster,
  // the TV on TV, the Pi on System.
  const status = () => api('GET', '/api/status');
  const cards = (...c) => h('div', { class: 'cards' }, ...c);
  function netCard(s) {
    const w = s.wifi;
    const eth = (s.interfaces || []).find((i) => i.name.startsWith('e'));
    const wlan = (s.interfaces || []).find((i) => i.name.startsWith('w')) || { addresses: [] };
    return h('div', { class: 'card pioneertv-card' }, h('h3', {}, 'Nätverk'),
      h('div', { class: 'big' }, dot(w.state === 'connected' ? 'ok' : w.available ? 'warn' : 'bad'), w.state === 'connected' ? `${w.ssid} ` : w.available ? 'Wi-Fi ej ansluten' : 'Ingen Wi-Fi', w.signal != null ? h('span', { class: 'bars muted' }, ` ${bars(w.signal)} ${w.signal}%`) : ''),
      kv([['Ethernet', eth && eth.addresses.length ? eth.addresses.join(', ') : 'ej ansluten'], ['Wi-Fi IP', wlan.addresses.join(', ') || '–']]));
  }
  function tailscaleCard(s) {
    const t = s.tailscale;
    return h('div', { class: 'card pioneertv-card' }, h('h3', {}, 'Anslutning'),
      h('div', { class: 'big' }, dot(t.state === 'running' ? 'ok' : t.installed ? 'warn' : 'bad'), t.state === 'running' ? 'Ansluten' : t.installed ? `Tailscale ${t.state}` : 'Ej installerat'),
      kv([['IP', (t.ips || []).join(', ') || '–'], ['Namn', t.dns_name || '–'], ['Peers', `${(t.peers || []).filter((p) => p.online).length} av ${(t.peers || []).length} online`]]),
      t.installed && t.state !== 'running' ? h('div', { class: 'actions' }, h('button', { class: 'small', onclick: () => sysAction('tailscale_up') }, 'Starta Tailscale')) : '');
  }
  function cecCard(s) {
    return h('div', { class: 'card pioneertv-card' }, h('h3', {}, 'TV (HDMI-CEC)'),
      h('div', { class: 'big' }, dot(s.cec.enabled ? (s.cec.tv_power === 'on' ? 'ok' : 'warn') : 'bad'), s.cec.enabled ? (s.cec.tv_power === 'on' ? 'TV på' : s.cec.tv_power ? `TV ${s.cec.tv_power}` : 'TV okänd') : 'CEC av'),
      kv([['Fysisk adress', s.cec.phys_addr || '–'], ['Ljud', !s.audio || !s.audio.available ? 'ingen ljudserver' : s.audio.sink ? `${s.audio.sink.name} · ${Math.round(s.audio.sink.volume * 100)} %` : 'ingen utgång vald']]));
  }
  // RomM's or Jellyfin's: whether it answers and takes the key (/api/services).
  const SERVICE_STATE = { ok: ['ok', 'Ansluten'], auth: ['bad', 'Nyckeln godtas inte'], down: ['bad', 'Svarar inte'], unset: ['warn', 'Adress eller nyckel saknas'] };
  function serviceCard(st) {
    if (!st) return h('div', { class: 'card pioneertv-card' }, h('h3', {}, 'Anslutning'), h('div', { class: 'big muted spin' }, 'Frågar…'));
    const [cls, text] = SERVICE_STATE[st.state] || ['bad', st.state];
    const rows = [];
    if (st.server) rows.push(['Server', st.server]);
    if (st.version) rows.push(['Version', st.version]);
    if (st.user) rows.push(['Användare', st.user]);
    return h('div', { class: 'card pioneertv-card' }, h('h3', {}, 'Anslutning'),
      h('div', { class: 'big' }, dot(cls), text), rows.length ? kv(rows) : '');
  }
  function systemCard(s) {
    const sys = s.system;
    return h('div', { class: 'card pioneertv-card' }, h('h3', {}, 'Pi:n'),
      h('div', { class: 'big' }, dot(sys.throttled_now ? 'bad' : sys.throttled_ever ? 'warn' : 'ok'), sys.temp_c != null ? `${sys.temp_c} °C` : sys.hostname),
      kv([['Ström', sys.throttled == null ? 'okänd' : sys.throttled_now ? 'underspänning / strypt nu' : sys.throttled_ever ? 'har strypts sedan start' : 'ok'],
        ['Minne', sys.mem_total_mb ? `${sys.mem_available_mb} MB ledigt av ${sys.mem_total_mb}` : '–'],
        ['Last', sys.load1 != null ? sys.load1.toFixed(2) : '–'], ['Upptid', fmtUptime(sys.uptime_s)],
        ['Disk', sys.disk && sys.disk.total_mb ? `${Math.round(sys.disk.free_mb / 1024)} GB ledigt` : '–'],
        ['Visar', s.page || '–']]));
  }

  const views = {
    async wifi(show) {
      const st = await status();
      show(h('h1', {}, 'Wi-Fi'), cards(netCard(st)), h('p', { class: 'muted spin' }, 'Söker nätverk…'));
      const nets = await api('GET', '/api/wifi/networks?rescan=1');
      const list = h('div', { class: 'list' });
      for (const n of nets) {
        const item = h('div', { class: 'item pioneertv-card' });
        const connectForm = h('div', { class: 'inline-form' });
        connectForm.hidden = true;
        const pw = h('input', { type: 'password', placeholder: 'Lösenord' });
        const connect = async () => {
          btn.disabled = true; btn.textContent = 'Ansluter…';
          try { const r = await api('POST', '/api/wifi/connect', { ssid: n.ssid, password: pw.value }); toast(r.ok ? `Ansluten till ${n.ssid}` : r.message); views.wifi(); }
          catch (e) { toast(`Misslyckades: ${e.message}`); btn.disabled = false; btn.textContent = 'Anslut'; }
        };
        pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
        connectForm.append(pw, h('button', { class: 'primary small', onclick: connect }, 'Anslut'));
        const btn = h('button', { class: 'small', onclick: () => {
          if (n.active) return;
          if (!n.security) return connect();
          connectForm.hidden = !connectForm.hidden;
          if (!connectForm.hidden) pw.focus();
        } }, n.active ? 'Ansluten' : 'Anslut');
        item.append(
          h('span', { class: 'bars' }, bars(n.signal)),
          h('div', { class: 'grow' }, h('div', { class: 'name' }, n.ssid), h('div', { class: 'sub' }, `${n.signal}% · ${n.security || 'öppet'}`), connectForm),
          btn,
          n.active ? h('button', { class: 'small danger', onclick: async () => { await api('POST', '/api/wifi/forget', { ssid: n.ssid }); toast('Glömt'); views.wifi(); } }, 'Glöm') : '',
        );
        list.append(item);
      }
      // Save a network that is not in range right now (home Wi-Fi before the box moves).
      const addSsid = h('input', { type: 'text', placeholder: 'Nätverkets namn (SSID)' });
      const addPw = h('input', { type: 'password', placeholder: 'Lösenord' });
      const addHidden = h('button', { class: 'toggle', role: 'switch', 'aria-checked': 'false', title: 'Dolt nätverk', onclick: (e) => e.currentTarget.setAttribute('aria-checked', String(e.currentTarget.getAttribute('aria-checked') !== 'true')) });
      const addBtn = h('button', { class: 'small', onclick: async () => {
        if (!addSsid.value.trim()) { toast('Skriv nätverkets namn'); return; }
        addBtn.disabled = true;
        try { const r = await api('POST', '/api/wifi/add', { ssid: addSsid.value.trim(), password: addPw.value, hidden: addHidden.getAttribute('aria-checked') === 'true' }); toast(r.ok ? `Sparade ${addSsid.value.trim()}` : r.message); views.wifi(); }
        catch (e) { toast(`Misslyckades: ${e.message}`); addBtn.disabled = false; }
      } }, 'Spara');
      const addForm = h('div', {}, h('h2', {}, 'Spara ett nätverk som inte är i närheten'),
        h('p', { class: 'muted' }, 'Boxen ansluter när nätverket dyker upp, till exempel hemma efter att den satts upp någon annanstans.'),
        h('div', { class: 'inline-form' }, addSsid, addPw, h('span', { class: 'hint' }, 'Dolt'), addHidden, addBtn));
      show(h('h1', {}, 'Wi-Fi'), cards(netCard(st)), h('div', { class: 'actions' }, h('button', { onclick: () => views.wifi() }, 'Sök igen')), list.childElementCount ? list : h('p', { class: 'muted' }, 'Inga nätverk hittades (Ethernet är ändå att föredra för strömning).'), addForm);
    },

    // Bluetooth: the devices (pads first among them), pairing, and whether
    // paired pads are called up by themselves.
    async bluetooth(show) {
      const s = await api('GET', '/api/settings');
      const settings = fieldsForm(s, ['controls_bt']);
      const draw = (devices, scanning) => {
        const list = h('div', { class: 'list' });
        for (const d of devices) {
          const state = d.connected ? 'Ansluten' : d.paired ? 'Parad, ej ansluten' : 'Ny enhet';
          list.append(h('div', { class: 'item pioneertv-card' },
            icon(d.icon === 'input-gaming' ? 'gamepad' : 'link'),
            h('div', { class: 'grow' }, h('div', { class: 'name' }, d.name), h('div', { class: 'sub' }, `${state} · ${d.mac}${d.battery != null ? ` · batteri ${d.battery}%` : ''}`)),
            !d.paired ? h('button', { class: 'small', onclick: () => bt('pair', d, 'Parar…') }, 'Para') : '',
            d.paired && !d.connected ? h('button', { class: 'small', onclick: () => bt('connect', d, 'Ansluter…') }, 'Anslut') : '',
            d.connected ? h('button', { class: 'small', onclick: () => bt('disconnect', d) }, 'Koppla från') : '',
            d.paired ? confirmBtn('Ta bort', 'small danger', () => bt('remove', d)) : '',
          ));
        }
        show(
          h('h1', {}, 'Bluetooth'),
          h('p', { class: 'muted' }, 'Sätt kontrollen i parningsläge (PS: håll Share + PS. Xbox: håll parningsknappen. 8BitDo: håll Select), sök sedan.'),
          h('div', { class: 'actions' }, h('button', { class: 'primary' + (scanning ? ' spin' : ''), disabled: scanning ? '' : null, onclick: scan }, scanning ? 'Söker (8 s)…' : 'Sök efter enheter')),
          list.childElementCount ? list : h('p', { class: 'muted' }, 'Inga Bluetooth-enheter kända.'),
          h('h2', {}, 'Inställningar'),
          settings.form, settings.save,
        );
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

    // Tjänster: Tailscale, and where the box's sources are, whether they
    // answer, and their keys, as passwords (left empty, a key set before is
    // kept). The home page's tiles are the settings file's
    // (/etc/pioneer-tv/settings.json), not set here.
    async services(show) {
      const [s, st] = await Promise.all([api('GET', '/api/settings'), status()]);
      const at = { romm: h('div', { class: 'cards' }, serviceCard()), jellyfin: h('div', { class: 'cards' }, serviceCard()) };
      const { form, save } = fieldsForm(s, ['romm', 'jellyfin'], true, at);
      show(
        h('h1', {}, 'Tjänster'),
        h('p', { class: 'muted' }, 'Spelen kommer från RomM, filmerna och musiken från Jellyfin. Nycklarna visas inte; lämna fältet tomt för att behålla den som är satt. Rutorna på startsidan står i /etc/pioneer-tv/settings.json.'),
        h('h2', {}, 'Tailscale'),
        cards(tailscaleCard(st)),
        form, save,
      );
      const svc = await api('GET', '/api/services').catch(() => ({}));
      at.romm.replaceChildren(serviceCard(svc.romm || { state: 'down' }));
      at.jellyfin.replaceChildren(serviceCard(svc.jellyfin || { state: 'down' }));
    },

    // Allmänt: how the box behaves on the screen, the screensaver first.
    async general(show) {
      const preview = (kind) => api('POST', '/api/saver/preview', { kind }).catch((e) => toast(`Misslyckades: ${e.message}`));
      return schemaView(show, 'general', 'Allmänt', h('div', {},
        h('h2', {}, 'Förhandsgranska skärmsläckaren'),
        h('p', { class: 'muted' }, 'Visa den nu på TV:n; nästa knapptryck tar bort den.'),
        h('div', { class: 'actions' },
          h('button', { onclick: () => preview('labyrint') }, 'Labyrint'),
          h('button', { onclick: () => preview('eld') }, 'Eld'))));
    },

    async controls(show) {
      const st = await status();
      return schemaView(show, 'controls', 'Kontroller', h('div', {},
        h('h2', {}, 'Tangentbord'),
        h('p', { class: 'muted' }, st.keyboard_present ? 'Ett tangentbord är anslutet, så skärmtangentbordet öppnas inte automatiskt.' : 'Ett USB-tangentbord fungerar direkt; när ett är anslutet öppnas inte skärmtangentbordet automatiskt.'),
        h('p', { class: 'muted' }, 'Fullständig knappmappning finns i /etc/pioneer-tv/config.toml.')));
    },
    async tv(show) {
      const topo = h('pre', { class: 'log small' }, 'Hämtar…');
      const trace = h('pre', { class: 'log small' }, 'Hämtar…');
      const rawIn = h('input', { type: 'text', placeholder: '--to 0 --give-device-power-status', style: 'min-width:360px' });
      const rawOut = h('pre', { class: 'log small' });
      rawOut.hidden = true;
      let traceTimer = null;
      const loadTopo = async () => { topo.textContent = await api('GET', '/api/cec/topology').catch((e) => `Fel: ${e.message}`); };
      const loadTrace = async () => {
        clearTimeout(traceTimer);
        if (!trace.isConnected) return;
        trace.textContent = (await api('GET', '/api/cec/trace').catch((e) => `Fel: ${e.message}`)) || '(inget ännu)';
        trace.scrollTop = trace.scrollHeight;
        traceTimer = setTimeout(loadTrace, 2000);
      };
      const runRaw = async () => {
        rawOut.hidden = false; rawOut.textContent = 'Kör…';
        try { const r = await api('POST', '/api/cec/raw', { args: rawIn.value }); rawOut.textContent = r.output || '(inget svar)'; }
        catch (e) { rawOut.textContent = `Fel: ${e.message}`; }
        loadTrace();
      };
      rawIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') runRaw(); });
      const debug = h('div', {},
        h('h2', {}, 'Testa'),
        h('div', { class: 'actions' },
          h('button', { onclick: () => cec('tv_on') }, 'TV på'), h('button', { onclick: () => cec('tv_off') }, 'TV av'),
          h('button', { onclick: () => cec('volume_up') }, 'Volym +'), h('button', { onclick: () => cec('volume_down') }, 'Volym −'),
          h('button', { onclick: () => cec('mute') }, 'Ljud av'),
          h('button', { onclick: () => cec('active_source') }, 'Byt till Pi-ingången'),
          h('button', { onclick: async () => { rawIn.value = '--to 0 --give-device-power-status'; runRaw(); } }, 'Fråga TV om ström')),
        h('h2', {}, 'Felsökning'),
        h('p', { class: 'muted' }, 'Bussen enligt cec-ctl. Pi:n ska stå som Playback Device och TV:n som logisk adress 0. Tryck på TV:ns fjärrkontroll och se om tryckningarna dyker upp i spåret nedan.'),
        h('div', { class: 'actions' }, h('button', { class: 'small', onclick: loadTopo }, 'Läs om topologin')),
        topo,
        h('h2', {}, 'Rått kommando'),
        h('p', { class: 'muted' }, 'Argument till cec-ctl (enheten läggs till automatiskt). Exempel: ', h('code', {}, '--to 0 --image-view-on'), ', ', h('code', {}, '--to 0 --user-control-pressed ui-cmd=volume-up'), '.'),
        h('div', { class: 'inline-form' }, rawIn, h('button', { class: 'small', onclick: runRaw }, 'Kör')),
        rawOut,
        h('h2', {}, 'CEC-spår'),
        h('p', { class: 'muted' }, '>> skickat av daemonen, << mottaget från bussen. Uppdateras varannan sekund.'),
        trace,
      );
      await schemaView(show, 'tv', 'TV', debug, cards(cecCard(await status())));
      loadTopo();
      loadTrace();
    },
    // The journal of each of the box's parts, and the CEC bus as the daemon
    // sees it. A picks a part (and fetches it again); the daemon's log and
    // the CEC trace follow live while they are on screen.
    async logs(show) {
      const pre = h('pre', { class: 'log log-full' }, 'Hämtar…');
      let timer = null;
      let unit = LOG_UNITS[0][0];
      const load = async () => {
        clearTimeout(timer);
        const now = unit;
        try {
          const text = await api('GET', now === 'cec' ? '/api/cec/trace' : `/api/logs?unit=${encodeURIComponent(now)}&lines=200`);
          if (!pre.isConnected || now !== unit) return;
          pre.textContent = text || '(tomt)';
        } catch (e) {
          if (!pre.isConnected) return;
          pre.textContent = `Kunde inte hämta loggen: ${e.message}`;
        }
        pre.scrollTop = pre.scrollHeight;
        if (pre.isConnected && (now === 'pioneer-tv-daemon' || now === 'cec')) timer = setTimeout(load, now === 'cec' ? 2000 : 5000);
      };
      const buttons = LOG_UNITS.map(([id, label]) => h('button', {
        class: `small${id === unit ? ' active' : ''}`,
        onclick: (e) => {
          unit = id;
          for (const b of buttons) b.classList.toggle('active', b === e.currentTarget);
          pre.textContent = 'Hämtar…';
          load();
        },
      }, label));
      show(h('h1', {}, 'Loggar'), h('div', { class: 'actions log-units' }, buttons), pre);
      load();
    },

    async system(show) {
      // ---- update from the git repo
      const upd = h('div', { class: 'card pioneertv-card update' });
      let pollTimer = null;
      let lastInfo = null;
      const drawUpdate = (info, st) => {
        clearTimeout(pollTimer);
        const running = st && st.running;
        const rows = [h('h3', {}, 'Programvara')];
        if (!info || info.available === false) {
          rows.push(h('p', { class: 'muted' }, (info && info.error) || 'Ingen git-utcheckning hittad. Installera med system/install.sh från ett klonat repo.'));
        } else {
          rows.push(h('div', { class: 'big' }, `Version ${info.commit}`, h('span', { class: 'hint' }, ` · ${info.branch} · ${info.date}`)));
          rows.push(h('p', { class: 'muted' }, info.subject));
          if (info.error) rows.push(h('p', { class: 'muted' }, dot('bad'), info.error));
          else if (info.behind > 0) {
            rows.push(h('p', {}, dot('warn'), `${info.behind} ${info.behind === 1 ? 'ny ändring' : 'nya ändringar'} på GitHub:`));
            rows.push(h('ul', { class: 'commits' }, info.commits.map((c) => h('li', {}, c))));
          } else if (info.remote) rows.push(h('p', {}, dot('ok'), 'Senaste versionen.'));
          if (info.dirty) rows.push(h('p', { class: 'muted' }, 'Lokala ändringar i repot; uppdateringen kräver en ren utcheckning.'));
        }
        if (st && st.last) {
          const d = new Date(st.last.time * 1000);
          rows.push(h('p', { class: 'hint' }, `Senaste körning ${d.toLocaleString('sv-SE')}: ${st.last.message} (${st.last.status})`));
        }
        rows.push(h('div', { class: 'actions' },
          h('button', { class: 'small', disabled: running ? '' : null, onclick: () => refreshUpdate(true) }, 'Sök efter uppdatering'),
          h('button', { class: 'small primary', disabled: running || !(info && info.behind > 0) ? '' : null, onclick: () => startUpdate() }, running ? 'Uppdaterar…' : 'Installera uppdatering'),
          confirmBtn('Installera om ändå', 'small', () => startUpdate(true))));
        if (st && (running || st.log)) {
          const pre = h('pre', { class: 'log small' }, st.log || '');
          rows.push(pre);
          pre.scrollTop = pre.scrollHeight;
        }
        upd.replaceChildren(...rows);
        if (running) pollTimer = setTimeout(async () => drawUpdate(info, await api('GET', '/api/update/status').catch(() => ({ running: true, log: 'Daemonen startar om…' }))), 2000);
      };
      const refreshUpdate = async (fetch) => {
        upd.replaceChildren(h('h3', {}, 'Programvara'), h('p', { class: 'muted spin' }, fetch ? 'Hämtar från GitHub…' : 'Läser version…'));
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
      const pics = h('div', { class: 'card pioneertv-card pics' }, h('h3', {}, 'Omslag på disken'), h('p', { class: 'muted spin' }, 'Räknar…'));
      const drawPics = async () => {
        let st;
        try { st = await api('GET', '/api/images'); } catch (e) { pics.replaceChildren(h('h3', {}, 'Omslag på disken'), h('p', { class: 'muted' }, e.message)); return; }
        const mb = (b) => `${Math.round(b / 1048576).toLocaleString('sv-SE')} MB`;
        pics.replaceChildren(
          h('h3', {}, 'Omslag på disken'),
          st.enabled
            ? h('p', {}, `${st.files.toLocaleString('sv-SE')} bilder, ${mb(st.bytes)} av högst ${mb(st.max_bytes)}.`)
            : h('p', { class: 'muted' }, 'Av (images.cache_mb är 0).'),
          h('p', { class: 'muted' }, `Omslag från RomM och bilder från Jellyfin, krympta till högst ${st.max_px || 600} px. De sparas första gången de visas${st.prefetch_at ? `, och alla hämtas varje natt kl ${st.prefetch_at}` : ''}; sedan kommer de från disken. De som inte använts på längst tid får gå när det blir fullt.`),
          st.last_night ? h('p', { class: 'hint' }, `Senaste natten ${new Date(st.last_night.time * 1000).toLocaleString('sv-SE')}: ${st.last_night.new} nya, ${st.last_night.had} fanns redan, ${st.last_night.failed} misslyckades (${Math.round(st.last_night.seconds / 60)} min).`) : '',
          st.enabled ? h('div', { class: 'actions' }, confirmBtn('Töm', 'small', async () => {
            try { await api('POST', '/api/images/clear'); toast('Tömt'); } catch (e) { toast(`Misslyckades: ${e.message}`); }
            drawPics();
          })) : '');
      };

      // ---- reached from elsewhere: over Tailscale, or with the key
      const [st, s] = await Promise.all([status(), api('GET', '/api/settings')]);
      const t = st.tailscale;
      const url = t.dns_name ? `https://${t.dns_name}/` : (t.ips || [])[0] ? `http://${t.ips[0]}:8765/` : null;
      const remote = fieldsForm(s, ['remote']);
      show(
        h('h1', {}, 'System'),
        cards(systemCard(st)),
        upd,
        pics,
        h('h2', {}, 'Fjärråtkomst'),
        h('p', { class: 'muted' }, 'Enklast: kör på Pi:n ', h('code', {}, 'sudo tailscale serve --bg 8765'), '. Då nås den här sidan från alla dina Tailscale-enheter på ', url ? h('a', { href: url }, url) : 'Pi:ns Tailscale-adress', ' utan öppna portar. Åtkomstnyckeln behövs bara om du binder daemonen till 0.0.0.0 i config.toml.'),
        remote.form, remote.save,
        h('h2', {}, 'Åtgärder'),
        h('div', { class: 'actions' },
          h('button', { onclick: () => sysAction('restart_ui') }, 'Starta om Chromium'),
          h('button', { onclick: () => sysAction('restart_daemon') }, 'Starta om daemon'),
          confirmBtn('Starta om Pi', 'danger', () => sysAction('reboot')),
          confirmBtn('Stäng av Pi', 'danger', () => sysAction('shutdown'))),
        h('p', { class: 'muted' }, 'Loggarna finns under ', h('a', { href: '#logs' }, 'Loggar'), '.'),
      );
      refreshUpdate(false);
      drawPics();
    },
  };

  // The fields of some sections of the settings' schema as a form, and
  // its Spara: { form, save }. titled: each section under its own heading,
  // and what at[id] holds after it.
  function fieldsForm(s, ids, titled, at = {}) {
    const values = {};
    const form = h('div');
    for (const id of ids) {
      const section = s.sections.find((x) => x.id === id);
      if (!section) continue;
      if (titled) form.append(h('h2', {}, section.title), at[id] || '');
      for (const f of section.fields) form.append(h('div', { class: 'field' }, h('label', {}, f.label), control(f, values)));
    }
    const save = h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: async () => {
      try { await api('PUT', '/api/settings', { values }); toast('Sparat'); } catch (e) { toast(`Misslyckades: ${e.message}`); }
    } }, 'Spara'));
    return { form, save };
  }
  // A field's control; what is changed goes into values.
  function control(f, values) {
    if (f.type === 'bool') {
      return h('button', { class: 'toggle', role: 'switch', 'aria-checked': String(!!f.value), onclick: (e) => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(v)); values[f.path] = v; } });
    }
    if (f.type === 'choice') {
      // One of a few: a button each, the chosen one pressed.
      const buttons = f.options.map(([value, label]) => h('button', { class: 'small choice', 'aria-pressed': String(f.value === value),
        onclick: (e) => { values[f.path] = value; for (const b of buttons) b.setAttribute('aria-pressed', String(b === e.currentTarget)); } }, label));
      return h('div', { class: 'choices' }, ...buttons);
    }
    if (f.type === 'number') {
      const num = h('input', { type: 'number', min: f.min, max: f.max, step: f.step, value: f.value, oninput: (e) => { values[f.path] = Number(e.target.value); } });
      return h('div', {}, num, f.unit ? h('span', { class: 'hint' }, ` ${f.unit}`) : '');
    }
    return h('input', { type: f.secret ? 'password' : 'text', value: f.value ?? '', maxlength: f.maxlength, autocomplete: f.secret ? 'new-password' : 'off',
      placeholder: f.secret ? (f.is_set ? '•••••••• (satt)' : 'inte satt') : '', oninput: (e) => { values[f.path] = e.target.value; } });
  }

  // lead: what stands before the form (the part's status).
  async function schemaView(show, id, title, extra, lead) {
    const s = await api('GET', '/api/settings');
    const { form, save } = fieldsForm(s, [id]);
    show(h('h1', {}, title), lead || '', form, save, extra || '');
  }

  async function cec(command) { try { await api('POST', '/api/cec', { command }); toast(`CEC: ${command}`); } catch (e) { toast(`CEC misslyckades: ${e.message}`); } }
  async function sysAction(action) { toast('Kör…'); try { const r = await api('POST', '/api/system', { action }); toast(r.ok ? 'Klart' : r.message); } catch (e) { toast(`Misslyckades: ${e.message}`); } }

  // ---------------------------------------------------------------- the column
  // The tabs, in groups: [group, [[view, name, icon]]]. Bluetooth first, and
  // where the page opens.
  const TABS = [
    ['Anslutet', [['bluetooth', 'Bluetooth', 'gamepad'], ['wifi', 'Wi-Fi', 'wifi'], ['services', 'Tjänster', 'link']]],
    ['Boxen', [['general', 'Allmänt', 'home'], ['tv', 'TV', 'tv'], ['controls', 'Kontroller', 'keyboard']]],
    ['Underhåll', [['system', 'System', 'gear'], ['logs', 'Loggar', 'pulse']]],
  ];
  // Old tabs' addresses.
  const MOVED = { gamepads: 'bluetooth', status: 'bluetooth', remote: 'system' };
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
    for (const m of nav.querySelectorAll('.rail-mark:empty')) m.innerHTML = PioneerTV.icons.html(m.dataset.icon);
  };
  icons();
  window.addEventListener('load', icons);
  // The pointer opens it too, as on the browse pages.
  rail.addEventListener('mousemove', (e) => { if (e.movementX || e.movementY) rail.classList.add('open'); });
  rail.addEventListener('mouseover', (e) => { if (!e.isTrusted) rail.classList.add('open'); });
  rail.addEventListener('mouseout', (e) => { if (!rail.contains(e.relatedTarget)) rail.classList.remove('open'); });
  // Into the column from the view: to the tab shown, wherever the arrow
  // pointed. Within it, a tab's ring with the focus shows that tab, so up
  // and down go through them.
  nav.addEventListener('focusin', (e) => {
    const view = e.target && e.target.dataset && e.target.dataset.view;
    if (!view) return;
    if (!nav.contains(e.relatedTarget)) {
      const here = nav.querySelector('.rail-item.active .rail-mark');
      if (here && here !== e.target) { here.focus(); return; }
    }
    if (location.hash !== '#' + view) location.hash = '#' + view;
  });

  // ---------------------------------------------------------------- routing
  function route() {
    let view = (location.hash || '#bluetooth').slice(1);
    view = MOVED[view] || (views[view] ? view : 'bluetooth');
    for (const it of nav.querySelectorAll('.rail-item')) {
      it.classList.toggle('active', it.dataset.view === view);
      // The page opens with the focus on the tab shown.
      it.firstChild.toggleAttribute('data-pioneertv-initial', it.dataset.view === view);
    }
    // Each route renders into its own element, so a slow view from an earlier
    // route can never overwrite the current one.
    const gen = ++generation;
    const el = h('div');
    mainHost.replaceChildren(el);
    const show = (...children) => { if (gen === generation) el.replaceChildren(...children); };
    views[view](show).catch((e) => { show(h('h1', {}, 'Fel'), h('p', {}, e.message)); });
  }
  window.addEventListener('hashchange', route);
  // X (the pad's, as Space) presses the view's filled button wherever the
  // focus is, as on every page of the box: the one in the form the focus is
  // in, else the first in sight. Not while typing (a field, the keyboard).
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || e.repeat) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    if (document.documentElement.classList.contains('pioneertv-keyboard-open')) return;
    const all = [...mainHost.querySelectorAll('button.primary:not([disabled])')].filter((b) => b.offsetParent);
    const near = a && all.find((b) => b.parentElement && b.parentElement.contains(a));
    const button = near || all[0];
    if (!button) return;
    e.preventDefault();
    button.click();
  });
  route();
  api('GET', '/api/status').then((s) => { $('#foot').textContent = `Maskinrepubliken · ${s.system.hostname} · ${s.git && s.git.commit ? s.git.commit : 'v' + s.version}${MOCK ? ' · mock' : ''}`; }).catch(() => {});
})();
