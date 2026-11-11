// Pioneer TV review (Granska): an album's or a month's pictures one after
// the other from the one marked, as a stack of cards, to sort them fast.
// Right or A: it is fine, the next; X: to Immich's trash, the next; Y: to
// the Google Drive's folder (Ej foto, in the background as from the viewer),
// the next; left: back to the one before, its verdict on it (fine on it
// again takes a trash or a move back); B: done. The card goes off the way
// its verdict says (right, left, up), stamped, and the next comes forward
// from the stack. After the last, how it went. Styled by review.css.
//
//   M.players.review.open(assets, index)   assets as sources/immich.js gives them
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const I = M.immich;
  const V = M.views;
  const el = V.el;
  const OUT_MS = 450;              // review.css's flight
  const STAMP_MS = 220;            // the stamp seen on the card, leaning, before it flies
  const BEHIND = 3;                // cards in the stack behind the one shown

  // A verdict: where its card goes, what its stamp says.
  const VERDICT = {
    ok: { out: 'right', stamp: 'Bra' },
    trash: { out: 'left', stamp: 'Raderas' },
    files: { out: 'up', stamp: 'Till filer' },
  };

  let root = null, stack = null, info = null, legend = null;
  let list = [], at = 0, said = [], changed = false;
  const cards = new Map();         // index -> its card, those near the one shown

  function build() {
    if (root) return;
    root = el('section', 'rv');
    root.hidden = true;
    root.dataset.pioneertvTheme = 'ink';
    stack = el('div', 'rv-stack');
    info = el('p', 'rv-info');
    legend = el('footer', 'legend rv-legend');
    root.append(stack, info, legend);
    document.body.appendChild(root);
  }

  // A card, made where it first shows: at the back of the stack, or (going
  // back past where it was made) already off the side.
  function card(i, from) {
    if (cards.has(i)) return cards.get(i);
    const a = list[i];
    const c = el('div', `rv-card ${from}`);
    const img = el('img');
    img.alt = '';
    img.src = I.picture(a.id, 'preview');
    c.appendChild(img);
    if (a.video) c.appendChild(el('span', 'rv-clip', 'Videoklipp'));
    c.appendChild(el('span', 'rv-stamp'));
    stack.appendChild(c);
    cards.set(i, c);
    void c.offsetWidth;            // drawn at the back first, then where it goes
    return c;
  }

  // Every card near the one shown where it belongs: those passed off the
  // way their verdict says, the one shown in front, the next behind it.
  function place() {
    for (let i = Math.max(0, at - 1); i <= Math.min(list.length - 1, at + BEHIND); i++) {
      const v = said[i] && VERDICT[said[i]];
      const c = card(i, i < at ? `rv-out-${(v && v.out) || 'right'}` : 'rv-behind-last');
      c.className = 'rv-card';
      if (i < at) c.classList.add(`rv-out-${(v && v.out) || 'right'}`);
      else c.classList.add(i === at ? 'rv-front' : `rv-behind-${Math.min(i - at, BEHIND)}`);
      c.style.zIndex = String(i < at ? 100 : 50 - (i - at));
      const stamp = c.querySelector('.rv-stamp');
      stamp.textContent = v ? v.stamp : '';
      stamp.className = `rv-stamp${v ? ` rv-stamp-${said[i]}` : ''}`;
    }
    // Those further off go once they have flown.
    for (const [i, c] of cards) {
      if (i >= at - 1 && i <= at + BEHIND) continue;
      cards.delete(i);
      setTimeout(() => c.remove(), OUT_MS);
    }
    root.classList.toggle('rv-done', at >= list.length);
    info.replaceChildren();
    if (at < list.length) {
      const a = list[at];
      info.append(el('span', 'rv-when', M.players.photo.when(a.taken) || (a.video ? 'Videoklipp' : 'Bild')), el('span', 'rv-count', `${at + 1} av ${list.length}`));
    } else {
      const n = (k) => said.filter((x) => x === k).length;
      const seen = said.filter(Boolean).length;
      const counts = [`${seen === 1 ? '1 bild' : `${seen} bilder`} granskade`, n('trash') && `${n('trash')} raderade`, n('files') && `${n('files')} till filer`];
      info.append(el('span', 'rv-when', 'Klart'), el('span', 'rv-count', counts.filter(Boolean).join(' · ')));
    }
    V.legend(legend, at < list.length
      ? [['◀', 'backa'], ['▶', ''], ['A', 'bra'], ['X', 'radera'], ['Y', 'till filer'], ['B', 'avsluta']]
      : [['◀', 'backa'], ['B', 'avsluta']]);
  }

  // A card stamped and leaning its way, about to fly: a press meanwhile
  // sends it at once.
  let pending = null;
  function flush() { if (pending) { clearTimeout(pending.timer); pending.go(); } }

  // A verdict on the one shown, in Immich, and on to the next. One said
  // before is taken back first (a trash restored, a move called off).
  async function judge(verdict) {
    flush();
    if (at >= list.length) return;
    const a = list[at], was = said[at];
    said[at] = verdict;
    place();
    cards.get(at).classList.add(`rv-lean-${VERDICT[verdict].out}`);
    const go = () => { pending = null; at++; place(); };
    pending = { timer: setTimeout(go, STAMP_MS), go };
    if (was === verdict) return;
    if (was === 'trash') await I.change('restore', { id: a.id });
    if (was === 'files') await I.change('cancel', { id: a.id });
    const r = verdict === 'ok' ? { ok: true } : await I.change(verdict === 'trash' ? 'trash' : 'not_photo', { id: a.id });
    // Refused (the notice says why): it stays as it was.
    if (!r.ok) { said[list.indexOf(a)] = undefined; place(); return; }
    if (verdict !== 'ok' || was) changed = true;
  }
  function back() {
    flush();
    if (at === 0) return;
    at--;
    place();
  }

  const review = {
    noKeyboard: true,                // Y is the review's (below), not Sök
    isOpen() { return !!root && !root.hidden; },
    open(assets, index = 0) {
      if (!assets || !assets.length) return;
      build();
      list = assets;
      at = Math.max(0, Math.min(assets.length - 1, index));
      said = [];
      changed = false;
      for (const c of cards.values()) c.remove();
      cards.clear();
      root.hidden = false;
      M.nav.captured = this;
      if (M.browse) M.browse.quiet(true);
      place();
    },
    close() {
      if (!this.isOpen()) return;
      flush();
      root.hidden = true;
      if (M.nav.captured === this) M.nav.captured = null;
      if (M.browse) M.browse.quiet(false);
      if (changed && M.browse) M.browse.route();
    },
    onKeyDown(e) {
      if (e.repeat && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') judge('ok');
      else if (e.key === 'ArrowLeft') back();
      else if (e.key === ' ') judge('trash');
      if (M.sound && e.key.startsWith('Arrow')) M.sound.tick(e.key);
    },
  };
  // Y (the daemon's keyboard event, main.js leaves it be here): to the files.
  M.bridge.on('keyboard', () => { if (review.isOpen() && M.nav.captured === review) judge('files'); });

  M.players = M.players || {};
  M.players.review = review;
})(window.PioneerTV);
