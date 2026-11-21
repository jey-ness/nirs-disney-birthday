// Runs in <head> before the page paints, so a saved Light / Dark / Magic choice shows with no flash.
// No choice saved = follow the phone's light or dark setting (handled in styles.css).
(function () {
  var mode = null;
  try { mode = localStorage.getItem("orlando-trip-theme-v1"); } catch (e) { /* private mode */ }
  if (mode === "light" || mode === "dark" || mode === "magic") document.documentElement.setAttribute("data-theme", mode);
  var dark = mode === "dark" || mode === "magic" || (!mode && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "magic" ? "#120B2E" : dark ? "#0B111C" : "#ffffff");
})();
