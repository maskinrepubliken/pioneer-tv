// Pioneer TV: the small pieces every page draws alike, so each exists once:
// an element, a capsule button (a filled one marked X), the legend at the foot, a picture (or the
// paper standing in for it), "Laddar…", a message with Försök igen in a
// view's place, and the errors a source (RomM, Jellyfin) can give. Styled
// by base.css.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // A filled one (primary) is X's: X presses it from anywhere in the view
  // (browse/page.js), unmarked (one learns it); the legend says it.
  function button(text, primary, onClick) {
    const btn = el('button', `knapp${primary ? ' primar' : ''}`, text);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  // [[key, text, how], ...]: the pad's buttons and what they do here (how:
  // "håll", said before the key), and the wordmark at the right.
  function legend(target, items) {
    target.innerHTML = '';
    for (const [key, text, how] of items) {
      const s = el('span');
      if (how) s.append(`${how} `);
      if (key) { s.appendChild(el('kbd', 'pioneertv-kbd', key)); s.append(' '); }
      s.append(text);
      target.appendChild(s);
    }
    const credit = el('span', 'credit');
    const img = el('img');
    img.src = 'shared/ordbild-en-rad-black.svg';
    img.alt = 'Maskinrepubliken';
    credit.appendChild(img);
    target.appendChild(credit);
  }

  // Sharp pictures without the wait: a small one shows at once, and once it
  // is on screen the large one is fetched (two at a time, the box's network
  // is slow: a screen of big covers took over half a minute) and swapped in
  // when it has loaded.
  const sharpen = (() => {
    const queue = [];
    let busy = 0;
    const next = () => {
      while (busy < 2 && queue.length) {
        const img = queue.shift();
        if (!img.isConnected || !img.dataset.large) continue;
        busy++;
        const big = new Image();
        big.decoding = 'async';
        const done = () => { busy--; next(); };
        big.onload = () => { if (img.isConnected) img.src = big.src; done(); };
        big.onerror = done;
        big.src = img.dataset.large;
      }
    };
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        seen.unobserve(e.target);
        queue.push(e.target);
      }
      next();
    });
    return (img) => seen.observe(img);
  })();

  // A picture: src, and large (a sharper one, swapped in once on screen).
  // Without one, or when it fails: paper with the name, or its first letter
  // (initial: a name that can run long, an artist's), or with mock, an
  // empty box of that kind with the name on it (shared/mockups.js).
  function cover(src, name, { large, initial, mock } = {}) {
    const box = el('span', 'cover');
    const paper = () => {
      if (mock && M.mockups) {
        box.className = `cover cover-mock cover-mock-${mock}`;
        box.innerHTML = M.mockups.svg(mock, name);
        return;
      }
      box.className = `cover cover-paper${initial ? ' cover-initial' : ''}`;
      box.textContent = initial ? (name || '?').trim().charAt(0).toUpperCase() : name || '';
    };
    if (!src) { paper(); return box; }
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = src;
    img.onerror = paper;
    if (large && large !== src) {
      img.dataset.large = large;
      img.addEventListener('load', () => sharpen(img), { once: true });
    }
    box.appendChild(img);
    return box;
  }

  // A view that has only a sentence to say says it on the whole screen, as
  // the game and the film do (shared/screen.js, a screen of its own so a
  // film's does not take it, on paper as the page is): "Laddar…", or what is wrong and a hint, and
  // with retry, X tries again (browse/page.js asks key(e) first). clear()
  // gives the screen back to the view.
  let own = null;
  const screen = () => own || (own = M.screen.in(document.body, { paper: true }));
  let again = null;
  function message(view, text, hint, retry) {
    view.innerHTML = '';
    again = retry || null;
    screen().show(text, [hint, retry ? 'X försök igen' : ''].filter(Boolean).join(' · '));
  }
  function loading(view) {
    view.innerHTML = '';
    again = null;
    screen().show('Laddar…');
  }
  function clear() {
    again = null;
    if (own) own.hide();
  }
  // While a message has the screen: X (or A) tries again; B falls through
  // to the page (back, or home); the rest does nothing. True when taken.
  function key(e) {
    if (!own || !own.isOpen() || e.key === 'Escape') return false;
    if ((e.key === ' ' || e.key === 'Enter') && again && !e.repeat) again();
    return true;
  }

  // What a source's error code means, in the same words for RomM and
  // Jellyfin: no_key, no_user (Jellyfin), auth, and anything else (down).
  function error(view, source, err, retry) {
    const code = err && err.code;
    const where = `Inställningar → ${source}`;
    if (code === 'no_key') return message(view, `Lägg in en API-nyckel för ${source}`, `Under ${where}.`, retry);
    if (code === 'no_user') return message(view, `Användaren finns inte i ${source}`, `Ändra namnet under ${where}.`, retry);
    if (code === 'auth') return message(view, 'API-nyckeln godtas inte', `Lägg in en ny under ${where}.`, retry);
    console.error(err);
    return message(view, `${source} svarar inte`, 'Kontrollera att servern är igång.', retry);
  }

  M.views = { el, button, legend, cover, message, loading, clear, key, error };
})(window.PioneerTV);
