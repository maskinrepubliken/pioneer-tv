// Pioneer TV: pages inside pages. A site's frame of its own (a login form
// in an iframe from another domain, as SVT Play's) is out of reach of the
// top frame's pointer, d-pad and keyboard: they live in the top frame, and
// a frame's keys go to the frame. Here, in each frame of its own, the
// d-pad moves the focus (spatial-nav.js, run here too), the pointer's moves
// and presses arrive from the top frame and act where it points, and a
// text field is typed into from the top frame's on-screen keyboard; in the
// top frame this keeps track of the frames and passes things on. The two
// talk only through the background worker (chrome.runtime, "frame-up" and
// "frame-down"), so a page cannot pose as either.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  if (M.frames || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
  const TOP = window === window.top;
  const up = (payload) => chrome.runtime.sendMessage({ type: 'frame-up', payload }).catch(() => {});
  const down = (frameId, payload) => chrome.runtime.sendMessage({ type: 'frame-down', frameId, payload }).catch(() => {});

  if (TOP) {
    // ------------------------------------------------------------ the top frame
    const frames = new Map();          // frameId -> { origin, w, h, field: { value, type } | null }
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type !== 'frame-up') return;
      const p = msg.payload || {};
      const f = frames.get(msg.frameId) || {};
      if (p.kind === 'hello') frames.set(msg.frameId, { ...f, origin: p.origin, w: p.w, h: p.h });
      else if (p.kind === 'edge') {
        // Nothing more that way in the frame: on from the frame in the page.
        const from = document.activeElement;
        if (from && from.tagName === 'IFRAME' && M.nav) {
          const next = M.nav.pick(from.getBoundingClientRect(), p.dir, M.nav.candidates().filter((e) => e !== from));
          if (next) M.nav.focus(next);
        }
      } else if (p.kind === 'field') {
        frames.set(msg.frameId, { ...f, field: p.on ? { value: p.value || '', type: p.inputType } : null });
        // A field pressed in a frame: the keyboard, as on a page's own.
        if (p.on && p.open && M.bridge && M.bridge.autoKeyboard() && M.keyboard && !M.keyboard.isOpen()) M.frames.type();
      }
    });
    // The frame an iframe shows: of its origin, and its size.
    function frameOf(iframe) {
      let origin = '';
      try { origin = new URL(iframe.src, location.href).origin; } catch {}
      const r = iframe.getBoundingClientRect();
      let best = null, off = Infinity;
      for (const [id, f] of frames) {
        if (f.origin !== origin) continue;
        const d = Math.abs(f.w - iframe.clientWidth) + Math.abs(f.h - iframe.clientHeight);
        if (d < off) { off = d; best = id; }
      }
      return best != null && off < 40 && r.width > 0 ? best : null;
    }
    // The keyboard closed over a frame's field: the text is in (or OK said).
    let typing = null;
    if (M.bridge) M.bridge.on('keyboard:close', () => setTimeout(() => { const t = typing; typing = null; if (t) t(); }, 0));

    M.frames = {
      // The pointer moved, pressed or let go over an iframe: where in it.
      pointer(iframe, x, y, what) {
        const id = frameOf(iframe);
        if (id == null) return false;
        const r = iframe.getBoundingClientRect();
        down(id, { kind: 'pointer', what, x: x - r.left - iframe.clientLeft, y: y - r.top - iframe.clientTop });
        return true;
      },
      // The d-pad went to an iframe: its own focus, inside it.
      enter(iframe) { const id = frameOf(iframe); if (id != null) down(id, { kind: 'enter' }); },
      // The focused frame's text field, if one has the focus there.
      field() {
        const a = document.activeElement;
        if (!a || a.tagName !== 'IFRAME') return null;
        const id = frameOf(a);
        const f = id != null ? frames.get(id) : null;
        return f && f.field ? { id, iframe: a, ...f.field } : null;
      },
      // The on-screen keyboard for the focused frame's field, through a
      // field of our own out of sight (its keys come to this frame then):
      // each change goes in at once; OK sends it, as Enter would.
      type() {
        const ff = this.field();
        if (!ff) return false;
        const proxy = document.createElement('input');
        proxy.type = ff.type === 'password' ? 'password' : 'text';
        proxy.value = ff.value;
        proxy.style.cssText = 'position: fixed; left: -9999px; top: 0;';
        document.body.appendChild(proxy);
        let ok = false;
        proxy.addEventListener('input', () => down(ff.id, { kind: 'set', value: proxy.value }));
        proxy.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok = true; });
        typing = () => {
          proxy.remove();
          try { ff.iframe.focus(); } catch {}
          down(ff.id, { kind: ok ? 'submit' : 'back' });
        };
        try { proxy.focus({ preventScroll: true }); } catch {}
        M.keyboard.open(proxy);
        return true;
      },
    };
    return;
  }

  // -------------------------------------------------------------- a frame of its own
  const nav = M.nav;
  if (!nav) return;
  nav.init();
  // Nothing more that way in the frame: the top frame goes on from it.
  const move = nav.move.bind(nav);
  nav.move = (dir) => { const moved = move(dir); if (!moved) up({ kind: 'edge', dir }); return moved; };
  const style = document.createElement('style');
  style.textContent = '.pioneertv-focus, .pioneertv-hover { outline: 3px solid #f5cf5a !important; outline-offset: 2px !important; }';
  (document.head || document.documentElement).appendChild(style);
  const hello = () => up({ kind: 'hello', origin: location.origin, w: window.innerWidth, h: window.innerHeight });
  hello();
  window.addEventListener('resize', hello);

  // A text field: the top frame is told of it (for the keyboard), and asked
  // to open the keyboard when it is pressed (A, or the pointer).
  let field = null;
  const tell = (open) => up({ kind: 'field', on: !!field, value: field ? field.value : '', inputType: field ? field.type : '', open });
  document.addEventListener('focusin', (e) => { if (nav.isTextField(e.target)) { field = e.target; tell(false); } }, true);
  document.addEventListener('input', (e) => { if (e.target === field) tell(false); }, true);
  window.addEventListener('keydown', (e) => {
    if (e.isTrusted && e.key === 'Enter' && nav.isTextField(document.activeElement)) { e.preventDefault(); field = document.activeElement; tell(true); }
  }, true);

  // The pointer, from the top frame.
  const CLICKABLE = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [tabindex]';
  let over = null, marked = null;
  function fire(t, type, x, y) {
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons: type === 'mousedown' ? 1 : 0 };
    if (window.PointerEvent) t.dispatchEvent(new PointerEvent(type.replace('mouse', 'pointer'), { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    t.dispatchEvent(new MouseEvent(type, init));
  }
  function pointer({ what, x, y }) {
    const t = document.elementFromPoint(x, y);
    if (!t) return;
    if (t !== over) {
      if (over) fire(over, 'mouseout', x, y);
      fire(t, 'mouseover', x, y);
      over = t;
      const m = t.closest(CLICKABLE);
      if (m !== marked) { if (marked) marked.classList.remove('pioneertv-hover'); if (m) m.classList.add('pioneertv-hover'); marked = m; }
    }
    if (what === 'move') { fire(t, 'mousemove', x, y); return; }
    if (what === 'down') {
      fire(t, 'mousedown', x, y);
      const focusable = t.closest('input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]');
      if (focusable) { try { focusable.focus({ preventScroll: true }); } catch {} }
      return;
    }
    fire(t, 'mouseup', x, y);
    const target = t.closest(CLICKABLE) || t;
    target.click();
    if (nav.isTextField(target)) { field = target; tell(true); }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.kind) return;
    if (msg.kind === 'pointer') pointer(msg);
    else if (msg.kind === 'enter') { if (!nav.current || !nav.isVisible(nav.current)) nav.move('down'); }
    else if (field && field.isConnected && msg.kind === 'set') {
      const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, msg.value);
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (field && field.isConnected && (msg.kind === 'submit' || msg.kind === 'back')) {
      try { field.focus({ preventScroll: true }); } catch {}
      nav.focus(field, { scroll: false });
      if (msg.kind !== 'submit') return;
      const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      const press = new KeyboardEvent('keydown', opts);
      field.dispatchEvent(press);
      field.dispatchEvent(new KeyboardEvent('keyup', opts));
      if (!press.defaultPrevented && field.form && typeof field.form.requestSubmit === 'function') field.form.requestSubmit();
    }
  });
})(window.PioneerTV);
