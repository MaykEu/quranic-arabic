// Guard for opening the site directly from disk (file://): browsers block ES
// modules over file://, so pages would otherwise show only their static
// placeholder text. Replace it with a notice pointing to the live site.
if (location.protocol === 'file:') {
  var main = document.querySelector('main');
  if (main) {
    main.innerHTML =
      '<section class="card">' +
      '<h2>Open this over HTTP — not from disk</h2>' +
      '<p>This app runs on JavaScript modules, and browsers block those when you open HTML files ' +
      'directly from your hard drive (<code>file://</code>). That is why you were seeing only placeholder text.</p>' +
      '<p><a class="btn" href="https://maykeu.github.io/quranic-arabic/">Open the live site</a></p>' +
      '<p class="muted">Or, for local development: run <code>python -m http.server 8080</code> in the ' +
      'project folder and open <code>http://localhost:8080/</code>.</p>' +
      '</section>';
  }
}
