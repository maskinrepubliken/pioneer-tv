// Pioneer TV full-screen message: the screen given over to one sentence, a
// line under it, on ink. Everything that has one shows it so: the game on
// its way (game/game.js: "Laddar…", "Startar…", what went wrong), the film
// (players/video.js: "Startar…", "Slut", what went wrong) and the
// screensaver resting (overlay/saver.js: "Vilar"), on ink, as what comes
// next is dark; and on paper, as the pages are, the browse page's view that
// is loading or cannot reach its source (views.js). Styled by screen.css.
//
//   M.screen.show('Startar…', 'Fyren')   the sentence and the line under it
//   M.screen.hide()
//   M.screen.in(parent, { paper })       another one, drawn in parent (paper: on paper)
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  function make(parent, { paper } = {}) {
    let root = null, text = null, hint = null;
    function build() {
      root = document.createElement('section');
      root.className = `pioneertv-screen${paper ? ' pioneertv-screen--paper' : ''}`;
      root.setAttribute('aria-live', 'polite');
      root.hidden = true;
      text = document.createElement('p');
      text.className = 'pioneertv-screen-text';
      hint = document.createElement('p');
      hint.className = 'pioneertv-screen-hint';
      root.append(text, hint);
      (parent || document.body).appendChild(root);
    }
    return {
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
  }

  M.screen = { ...make(null), in: make };
})(window.PioneerTV);
