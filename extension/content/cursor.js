// Pioneer TV virtual pointer.
//
// There is no Wayland pointer on the box (Weston, the display before labwc,
// aborted the moment a client cursor reached the hardware cursor plane). The daemon
// streams right-stick motion as "pointer" events instead, and this script
// draws a paper arrow, moves it, and delivers hover, clicks and
// edge-scrolling to whatever is under it. While the arrow is on screen A
// (Enter) always clicks what is under it, and what it is over is drawn as
// selected and takes the focus (spatial-nav.js pointerOver; the overlay's
// menus and the keyboard their own), so the arrows go on from there.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const ARROW = '<svg viewBox="0 0 24 36" width="24" height="36" aria-hidden="true">'
    + '<path d="M3 2.5 L3 27 L9.5 21.5 L14 31 L18 29.2 L13.6 19.8 L21 19.2 Z" fill="#f4efe4" stroke="#1c1613" stroke-width="1.6" stroke-linejoin="round"/>'
    + '</svg>';
  const ACTIVE_MS = 5000;   // A clicks at the pointer this long after it last moved
  const EDGE = 28;          // px from the edge where the page scrolls
  const state = { x: 0, y: 0, lastMove: 0, hover: null, marked: null, el: null, hideTimer: null, pressed: false, initialised: false };
  const CLICKABLE = 'a[href], button, input, select, textarea, summary, [role="button"], [role="menuitem"], [role="tab"], [tabindex]';

  function ensure() {
    if (state.el && state.el.isConnected) return state.el;
    const el = document.createElement('div');
    el.className = 'pioneertv-cursor';
    el.setAttribute('data-pioneertv-overlay', '');
    el.innerHTML = ARROW;
    state.el = el;
    if (M.bridge && M.bridge.mount) M.bridge.mount(el);        // top layer: drawn over fullscreen video too
    else (document.documentElement || document.body).appendChild(el);
    if (!state.initialised) { state.x = Math.round(window.innerWidth / 2); state.y = Math.round(window.innerHeight / 2); state.initialised = true; }
    return el;
  }

  // Pointer mode: the arrow is shown. The page's focus ring hides meanwhile
  // (spatial-nav keeps track of the focus and brings the ring back).
  function pointerMode(on) {
    const root = document.documentElement;
    if (!root || root.classList.contains('pioneertv-pointer') === on) return;
    root.classList.toggle('pioneertv-pointer', on);
    // Off: the ring back on the focus (which the pointer may have moved,
    // spatial-nav.js pointerOver). On: it stays where the pointer puts it.
    if (!on && M.nav) { M.nav.hovering = false; if (M.nav.ring) M.nav.ring(true); }
  }

  function hideArrow() {
    if (state.marked) { state.marked.classList.remove('pioneertv-hover'); state.marked = null; state.hover = null; }
    clearTimeout(state.hideTimer);
    if (state.el) state.el.classList.remove('pioneertv-cursor-show');
    pointerMode(false);
  }

  function draw() {
    const el = ensure();
    el.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
    el.classList.add('pioneertv-cursor-show');
    pointerMode(true);
    clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => { state.lastMove = 0; hideArrow(); }, ACTIVE_MS);
  }

  // What the pointer is over. In fullscreen the browser's hit test does not
  // see our overlays (they are popovers in the top layer, next to the
  // fullscreen element; measured on the box: elementFromPoint returned the
  // video under the open menu), so there the open overlays are searched
  // first, the most recently shown on top, its deepest element under the point.
  function overlayAt(x, y) {
    const inside = (r) => r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const layers = [...document.querySelectorAll('[data-pioneertv-overlay]')]
      .filter((e) => e !== state.el && !e.classList.contains('pioneertv-toast') && (!e.matches || e.matches(':popover-open')));
    for (let i = layers.length - 1; i >= 0; i--) {
      const root = layers[i];
      if (!inside(root.getBoundingClientRect())) continue;
      let hit = root;
      for (const el of root.querySelectorAll('*')) {
        if (inside(el.getBoundingClientRect()) && getComputedStyle(el).pointerEvents !== 'none') hit = el;
      }
      return hit;
    }
    return null;
  }

  function under() {
    if (document.fullscreenElement) {
      const o = overlayAt(state.x, state.y);
      if (o) return o;
    }
    const el = state.el;
    if (el) el.style.visibility = 'hidden';
    const t = document.elementFromPoint(state.x, state.y);
    if (el) el.style.visibility = '';
    return t;
  }

  function mouseInit(type, extra = {}) {
    return { bubbles: true, cancelable: true, composed: true, view: window, clientX: state.x, clientY: state.y, screenX: state.x, screenY: state.y, ...extra };
  }

  function fire(target, type, extra) {
    if (!target) return;
    const init = mouseInit(type, extra);
    if (window.PointerEvent && type.startsWith('mouse')) {
      target.dispatchEvent(new PointerEvent(type.replace('mouse', 'pointer'), { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    }
    target.dispatchEvent(new MouseEvent(type, init));
  }

  // Motion arrives from the daemon many times a second. Steps are summed and
  // applied on the next animation frame, and the hit test behind hover (which
  // forces layout) runs at most every HOVER_MS, so a busy page keeps up with
  // the stick instead of queueing behind it.
  const HOVER_MS = 80;
  const pending = { dx: 0, dy: 0, frame: 0, settle: 0 };
  let hoverAt = 0;

  function move(dx, dy) {
    pending.dx += dx;
    pending.dy += dy;
    if (!pending.frame) pending.frame = requestAnimationFrame(flush);
  }

  function flush() {
    if (pending.frame) { cancelAnimationFrame(pending.frame); pending.frame = 0; }
    const dx = pending.dx, dy = pending.dy;
    pending.dx = pending.dy = 0;
    if (!dx && !dy) return;
    ensure();
    state.x = Math.max(0, Math.min(window.innerWidth - 1, state.x + dx));
    state.y = Math.max(0, Math.min(window.innerHeight - 1, state.y + dy));
    state.lastMove = Date.now();
    draw();
    // Edge scrolling: pushing against the top or bottom moves the page.
    if (state.y >= window.innerHeight - EDGE && dy > 0) window.scrollBy(0, Math.max(8, dy * 3));
    else if (state.y <= EDGE && dy < 0) window.scrollBy(0, Math.min(-8, dy * 3));
    if (performance.now() - hoverAt >= HOVER_MS) hover();
    else if (!pending.settle) pending.settle = setTimeout(hover, HOVER_MS);  // the final position gets its hit test too
  }

  function hover() {
    clearTimeout(pending.settle);
    pending.settle = 0;
    hoverAt = performance.now();
    const t = under();
    if (t !== state.hover) {
      if (state.hover) fire(state.hover, 'mouseout', { relatedTarget: t });
      if (t) { fire(t, 'mouseover', { relatedTarget: state.hover }); fire(t, 'mouseenter'); }
      state.hover = t;
      // Synthetic events do not set :hover, so the clickable thing under the
      // arrow gets a class to style instead (our own pages and overlays do).
      const target = t && t.closest ? t.closest(CLICKABLE) : null;
      if (target !== state.marked) {
        if (state.marked) state.marked.classList.remove('pioneertv-hover');
        if (target) target.classList.add('pioneertv-hover');
        state.marked = target;
      }
    }
    if (t) fire(t, 'mousemove');
  }

  function button(name, down) {
    flush();                      // click where the arrow is, not where it was a frame ago
    const t = under();
    const which = name === 'right' ? 2 : 0;
    if (down) {
      state.pressed = true;
      ensure().classList.add('pioneertv-cursor-press');
      fire(t, 'mousedown', { button: which, buttons: which === 2 ? 2 : 1 });
      // Focus like a real click would, so typing and Enter go to the right place.
      const inOverlay = t && t.closest && t.closest('[data-pioneertv-overlay]');
      const focusable = !inOverlay && t && t.closest && t.closest('input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]');
      if (focusable) { try { focusable.focus({ preventScroll: true }); } catch {} }
    } else {
      state.pressed = false;
      if (state.el) state.el.classList.remove('pioneertv-cursor-press');
      fire(t, 'mouseup', { button: which });
      if (which === 0) fire(t, 'click', { button: 0 });
      else fire(t, 'contextmenu', { button: 2 });
    }
  }

  M.cursor = {
    init() {
      const b = M.bridge;
      if (!b) return;
      b.on('pointer', (e) => move(Number(e.dx) || 0, Number(e.dy) || 0));
      b.on('pointer_button', (e) => button(e.button || 'left', !!e.down));
      // Also follow a real mouse, should one be attached, once it moves:
      // labwc tells a window the pointer entered when it opens, and Chromium
      // turns that into a mousemove that goes nowhere, which showed the
      // arrow in the top corner after every start of the display.
      window.addEventListener('mousemove', (e) => {
        if (!e.isTrusted || (!e.movementX && !e.movementY)) return;
        state.x = e.clientX; state.y = e.clientY; state.lastMove = Date.now(); draw();
      }, { capture: true, passive: true });
    },
    // True exactly while the arrow is on screen.
    active() { return !!(state.el && state.el.classList.contains('pioneertv-cursor-show')); },
    // The d-pad or the left stick took over: the arrow goes away at once, and
    // A selects the focused element again rather than clicking at the pointer.
    hide() {
      if (!state.lastMove && !(state.el && state.el.classList.contains('pioneertv-cursor-show'))) return;
      state.lastMove = 0;
      hideArrow();
    },
    click() { button('left', true); setTimeout(() => button('left', false), 60); },
    position() { flush(); ensure(); return { x: state.x, y: state.y }; },   // starts centred, like the first move
    elementUnder() { flush(); return under(); },
  };
})(window.PioneerTV);
