// Pioneer TV: no "Leave site?" dialogs.
//
// Runs in the page's own world, before any of its scripts. A page can ask the
// browser to confirm before it is left (RomM's game player does, through its
// beforeunload handler), and on the TV that dialog lands on top of the page
// when Home is held: a box with no mouse in sight, and the reason we are
// leaving is that the person holding the pad asked to. The page's handlers
// still run, so anything they save on the way out is saved; only their
// request for the dialog is dropped.
(() => {
  // Registered before any page script, so it runs first on every beforeunload
  // and disarms the two ways a listener asks for the dialog.
  window.addEventListener('beforeunload', (ev) => {
    try {
      Object.defineProperty(ev, 'preventDefault', { value() {}, configurable: true });
      Object.defineProperty(ev, 'returnValue', { get: () => '', set() {}, configurable: true });
    } catch {}
  }, true);

  // The third way: window.onbeforeunload returning a string. Keep the handler
  // but throw away what it returns.
  const desc = Object.getOwnPropertyDescriptor(window, 'onbeforeunload')
    || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'onbeforeunload');
  if (desc && desc.set && desc.configurable !== false) {
    let user = null;
    Object.defineProperty(window, 'onbeforeunload', {
      configurable: true,
      get: () => user,
      set(fn) {
        user = typeof fn === 'function' ? fn : null;
        desc.set.call(window, user && function (ev) { try { user.call(this, ev); } catch {} });
      },
    });
  }
})();
