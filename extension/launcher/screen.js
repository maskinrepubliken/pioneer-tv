// Pioneer TV full-screen message: the screen given over to one sentence, a
// line under it, on ink. Every page that has one shows it so: the game on
// its way (spela.js: "Laddar…", "Startar…", what went wrong), the film
// (film.js: "Startar…", "Slut", what went wrong) and the home page resting
// (launcher.js: "Vilar"). Styled by screen.css.
//
//   M.screen.show('Startar…', 'Fyren')   the sentence and the line under it
//   M.screen.hide()
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  let root = null, text = null, hint = null;

  function build() {
    root = document.createElement('section');
    root.className = 'pioneertv-screen';
    root.setAttribute('aria-live', 'polite');
    root.hidden = true;
    text = document.createElement('p');
    text.className = 'pioneertv-screen-text';
    hint = document.createElement('p');
    hint.className = 'pioneertv-screen-hint';
    root.append(text, hint);
    document.body.appendChild(root);
  }

  M.screen = {
    show(sentence, line) {
      if (!root) build();
      text.textContent = sentence || '';
      hint.textContent = line || '';
      hint.hidden = !line;
      root.hidden = false;
    },
    hide() { if (root) root.hidden = true; },
    isOpen() { return !!root && !root.hidden; },
  };
})(window.PioneerTV);
