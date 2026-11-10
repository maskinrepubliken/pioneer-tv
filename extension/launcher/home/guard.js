// Pioneer TV home page guard: the home page must never stay empty. Seen on
// the box (2026-11-10): the page had stopped after twelve of its sixteen
// scripts, nothing drawn and nothing to press. Loaded first, in the head:
// what goes wrong is told to the daemon's log, and if no sheet has been
// drawn a while after the page began, it loads again (sooner the first
// times, then every half minute, until it comes up).
(function () {
  const CHECK_MS = 8000;
  const say = (text) => {
    try { chrome.runtime.sendMessage({ type: 'daemon', payload: { type: 'debug', text: `home: ${text}`.slice(0, 500) } }); } catch { /* no extension: the simulator */ }
  };
  const errors = [];
  window.addEventListener('error', (e) => {
    const what = e.target && e.target.src ? `could not load ${e.target.src.split('/').slice(-2).join('/')}`
      : `${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno})`;
    errors.push(what);
    say(what);
  }, true);
  window.addEventListener('unhandledrejection', (e) => say(`unhandled: ${e.reason && (e.reason.message || e.reason)}`));

  setTimeout(() => {
    if (document.querySelector('.tiles-sheet')) { try { sessionStorage.removeItem('pioneertv-home-tries'); } catch {} return; }
    let tries = 0;
    try { tries = Number(sessionStorage.getItem('pioneertv-home-tries')) || 0; sessionStorage.setItem('pioneertv-home-tries', String(tries + 1)); } catch {}
    say(`nothing drawn after ${CHECK_MS / 1000} s (${document.scripts.length} scripts, ${document.readyState}${errors.length ? ', ' + errors.join('; ') : ''}); loading again (#${tries + 1})`);
    setTimeout(() => location.reload(), tries < 3 ? 0 : 30000);
  }, CHECK_MS);
})();
