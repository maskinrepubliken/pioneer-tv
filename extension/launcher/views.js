// Pioneer TV: the pieces every browsing page draws alike (Spel, Musik, Film
// & serier), so each exists once: the legend at the foot, "Laddar…", a
// message with Försök igen, and the errors a service can give. Styled by
// spel.css, which those pages share.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(text, primary, onClick) {
    const btn = el('button', `knapp${primary ? ' primar' : ''}`, text);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  // [[key, text], ...]: the pad's buttons and what they do here, and the
  // wordmark at the right.
  function legend(target, items) {
    target.innerHTML = '';
    for (const [key, text] of items) {
      const s = el('span');
      if (key) { s.appendChild(el('kbd', 'pioneertv-kbd', key)); s.append(' '); }
      s.append(text);
      target.appendChild(s);
    }
    const credit = el('span', 'credit');
    const img = el('img');
    img.src = 'ordbild-en-rad-black.svg';
    img.alt = 'Maskinrepubliken';
    credit.appendChild(img);
    target.appendChild(credit);
  }

  // A view's place taken by a sentence, a hint under it and Försök igen.
  function message(view, text, hint, retry) {
    view.innerHTML = '';
    const box = el('section', 'spel-message');
    box.appendChild(el('p', '', text));
    if (hint) box.appendChild(el('p', 'hint', hint));
    if (retry) {
      const btn = button('Försök igen', true, retry);
      box.appendChild(btn);
      M.nav.focus(btn);
    }
    view.appendChild(box);
  }

  function loading(view) {
    view.innerHTML = '';
    view.appendChild(el('p', 'spel-loading', 'Laddar…'));
  }

  // What a service's error code means, in the same words for RomM and
  // Jellyfin: no_key, no_user (Jellyfin), auth, and anything else (down).
  function error(view, service, err, retry) {
    const code = err && err.code;
    const where = `Inställningar → ${service}`;
    if (code === 'no_key') return message(view, `Lägg in en API-nyckel för ${service}`, `Under ${where}.`, retry);
    if (code === 'no_user') return message(view, `Användaren finns inte i ${service}`, `Ändra namnet under ${where}.`, retry);
    if (code === 'auth') return message(view, 'API-nyckeln godtas inte', `Lägg in en ny under ${where}.`, retry);
    console.error(err);
    return message(view, `${service} svarar inte`, 'Kontrollera att servern är igång.', retry);
  }

  M.views = { el, button, legend, message, loading, error };
})(window.PioneerTV);
