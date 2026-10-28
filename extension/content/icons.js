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
    gear: '<path d="M18.7 10L21 10.1L21 13.9L18.7 14L18.2 15.3L19.7 17L17 19.7L15.3 18.2L14 18.7L13.9 21L10.1 21L10 18.7L8.7 18.2L7 19.7L4.3 17L5.8 15.3L5.3 14L3 13.9L3 10.1L5.3 10L5.8 8.7L4.3 7L7 4.3L8.7 5.8L10 5.3L10.1 3L13.9 3L14 5.3L15.3 5.8L17 4.3L19.7 7L18.2 8.7z"/><circle cx="12" cy="12" r="3"/>',
    // The pad's Home button (the 8BitDo Ultimate 2C's): a ring round
    // 8BitDo's mark, a heart of squares set like a chequerboard.
    padHome: '<circle cx="12" cy="12" r="9.2"/><g fill="currentColor" stroke="none"><rect x="7.95" y="6.6" width="2.4" height="2.4" rx="0.35"/><rect x="13.35" y="6.6" width="2.4" height="2.4" rx="0.35"/><rect x="5.25" y="9.3" width="2.4" height="2.4" rx="0.35"/><rect x="10.65" y="9.3" width="2.4" height="2.4" rx="0.35"/><rect x="16.05" y="9.3" width="2.4" height="2.4" rx="0.35"/><rect x="7.95" y="12" width="2.4" height="2.4" rx="0.35"/><rect x="13.35" y="12" width="2.4" height="2.4" rx="0.35"/><rect x="10.65" y="14.7" width="2.4" height="2.4" rx="0.35"/></g>',
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

  P.icons = { html, svg, names: Object.keys(PATHS) };
})(window.PioneerTV);
