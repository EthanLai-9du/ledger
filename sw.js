/* Ledger · Service Worker
 * - 预缓存应用外壳（HTML/CSS/JS/字体/图标/supabase-js），离线可打开
 * - 只处理同源 GET 请求；Supabase API（*.supabase.co）等跨域请求一律直连网络，不缓存
 * - 页面与 config.js：网络优先（保证更新 key / 新版本能及时生效），离线时回退缓存
 * - 字体：缓存优先（文件名随内容固定，版本号变化时整体换新）；中文常用字切片 ledger-serif-sc-NN.woff2 不预缓存，
 *   第一次用到时下载并写入缓存，之后离线也能用
 * - 应用代码（同源 .js / .css）：v12 起也是网络优先，离线时回退缓存。之前是 stale-while-revalidate，
 *   新版本上线后的第一次打开会出现「新 HTML + 旧缓存里的 JS/CSS」混搭（例如设置底部的标志不显示）；
 *   index.html 里的 ?v=NN 也让旧版 SW 认不出这些地址，直接走网络
 * - 其余静态资源（图标等）：缓存优先 + 后台更新（stale-while-revalidate）
 * 发布新版本时修改 VERSION 即可让旧缓存失效。
 */
var VERSION = 'gp-shell-v12-ledger';   // v12：四个标签页 + 新手指引 + 应用代码网络优先（修复新旧版本混搭）；v11：游客模式提示条 + crew.js / cuties.css；v10：像素主题（田园/电玩/星夜/简约）+ 像素字体切片 + 年度热力图/笔记/频率/导出；v9：每天提醒 + 中文衬线按 unicode-range 切片（只预缓存关键切片，其余按需运行时缓存）；v8：手机设置面板 + 分语言的一句话；v7：自托管字体 + 中英双语；旧缓存（v6 及以前）会在 activate 时删除
var SHELL = [
  './', './index.html', './style.css?v=12', './pixel.css?v=12', './cuties.css?v=12', './tabs.css?v=12', './i18n.js?v=12', './skin.js?v=12', './crew.js?v=12', './app.js?v=12', './cloud.js?v=12', './config.js',
  './fonts/ledger-serif.woff2', './fonts/ledger-serif-italic.woff2', './fonts/ledger-serif-sc-ui.woff2', './fonts/serif-sc.css?v=12', './fonts/ledger-sans.woff2',
  './fonts/px-sc.css?v=12', './fonts/px-sc-ui.woff2', './fonts/px-latin.woff2', './fonts/px-sym.woff2', './fonts/px-arcade.woff2',
  './vendor/supabase.min.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('gp-shell-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()); });
  });
}
function cacheFirst(req) {
  return caches.match(req).then(function (cached) {
    return cached || fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  });
}
function staleWhileRevalidate(req) {
  return caches.match(req).then(function (cached) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return cached || Response.error(); });
    return cached || net;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // Supabase / 任何跨域请求：不拦截
  if (/\/(auth|rest|realtime|storage|functions)\/v1\//.test(url.pathname)) return;
  if (/\.apk$/i.test(url.pathname)) return;                     // 安卓安装包：直连网络，不进缓存（避免拿到旧版本）
  if (req.mode === 'navigate' || /\/config\.js$/.test(url.pathname) || /\/index\.html$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }
  if (/\/fonts\/[^/]+\.woff2$/.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  if (/\.(js|css)$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }   // 应用代码：网络优先，保证和 HTML 同一版本
  e.respondWith(staleWhileRevalidate(req));
});
