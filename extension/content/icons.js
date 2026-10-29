// Pioneer TV icons: simple line icons drawn as inline SVG, stroke follows
// the text colour. Same API the old bitmap set had:
//   PioneerTV.icons.svg('wifi') → <svg>, PioneerTV.icons.html('wifi') → string.
window.PioneerTV = window.PioneerTV || {};
(function (P) {
  // 24x24 viewBox, stroke width 1.8, round caps and joins.
  const PATHS = {
    wifi: '<path d="M2.5 9.5a14 14 0 0 1 19 0"/><path d="M5.7 13a9.5 9.5 0 0 1 12.6 0"/><path d="M9 16.4a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none"/>',
    ethernet: '<rect x="4" y="9" width="16" height="10" rx="2"/><path d="M8 19v-3M12 19v-3M16 19v-3M12 9V5M7 5h10"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4"/>',
    gamepad: '<path d="M7 8h10a5 5 0 0 1 4.6 6.9l-1.1 2.6a2 2 0 0 1-3.4.5L15.5 16h-7l-1.6 2a2 2 0 0 1-3.4-.5l-1.1-2.6A5 5 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11.5" r="0.9" fill="currentColor" stroke="none"/><circle cx="18" cy="13.5" r="0.9" fill="currentColor" stroke="none"/>',
    temp: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a3.5 3.5 0 1 1-4 0z"/><path d="M12 10v6"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    gear: '<path d="M18.5 13.1L20.0 14.5L18.1 17.7L16.2 17.1L14.3 18.2L13.9 20.2L10.1 20.2L9.7 18.2L7.8 17.1L5.9 17.7L4.0 14.5L5.5 13.1L5.5 10.9L4.0 9.5L5.9 6.3L7.8 6.9L9.7 5.8L10.1 3.8L13.9 3.8L14.3 5.8L16.2 6.9L18.1 6.3L20.0 9.5L18.5 10.9z"/><circle cx="12" cy="12" r="2.5"/>',
    // The pad's Home button (the 8BitDo Ultimate 2C's): 8BitDo's mark, a
    // heart of squares set like a chequerboard.
    padHome: '<g fill="currentColor" stroke="none"><rect x="7.3" y="5.7" width="3" height="3" rx="0.4"/><rect x="13.7" y="5.7" width="3" height="3" rx="0.4"/><rect x="4.1" y="8.9" width="3" height="3" rx="0.4"/><rect x="10.5" y="8.9" width="3" height="3" rx="0.4"/><rect x="16.9" y="8.9" width="3" height="3" rx="0.4"/><rect x="7.3" y="12.1" width="3" height="3" rx="0.4"/><rect x="13.7" y="12.1" width="3" height="3" rx="0.4"/><rect x="10.5" y="15.3" width="3" height="3" rx="0.4"/></g>',
    keyboard: '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h.01M11 11h.01M15 11h.01M7 14.5h10"/>',
    back: '<path d="M10 6l-6 6 6 6"/><path d="M4 12h16"/>',
    reload: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    power: '<path d="M12 4v8"/><path d="M7.5 7.5a6.5 6.5 0 1 0 9 0"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    volume: '<path d="M4 10v4h3l4 3V7l-4 3H4z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10"/>',
    mute: '<path d="M4 10v4h3l4 3V7l-4 3H4z"/><path d="M16 10l4 4M20 10l-4 4"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
    radio: '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M7 9l10-5"/><circle cx="15.5" cy="14.5" r="2.5"/><path d="M6.5 13h4M6.5 16h4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/>',
    shift: '<path d="M12 4l7 8h-4v7H9v-7H5z"/>',
    backspace: '<path d="M8 6h12v12H8l-5-6z"/><path d="M12 10l4 4M16 10l-4 4"/>',
    dot: '<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
    // The daemon: a small devil's head, horns and a grin.
    daemon: '<path d="M5 3.5c-.3 3 .6 5 2.6 6.2"/><path d="M19 3.5c.3 3-.6 5-2.6 6.2"/><circle cx="12" cy="14" r="6.5"/><path d="M9.2 12.6l1.6.8M14.8 12.6l-1.6.8"/><path d="M9.3 16.3c1.6 1.3 3.8 1.3 5.4 0"/>',
    arrowUp: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
    arrowLeft: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    play: '<path d="M8 6v12l10-6z"/>',
    // The browse page's fixed ways in (its column): what was played last,
    // the collections, the playlists, the albums, the artists.
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    stack: '<rect x="4" y="11" width="16" height="9" rx="1.2"/><path d="M6 8h12M8 5h8"/>',
    playlist: '<path d="M4 6.5h11M4 11h11M4 15.5h6"/><path d="M17 18.5V9.5l3.5-1"/><circle cx="15.2" cy="18.5" r="1.8"/>',
    vinyl: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5"/>',
    person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    // Consoles, for the Spel library's column (libraries/spel.js): each by
    // its pad or its look, drawn as plainly as the rest.
    nes: '<rect x="2" y="6.5" width="20" height="11" rx="1.2"/><path d="M4.6 12h4M6.6 10v4"/><g fill="currentColor" stroke="none"><circle cx="15.6" cy="13.3" r="1.25"/><circle cx="18.8" cy="13.3" r="1.25"/></g>',
    snes: '<path d="M7.5 6.5h9a5.5 5.5 0 0 1 0 11h-9a5.5 5.5 0 0 1 0-11z"/><path d="M4.8 12h4M6.8 10v4"/><g fill="currentColor" stroke="none"><circle cx="16.8" cy="9.9" r="1"/><circle cx="16.8" cy="14.1" r="1"/><circle cx="14.7" cy="12" r="1"/><circle cx="18.9" cy="12" r="1"/></g>',
    n64: '<path d="M5 7.5h14a2 2 0 0 1 2 2.4l-1.4 5a1.4 1.4 0 0 1-2.6.3l-1.5-2.7h-1.7l-.4 5a1.4 1.4 0 0 1-2.8 0l-.4-5H8.5L7 15.2a1.4 1.4 0 0 1-2.6-.3L3 9.9a2 2 0 0 1 2-2.4z"/><circle cx="12" cy="10.3" r="1"/>',
    genesis: '<path d="M8 6.5h8c3.6 0 6 2.4 6 5.5s-2.4 5.5-6 5.5H8c-3.6 0-6-2.4-6-5.5S4.4 6.5 8 6.5z"/><path d="M4.8 12h4M6.8 10v4"/><g fill="currentColor" stroke="none"><circle cx="13.8" cy="13.6" r="1.1"/><circle cx="16.4" cy="12.3" r="1.1"/><circle cx="19" cy="11" r="1.1"/></g>',
    gameboy: '<path d="M6.5 2.5h11a1 1 0 0 1 1 1V18a3.5 3.5 0 0 1-3.5 3.5h-8.5a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z"/><rect x="8.5" y="5" width="7" height="6" rx=".5"/><path d="M7.8 16.2h3M9.3 14.7v3"/><g fill="currentColor" stroke="none"><circle cx="16" cy="14.8" r="1"/><circle cx="14" cy="16.8" r="1"/></g>',
    gba: '<rect x="2" y="6.5" width="20" height="11" rx="3.8"/><rect x="8.5" y="8.7" width="7" height="6.6" rx=".5"/><path d="M3.9 12h2.8M5.3 10.6v2.8"/><g fill="currentColor" stroke="none"><circle cx="18.6" cy="11" r="0.95"/><circle cx="17.2" cy="13.2" r="0.95"/></g>',
    floppy: '<path d="M5 3.5h11.5L20.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M8 3.5v5h7v-5M13 5v2"/><rect x="7" y="13" width="10" height="7.5"/>',
    disc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 6a6 6 0 0 0-6 6"/>',
    arcade: '<circle cx="12" cy="6.5" r="2.5"/><path d="M12 9v6"/><path d="M5 16h14l1.5 4.5h-17z"/>',
  };

  function html(name, cls = '') {
    const body = PATHS[name] || PATHS.dot;
    return `<svg class="pioneertv-icon ${cls}" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  function svg(name, cls = '') {
    const tpl = document.createElement('template');
    tpl.innerHTML = html(name, cls);
    return tpl.content.firstElementChild;
  }

  // A button of the pad, drawn as it is on the pad (paper.css
  // .pioneertv-kbd): A, B, X and Y round, L1 and R1 as bumpers, the d-pad
  // a cross with the arms meant in ink ('◀ ▶', '▲ ▼'; 'arrows', all of it,
  // none marked), Hem the pad's own round home button.
  const ARMS = { left: 'M3 9.5h6.5v5H3z', right: 'M14.5 9.5H21v5h-6.5z', up: 'M9.5 3h5v6.5h-5z', down: 'M9.5 14.5h5V21h-5z' };
  const DPAD = { '◀ ▶': ['left', 'right'], '▲ ▼': ['up', 'down'], '◀': ['left'], '▶': ['right'], '▲': ['up'], '▼': ['down'], arrows: [] };
  function key(name) {
    const k = document.createElement('kbd');
    k.className = 'pioneertv-kbd';
    if (/^[ABXY]$/.test(name)) {
      k.classList.add('pioneertv-kbd--face');
      k.textContent = name;
    } else if (/^[LR][12]$/.test(name)) {
      k.classList.add('pioneertv-kbd--shoulder', `pioneertv-kbd--${name[0] === 'L' ? 'left' : 'right'}`);
      k.textContent = name;
    } else if (DPAD[name]) {
      k.classList.add('pioneertv-kbd--dpad');
      k.setAttribute('aria-label', name === 'arrows' ? 'styrkorset' : name);
      k.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="cross" d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z"/>'
        + DPAD[name].map((a) => `<path class="arm" d="${ARMS[a]}"/>`).join('') + '</svg>';
    } else if (name === 'Hem') {
      k.classList.add('pioneertv-kbd--home');
      k.setAttribute('aria-label', 'Hem');
      k.innerHTML = html('padHome');
    } else k.textContent = name;
    return k;
  }

  P.icons = { html, svg, key, names: Object.keys(PATHS) };
})(window.PioneerTV);
