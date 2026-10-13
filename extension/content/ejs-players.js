// Pioneer TV: who is player 1 in an EmulatorJS game (RomM's web player).
//
// Runs in the page's own world, where EmulatorJS lives. EmulatorJS gives each
// gamepad that shows up the first free player slot, in the order the browser
// lists them. With two identical pads switched on (two 8BitDo Ultimate 2C,
// say), the one with the lower index becomes player 1 whoever holds it, and
// the pad in your hands can end up as player 2 in a one-player game: it does
// nothing. Here the pad that presses a button first becomes player 1, the
// next pad to press becomes player 2, and so on; pads that never pressed fill
// the slots after them.
(() => {
  const order = [];                                  // "id_index" in first-press order
  const key = (g) => g.id + '_' + g.index;

  function tick() {
    const E = window.EJS_emulator;
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
