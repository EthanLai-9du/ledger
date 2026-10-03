/* Ledger · Android shell glue (Capacitor only; no-op in browsers).
 * Keeps the system status bar in sync with the app's paper colour (light / dark). */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var SB = C.Plugins && C.Plugins.StatusBar;
  if (!SB) return;
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(mq && mq.matches);
  }
  function sync() {
    var dark = isDark();
    try {
      SB.setOverlaysWebView({ overlay: false });
      SB.setBackgroundColor({ color: dark ? '#141513' : '#F6F5F1' });
      SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); // DARK = light icons, LIGHT = dark icons
    } catch (e) {}
  }
  sync();
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (mq) { mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync); }
})();
