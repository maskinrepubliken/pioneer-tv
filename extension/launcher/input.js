// Pioneer TV start page: tells the screensaver of every key, loaded before
// the shell's scripts. The spatial navigation stops the keys it handles
// (downs and ups alike) before any listener added after it sees them, so
// this one has to come first (launcher.js, the screensaver).
window.PioneerTV = window.PioneerTV || {};
window.addEventListener('keydown', () => { if (window.PioneerTV.onInput) window.PioneerTV.onInput(); }, true);
