// Pioneer TV video player: a film, an episode or a clip, played on the box
// in mpv. This page plays nothing: the daemon (daemon/pioneertv/video.py)
// starts mpv, whose window covers the page; behind it the page shows a
// full-screen message (shared/screen.js): "Startar…", "Slut", or what went
// wrong. Nothing plays on by itself, not even the next episode. B after the
// end (or an error) goes back to browsing, which is drawn again (the
// position has moved).
//
//   M.players.video.play({ id, name, series, source }, at, { audio, subtitle })
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const player = {
    state: 'idle',                    // idle | starting | running | ended | error
    noKeyboard: true,                 // Y (Sök) does nothing over it (main.js)
    isOpen() { return M.screen.isOpen(); },
    show(text, hint) {
      M.screen.show(text, hint);
      M.nav.captured = this;
    },
    close(ended = false) {
      M.screen.hide();
      this.state = 'idle';
      if (M.nav.captured === this) M.nav.captured = null;
      // after(ended): what was under it takes the pad again (the picture
      // viewer, on to the next when the clip played to its end).
      const after = this.after;
      this.after = null;
      if (after) after(ended);
      else if (M.browse) M.browse.route();
    },
    // Only B does anything here (once the video has ended or failed); while
    // mpv plays, its window has the keys.
    onKeyDown(e) {
      if (e.key === 'Escape' && (this.state === 'ended' || this.state === 'error')) this.close();
    },

    async play(v, at, tracks = {}) {
      this.state = 'starting';
      this.show('Startar…', v.series ? `${v.series} · ${v.name}` : v.name);
      let r;
      try {
        const resp = await fetch('/api/video/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // source 'immich': a clip of Bilder's (players/photo.js), else Jellyfin's.
          body: JSON.stringify({ id: v.id, start: at, audio: tracks.audio, subtitle: tracks.subtitle, source: v.source, name: v.name }),
        });
        r = await resp.json().catch(() => ({}));
      } catch {
        r = { ok: false, message: 'Boxen svarar inte' };
      }
      const source = v.source === 'immich' ? 'Immich' : 'Jellyfin';
      if (r.ok === false) this.failed(r.message === 'no_key' ? `Lägg in en API-nyckel för ${source} under Inställningar → Tjänster` : r.message);
    },

    failed(text) {
      this.state = 'error';
      this.show(text || 'Filmen kunde inte startas', 'Tryck B för att gå tillbaka');
    },

    // The sound and subtitles chosen last time for this series (or film).
    async lastChoice(key) {
      try {
        const r = await fetch(`/api/video?key=${encodeURIComponent(key)}`);
        return (await r.json()).choice || {};
      } catch {
        return {};                     // the preview has no daemon
      }
    },
  };

  M.bridge.on('video', (e) => {
    if (player.state === 'idle') return;
    if (e.state === 'running') {
      player.state = 'running';
      M.screen.show('');               // mpv covers it; nothing to read behind
    } else if (e.state === 'ended' && player.after) {
      player.close(true);               // a clip of Bilder's: the viewer goes on to the next
    } else if (e.state === 'ended') {
      player.state = 'ended';
      player.show('Slut', 'Tryck B för att fortsätta');
    } else if (e.state === 'stopped') player.close();
    else if (e.state === 'error') player.failed(e.message);
  });

  M.players = M.players || {};
  M.players.video = player;
})(window.PioneerTV);
