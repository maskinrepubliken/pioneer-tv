// Pioneer TV: who is player 1 in an EmulatorJS game (RomM's web player).
//
// Runs in the page's own world, where EmulatorJS lives. EmulatorJS gives each
// gamepad that shows up the first free player slot, in the order the browser
// lists them. With two identical pads switched on (two 8BitDo Ultimate 2C,
// say), the one with the lower index becomes player 1 whoever holds it, and
// the pad in your hands can end up as player 2 in a one-player game: it does
// nothing. Here the pad that presses a button first becomes player 1, the
// next pad to press becomes player 2, and so on; pads that never pressed fill
// the slots after them. It also works around an EmulatorJS bug that left the
// remaining pad dead when another one disconnected (fixIndices below).
(() => {
  const order = [];                                  // "id_index" in first-press order
  const key = (g) => g.id + '_' + g.index;

  // EmulatorJS bug: its handler keeps the pads in a compacted, sorted list,
  // but marks every event with the browser's gamepad index and then looks the
  // pad up by that number as a list position. Once a pad with a lower index
  // has gone (switched off, asleep), the positions no longer match: every
  // press throws "Cannot read properties of undefined (reading 'id')" and the
  // pad still in your hands does nothing. Measured on the box with two virtual
  // pads. So events are rewritten to carry the list position before they are
  // dispatched; "disconnected" keeps the browser index, which is what its own
  // handler searches by.
  function fixIndices(handler) {
    if (!handler || handler.__pioneerIndexFix || typeof handler.dispatchEvent !== 'function') return;
    const dispatch = handler.dispatchEvent.bind(handler);
    handler.dispatchEvent = (name, data) => {
      if (name !== 'disconnected' && data && typeof data.gamepadIndex === 'number' && Array.isArray(handler.gamepads)) {
        const pos = handler.gamepads.findIndex((g) => g && g.index === data.gamepadIndex);
        if (pos >= 0 && pos !== data.gamepadIndex) data = Object.assign({}, data, { gamepadIndex: pos });
      }
      return dispatch(name, data);
    };
    // Its polling loop has no error handling either: one exception and it
    // never schedules itself again, so every pad is dead until the page is
    // reloaded. Keep it going whatever a single round throws.
    if (typeof handler.loop === 'function' && typeof handler.updateGamepadState === 'function') {
      handler.loop = function () {
        try { this.updateGamepadState(); } catch (err) { console.warn('[pioneer-tv] gamepad poll:', err); }
        this.timeout = setTimeout(this.loop.bind(this), 10);
      };
    }
    handler.__pioneerIndexFix = true;
  }

  function tick() {
    const E = window.EJS_emulator;
    if (E && E.gamepad) fixIndices(E.gamepad);
    if (E && Array.isArray(E.gamepadSelection) && navigator.getGamepads) {
      const pads = [...navigator.getGamepads()].filter(Boolean);
      const live = new Set(pads.map(key));
      for (let i = order.length - 1; i >= 0; i--) if (!live.has(order[i])) order.splice(i, 1);
      for (const g of pads) {
        if (!order.includes(key(g)) && g.buttons.some((b) => b.pressed)) order.push(key(g));
      }
      if (order.length) {
        const want = order.concat(pads.map(key).filter((k) => !order.includes(k))).slice(0, 4);
        while (want.length < 4) want.push('');
        if (want.join('|') !== E.gamepadSelection.join('|')) {
          E.gamepadSelection.splice(0, E.gamepadSelection.length, ...want);
          try { if (typeof E.updateGamepadLabels === 'function') E.updateGamepadLabels(); } catch {}
        }
      }
    }
    // Quick while a game runs, idle otherwise (one property check a second).
    setTimeout(tick, window.EJS_emulator ? 50 : 1000);
  }
  tick();
})();
