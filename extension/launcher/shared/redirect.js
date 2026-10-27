// Pioneer TV: an old page's address (spel.html, musik.html, film.html, as
// a box's settings may still hold them) goes on to the browse page, its
// query and hash kept: <script src="shared/redirect.js" data-library="spel">.
(function () {
  const library = document.currentScript.dataset.library;
  const rest = location.search.replace(/^\?/, '&');
  location.replace(`browse.html?library=${library}${rest}${location.hash}`);
})();
