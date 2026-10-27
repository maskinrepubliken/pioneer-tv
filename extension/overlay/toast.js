// Pioneer TV toast: an icon and a line of text on a paper card, at the top
// right. Drawn by the overlay over every window (overlay/hud.js), and by
// the catalogue of views (dev/katalog.js). Styled by toast.css.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  // Fills (or makes) the toast's element with this text and icon.
  M.toastCard = function (text, icon, el) {
    el = el || document.createElement('div');
    el.className = 'pioneertv-toast pioneertv-card';
    el.innerHTML = '';
    if (icon) {
      const i = document.createElement('span');
      i.className = 'pioneertv-toast-icon';
      i.appendChild(M.icons.svg(M.icons.names.includes(icon) ? icon : 'info'));
      el.appendChild(i);
    }
    const t = document.createElement('span');
    t.textContent = text;
    el.appendChild(t);
    return el;
  };
})(window.PioneerTV);
