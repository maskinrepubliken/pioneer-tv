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
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) return false;
      if (el.closest('[aria-hidden="true"], [inert], [data-pioneertv-overlay]')) return false;
      if (r.bottom < -window.innerHeight || r.top > window.innerHeight * 2) return false; // far off screen
      if (r.right < 0 || r.left > window.innerWidth) return false;
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

    focus(el, opts = {}) {
      if (!el) return;
      const prev = this.current;
      if (prev && prev !== el) prev.classList.remove(FOCUS_CLASS);
      this.current = el;
      el.classList.add(FOCUS_CLASS);
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
      if (!this.enabled || !e.isTrusted) return; // synthetic events come from our own keyboard
      // A game page gets every key untouched (the daemon sends none anyway; a
      // real keyboard may be plugged in for the emulator's own shortcuts).
      if (!this.captured && M.bridge && M.bridge.gameMode()) return;
      // A clicks at the pointer when it was just used, also inside our overlays
      // (the on-screen keyboard, the menu), so the stick can drive them too.
      if (e.key === 'Enter' && M.cursor && M.cursor.active()) {
        // With an overlay open the text field keeps focus, so decide by what is
        // under the pointer instead: a key, a menu row, a tab.
        const under = M.cursor.elementUnder();
        const inOverlay = !!(under && under.closest && under.closest('[data-pioneertv-overlay]'));
        const outsideKeyboard = this.captured && this.captured === M.keyboard && !inOverlay;   // closes it
        if (this.captured ? (inOverlay || outsideKeyboard) : !this.isTextField(document.activeElement)) {
          this.eat(e);
          M.cursor.click();
          return;
        }
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
      if (!this.enabled || !e.isTrusted) return;
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
        el.classList.add(FOCUS_CLASS);
      });
      // Real pointer (right stick) clicks: keep our ring on the clicked thing.
      document.addEventListener('click', (e) => {
        if (M.bridge && M.bridge.autoKeyboard() && this.isTextField(e.target) && M.keyboard && !M.keyboard.isOpen()) M.keyboard.open(e.target);
      }, true);
    },
  };

  M.nav = nav;
})(window.PioneerTV);
