// Pioneer TV HUD, the pages' part: a page draws no toast, menu or
// screensaver of its own. Those are the overlay's (overlay/hud.js, over every
// window); a page's toast is sent there through the daemon. What stays here
// is the pad's colours, which a page's own focus ring wears.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const hud = {
    toast(text, icon = '', ms = 1800) {
      M.bridge.daemon({ type: 'toast', text, icon, ms });
    },
  };

  // The pad in use lends the pointer its colour, the focus ring its accent
  // and everything ochre its highlight (the pink and the green 8BitDo;
  // [pads] in the config). A pad without colours leaves the design system's.
  // The change fades (content.css registers these as colours).
  hud.applyPad = function (pad) {
    const root = document.documentElement;
    if (!root) return;
    const set = (name, value) => (value ? root.style.setProperty(name, value) : root.style.removeProperty(name));
    set('--pioneertv-pointer-fill', pad && pad.pointer);
    set('--pioneertv-focus', pad && pad.accent);
    set('--pioneertv-ochre', pad && pad.highlight);
    set('--pioneertv-focus-on-dark', pad && pad.highlight);
    // Text on the highlight: ink on a light one, paper on a dark one.
    set('--pioneertv-on-ochre', pad && pad.highlight && dark(pad.highlight) ? 'var(--pioneertv-on-dark)' : null);
  };
  function dark(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return false;
    const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18;
  }

  // Every page starts in the design system's own colours (ochre); the pad's
  // colours come with its first press there.
  hud.listen = function (b) {
    b.on('active_pad', (e) => hud.applyPad(e.pad));
  };

  M.hud = hud;
})(window.PioneerTV);
