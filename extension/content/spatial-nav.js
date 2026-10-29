// Pioneer TV spatial navigation.
//
// Turns arrow keys into TV-style focus movement between links, buttons and
// inputs on any page. Geometric: from the focused element's box, pick the
// candidate in the pressed direction whose box is nearest, preferring ones
// that overlap on the cross axis. Works on pages that never planned for it.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const FOCUSABLE = [
    'a[href]', 'button', 'input', 'select', 'textarea', 'summary', 'video', 'audio',
    '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="link"]',
    '[role="menuitem"]', '[role="option"]', '[role="tab"]', '[role="checkbox"]',
    '[role="radio"]', '[role="switch"]', '[role="slider"]', '[contenteditable="true"]',
  ].join(',');
  const TEXT_INPUT = /^(text|search|email|url|number|password|tel)$/;
  const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  // Everything the gamepad can produce. While an overlay has the input these
  // must never reach the page: left/right would seek the video behind the
  // menu, space would pause it, tab would move its focus.
  const PAD_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab', 'PageUp', 'PageDown', 'Home', 'End']);
  const FOCUS_CLASS = 'pioneertv-focus';

  // ------------------------------------------------------------ the ring
  // On our own pages (html.pioneertv-own: the launcher, the overlay, the
  // settings page) the focus ring is one ring that moves from what had the
  // focus to what has it, rather than each one's own outline coming and
  // going. It takes the place, width, gap and roundness of the outline the
  // chosen one would have drawn (that outline is kept, only clear:
  // paper.css), and follows it while it moves (a scroll, a column that
  // widens) without the glide. [data-pioneertv-ring] on an ancestor draws
  // it round that instead (a field's row on the settings page).
  const ring = {
    el: null, target: null, placed: null, at: '', raf: 0, until: 0,
    on() { return document.documentElement.classList.contains('pioneertv-own'); },
    to(t) {
      if (!this.on()) return;
      t = t ? (t.closest('[data-pioneertv-ring]') || t) : null;
      // The one that draws the outline: it or one inside it (a card's cover).
      if (t && getComputedStyle(t).outlineStyle === 'none') {
        for (const c of t.querySelectorAll('*')) if (getComputedStyle(c).outlineStyle !== 'none') { t = c; break; }
      }
      this.target = t;
      document.documentElement.classList.add('pioneertv-ring-on');
      this.kick();
    },
    // Watch it for a moment after each change (it may still be moving).
    kick(ms = 700) {
      this.until = Math.max(this.until, performance.now() + ms);
      if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
    },
    frame() {
      this.raf = 0;
      this.draw();
      if (performance.now() < this.until) this.raf = requestAnimationFrame(() => this.frame());
    },
    draw() {
      const t = this.target;
      const r = t && t.isConnected ? t.getBoundingClientRect() : null;
      if (!r || r.width < 2 || r.height < 2) {
        if (this.el) this.el.style.display = 'none';
        this.placed = null;
        return;
      }
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.className = 'pioneertv-ring';
        this.el.setAttribute('aria-hidden', 'true');
      }
      // In the top layer with what it is round (a menu is a popover there,
      // over everything whatever its z-index), else on the page.
      const host = t.closest('[popover]') || document.body;
      if (this.el.parentNode !== host) host.appendChild(this.el);
      const st = getComputedStyle(t);
      const w = parseFloat(st.outlineWidth) || 3;
      const off = (parseFloat(st.outlineOffset) || 0) + w;
      const radius = st.borderTopLeftRadius.endsWith('%') ? st.borderTopLeftRadius : `${(parseFloat(st.borderTopLeftRadius) || 0) + off}px`;
      const at = `${r.left - off},${r.top - off},${r.width + off * 2},${r.height + off * 2},${radius},${w}`;
      if (at === this.at && this.el.style.display !== 'none') return;
      // A new one glides there; the same one moved (a scroll) is followed at once.
      const glide = this.placed && this.placed !== t && this.el.style.display !== 'none';
      this.el.style.transition = glide ? '' : 'none';
      Object.assign(this.el.style, {
        display: 'block', left: `${r.left - off}px`, top: `${r.top - off}px`,
        width: `${r.width + off * 2}px`, height: `${r.height + off * 2}px`, borderRadius: radius, borderWidth: `${w}px`,
      });
      if (!glide) void this.el.offsetWidth;          // placed before the glide comes back
      this.placed = t;
      this.at = at;
    },
  };
  // Gone or moved without a word (a menu closed, a view drawn anew): seen
  // a moment later.
  setInterval(() => { if (ring.target && !ring.raf) ring.draw(); }, 250);
  // Scrolled or resized: where it is now, at once.
  window.addEventListener('scroll', () => { if (ring.target) ring.kick(200); }, true);
  window.addEventListener('resize', () => { if (ring.target) ring.kick(200); });
  M.ring = ring;

  const nav = {
    enabled: true,
    current: null,
    // Layers (keyboard, menu) that take over the arrow keys while open.
    captured: null,

    isTextField(el) {
      if (!el) return false;
      if (el.isContentEditable) return true;
      if (el.tagName === 'TEXTAREA') return true;
      const role = el.getAttribute && el.getAttribute('role');
      if (role === 'textbox' || role === 'searchbox') return true;
      return el.tagName === 'INPUT' && TEXT_INPUT.test(el.type || 'text');
    },

    isVisible(el) {
      if (!el.isConnected) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      // Where it is first: it is cheap, and on a long grid (Musik's 1,707
      // albums) nearly everything is far off screen. The style and the
      // ancestors after, for the few left (they took most of each press).
      if (r.bottom < -window.innerHeight || r.top > window.innerHeight * 2) return false; // far off screen
      if (r.right < 0 || r.left > window.innerWidth) return false;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) return false;
      if (el.closest('[aria-hidden="true"], [inert], [data-pioneertv-overlay]')) return false;
      return true;
    },

    candidates() {
      const out = [];
      for (const el of document.querySelectorAll(FOCUSABLE)) {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
        if (!this.isVisible(el)) continue;
        // Skip elements wrapped by another focusable (icon inside a button).
        const parent = el.parentElement && el.parentElement.closest(FOCUSABLE);
        if (parent && el.tagName !== 'INPUT' && this.rectContains(parent.getBoundingClientRect(), el.getBoundingClientRect())) continue;
        out.push(el);
      }
      return out;
    },

    rectContains(a, b) { return b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1; },

    // Best next element in direction from rect `from`.
    pick(from, dir, list) {
      let best = null, bestScore = Infinity;
      const fcx = (from.left + from.right) / 2, fcy = (from.top + from.bottom) / 2;
      for (const el of list) {
        const r = el.getBoundingClientRect();
        let main, cross;
        if (dir === 'left') { main = from.left - r.right; cross = this.gap(r.top, r.bottom, from.top, from.bottom); }
        else if (dir === 'right') { main = r.left - from.right; cross = this.gap(r.top, r.bottom, from.top, from.bottom); }
        else if (dir === 'up') { main = from.top - r.bottom; cross = this.gap(r.left, r.right, from.left, from.right); }
        else { main = r.top - from.bottom; cross = this.gap(r.left, r.right, from.left, from.right); }
        // Allow slight overlap on the main axis (rows of cards with padding).
        if (main < -Math.min(from.width, from.height, r.width, r.height) * 0.4) continue;
        const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
        const centerDrift = (dir === 'left' || dir === 'right') ? Math.abs(cy - fcy) : Math.abs(cx - fcx);
        const score = Math.max(main, 0) * 1.0 + cross * 3.0 + centerDrift * 0.4;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      return best;
    },

    gap(a1, a2, b1, b2) { return Math.max(0, Math.max(a1, b1) - Math.min(a2, b2)); },

    // While the pointer is in use (cursor.js) the ring is on what it is
    // over, and put away while it is over nothing one can focus, so only one
    // thing on screen looks selected; the focus itself is kept.
    hovering: false,
    ringShown() { return this.hovering || !document.documentElement.classList.contains('pioneertv-pointer'); },
    ring(show) {
      const el = this.current;
      if (el && el.isConnected) el.classList.toggle(FOCUS_CLASS, show);
      ring.to(show && el && el.isConnected ? el : null);
    },

    focus(el, opts = {}) {
      if (!el) return;
      const prev = this.current;
      if (prev && prev !== el) prev.classList.remove(FOCUS_CLASS);
      this.current = el;
      el.classList.toggle(FOCUS_CLASS, this.ringShown());
      ring.to(this.ringShown() ? el : null);
      if (!el.hasAttribute('tabindex') && !el.matches('a[href],button,input,select,textarea,summary,video,audio,[contenteditable="true"]')) {
        el.setAttribute('tabindex', '-1');
      }
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
      if (opts.scroll !== false) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
      M.bridge && M.bridge.emit('nav:focus', el);
    },

    move(dir) {
      const list = this.candidates();
      if (!list.length) return false;
      let cur = this.current && this.isVisible(this.current) ? this.current : document.activeElement;
      if (!cur || cur === document.body || !this.isVisible(cur)) {
        this.focus(this.initial(list));
        return true;
      }
      const next = this.pick(cur.getBoundingClientRect(), dir, list.filter((e) => e !== cur));
      if (next) { this.focus(next); return true; }
      // Nothing that way: scroll so lazy-loaded rows appear, then try again.
      if (dir === 'down' || dir === 'up') {
        window.scrollBy({ top: (dir === 'down' ? 1 : -1) * window.innerHeight * 0.6, behavior: 'auto' });
        setTimeout(() => {
          const again = this.pick(cur.getBoundingClientRect(), dir, this.candidates().filter((e) => e !== cur));
          if (again) this.focus(again);
        }, 120);
      }
      return false;
    },

    initial(list) {
      const marked = document.querySelector('[data-pioneertv-initial], [autofocus]');
      if (marked && this.isVisible(marked)) return marked;
      // Top-most element that is inside the viewport, tie-break left-most.
      let best = null, bs = Infinity;
      for (const el of list) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        const s = r.top * 2 + r.left;
        if (s < bs) { bs = s; best = el; }
      }
      return best || list[0];
    },

    // The pointer (the right stick's arrow, or a mouse) moved over t: what
    // one can focus there gets the focus and the ring, as if the d-pad had
    // gone to it, so the arrows go on from it. Over nothing, the ring goes.
    // Only while the arrow is on screen: a mouse at rest is told of what is
    // drawn anew under it, which must not take the focus.
    pointerOver(t) {
      if (this.captured || !(M.cursor && M.cursor.active())) return;
      let el = t && t.closest ? t.closest(FOCUSABLE) : null;
      // An icon inside a button: the button.
      const outer = el && el.parentElement && el.parentElement.closest(FOCUSABLE);
      if (outer && el.tagName !== 'INPUT' && this.rectContains(outer.getBoundingClientRect(), el.getBoundingClientRect())) el = outer;
      if (el && (el.disabled || el.getAttribute('aria-disabled') === 'true' || !this.isVisible(el))) el = null;
      if (!el) {
        if (this.hovering) { this.hovering = false; this.ring(false); }
        return;
      }
      this.hovering = true;
      if (el === this.current) this.ring(true);
      else this.focus(el, { scroll: false });
    },

    // Enter on div-based "buttons" that only react to click.
    activate(el) {
      if (!el) return false;
      if (el.matches('a[href],button,input,select,textarea,summary')) return false;
      el.click();
      return true;
    },

    // Sliders, seek bars, volume bars, selects and media elements swallow the
    // arrow keys. They only get them after A "engages" the control; before
    // that, arrows keep navigating. B or moving away disengages.
    engaged: null,
    isControl(el) {
      if (!el || el === document.body) return false;
      return el.tagName === 'VIDEO' || el.tagName === 'AUDIO' || el.tagName === 'SELECT' || el.type === 'range'
        || el.getAttribute('role') === 'slider' || el.getAttribute('role') === 'spinbutton';
    },
    engage(el) {
      this.engaged = el;
      M.hud && M.hud.toast(el.tagName === 'SELECT' ? 'Upp/ner väljer · B lämnar' : 'Vänster/höger justerar · B lämnar', 'info', 2500);
    },

    onKeyDown(e) {
      if (!e.isTrusted) return;            // synthetic events come from our own keyboard
      // In a game the page gets the keys (enabled is off), but an overlay
      // opened over it (the keyboard) still needs the d-pad.
      if (!this.enabled && !this.captured) return;
      // Navigating with the d-pad or the left stick (both arrive as arrow keys)
      // hides the pointer straight away, in the page and in the overlays alike.
      if (DIRS[e.key] && M.cursor && M.cursor.hide) M.cursor.hide();
      // A game page gets every key untouched (the daemon sends none anyway; a
      // real keyboard may be plugged in for the emulator's own shortcuts).
      if (!this.captured && M.bridge && M.bridge.gameMode()) return;
      // While the pointer is on screen A always clicks what is under it, never
      // the focused element: in the page, in our overlays (a key, a menu row)
      // and in a text field alike (a click on one opens the keyboard).
      if (e.key === 'Enter' && M.cursor && M.cursor.active()) {
        this.eat(e);
        M.cursor.click();
        return;
      }
      if (this.captured) {
        // The layer may close itself on this very key (Escape, OK): keep hold
        // of it so the rest of the press is judged by the layer that had it.
        const layer = this.captured;
        layer.onKeyDown(e);
        // A layer only acts on the keys it knows; swallow the rest as well so
        // the page underneath stays untouched. captureAll === false (the
        // on-screen keyboard) still lets a real keyboard type through.
        if (layer.captureAll !== false || PAD_KEYS.has(e.key)) this.eat(e);
        return;
      }
      // A video filling the screen: left and right seek, A pauses (webvideo.js).
      if (M.webvideo && M.webvideo.key(e)) { this.eat(e); return; }
      const active = document.activeElement;
      if (this.engaged && this.engaged !== active) this.engaged = null;
      const dir = DIRS[e.key];
      if (dir) {
        const physical = M.bridge && M.bridge.state.physicalKeyboard;
        // Caret movement only with a real keyboard; the on-screen keyboard has its own caret keys.
        if (this.isTextField(active) && (dir === 'left' || dir === 'right') && physical) return;
        if (this.isControl(active) && this.engaged === active) {
          const horizontal = dir === 'left' || dir === 'right';
          if (active.tagName === 'SELECT' ? !horizontal : horizontal) return; // the control gets it
        }
        this.engaged = null;
        this.eat(e);
        this.move(dir);
        return;
      }
      if (e.key === 'Escape' && this.engaged) {
        this.eat(e);
        this.engaged = null;
        return;
      }
      if (e.key === 'Enter') {
        if (this.isControl(active)) {
          if (active.tagName === 'SELECT') {
            // Enter on a select opens it natively; let that happen, but note it as engaged.
            this.engaged = active;
            return;
          }
          this.eat(e);
          if (this.engaged === active) { this.engaged = null; M.hud && M.hud.toast('Lämnade reglaget', 'info', 1200); }
          else this.engage(active);
          return;
        }
        if (this.isTextField(active)) {
          if (M.bridge && M.bridge.autoKeyboard() && M.keyboard && !M.keyboard.isOpen()) {
            this.eat(e);
            M.keyboard.open(active);
          }
          return;
        }
        if (this.activate(active)) { this.eat(e); }
        return;
      }
      if (e.key === 'Escape' && this.isTextField(active)) {
        // A short B leaves a text field; holding B goes back a page (daemon "back" event).
        active.blur();
        this.focus(active, { scroll: false });
      }
    },

    // Key releases matter too: a page that acts on keyup would otherwise see
    // half of every press we consumed.
    _eaten: new Set(),
    stop(e) { e.preventDefault(); e.stopImmediatePropagation(); },
    // Consume a key press and remember it, so its release is consumed too.
    eat(e) { this.stop(e); this._eaten.add(e.key); },
    onKeyUp(e) {
      if (!e.isTrusted || (!this.enabled && !this.captured)) return;
      if (this.captured && (this.captured.captureAll !== false || PAD_KEYS.has(e.key))) {
        // The layer sees the release first (the keyboard types on it), then
        // it is swallowed so the page underneath never gets half a press.
        const layer = this.captured;
        this._eaten.delete(e.key);
        this.stop(e);
        if (layer.onKeyUp) layer.onKeyUp(e);
        return;
      }
      if (this._eaten.delete(e.key)) this.stop(e);
    },

    init() {
      window.addEventListener('keydown', (e) => this.onKeyDown(e), true);
      window.addEventListener('keyup', (e) => this.onKeyUp(e), true);
      document.addEventListener('focusin', (e) => {
        const el = e.target;
        if (el === this.current || !(el instanceof Element)) return;
        if (this.current) this.current.classList.remove(FOCUS_CLASS);
        this.current = el;
        el.classList.toggle(FOCUS_CLASS, this.ringShown());
        ring.to(this.ringShown() ? el : null);
      });
      // A mouse's first move says mouseover before the arrow is shown
      // (cursor.js shows it on mousemove), so a move over something new counts too.
      let over = null;
      const seen = (e) => { if (e.type === 'mouseover' || e.target !== over) { over = e.target; this.pointerOver(e.target); } };
      document.addEventListener('mouseover', seen, true);
      document.addEventListener('mousemove', seen, { capture: true, passive: true });
      // Real pointer (right stick) clicks: keep our ring on the clicked thing.
      document.addEventListener('click', (e) => {
        if (M.bridge && M.bridge.autoKeyboard() && this.isTextField(e.target) && M.keyboard && !M.keyboard.isOpen()) M.keyboard.open(e.target);
      }, true);
    },
  };

  M.nav = nav;
})(window.PioneerTV);
