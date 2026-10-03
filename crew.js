/* 可选主题的三只像素小伙伴（v11）：白色小伙伴打盹冒 zzz、蓝帽小伙伴托腮想「?」或哼歌、黄色小伙伴抖耳朵喊「哈」，打卡时一起跳。
 * 按主题挂载：
 * Crew.mount(canvas) 开始，Crew.stop() 停下（切走主题 / 页面隐藏时不跑动画）；减弱动态时只画一帧静止画面，打卡也不跳。
 * 原创重绘，仅供个人非商业自用。 */
(function () {
  'use strict';
  var root = document.documentElement;
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  var W = 100, H = 48, G = 44;            // G = 卡片顶边（“地面”）所在行
  var PAL = {
    '#': '#4a3a3a',   // 柔和的暖深灰棕描边
    w: '#ffffff', b: '#8cc6f0', y: '#f8f0ba', i: '#f4cdd6',   // 白 / 蓝 / 黄 / 耳朵内粉
    k: '#33282a', h: '#ffffff', r: '#ffcdd7', R: '#fbaabb', m: '#f590a8', l: '#b39b9b', d: '#4a3a3a', s: '#efe8eb', t: '#f2e2a0', v: '#f2cfdc', q: '#6b4a5a', p: '#f9bccb', Y: '#efdea2'
  };

  /* ---------- 头部轮廓：只写左半边（含中线），自动镜像 + 填充 ---------- */
  function mirror(half) { return half.map(function (r) { return r + r.slice(0, r.length - 1).split('').reverse().join(''); }); }
  function build(half, fill, paint) {
    var rows = mirror(half), h = rows.length, w = rows[0].length, g = rows.map(function (r) { return r.split(''); });
    var out = g.map(function (r) { return r.map(function () { return false; }); }), st = [];
    for (var x = 0; x < w; x++) { st.push([x, 0], [x, h - 1]); }
    for (var y = 0; y < h; y++) { st.push([0, y], [w - 1, y]); }
    while (st.length) {               // 从外面 4 连通泛洪，剩下的就是脸内部
      var p = st.pop(), px = p[0], py = p[1];
      if (px < 0 || py < 0 || px >= w || py >= h || out[py][px] || g[py][px] === '#') continue;
      out[py][px] = true; st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (g[y][x] !== '#') g[y][x] = out[y][x] ? '.' : (paint ? paint(x, y, w) || fill : fill);
    return g;
  }
  /* 白色小伙伴：31 宽，左右上角两颗小圆耳 */
  var CHII = [
    '.....###...#####',
    '....#...###.....',
    '....#...........',
    '.....#..........',
    '...##...........',
    '..#.............',
    '..#.............',
    '.#..............',
    '.#..............',
    '#...............',
    '#...............',
    '#...............',
    '#...............',
    '#...............',
    '.#..............',
    '.#..............',
    '..#.............',
    '..#.............',
    '...#............',
    '....##..........',
    '......##........',
    '........###.....',
    '...........#####'
  ];
  /* 蓝帽小伙伴：29 宽，蓝色帽子下沿是一道黑线，中间一个尖 */
  var HACHI = [
    '.......##.......',
    '......#..#......',
    '......#...#.####',
    '.....#.....#....',
    '....#..........#',
    '....#.........#.',
    '...#.........#..',
    '...#........#...',
    '..#........#....',
    '..#########.....',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '..#.............',
    '..#.............',
    '...#............',
    '....##..........',
    '......##........',
    '........##......',
    '..........######'
  ];
  function hachiPaint(x, y, w) {
    var c = x < 15 ? x : w - 1 - x, bnd = c <= 10 ? 9 : 19 - c;   // 帽檐平线 + 中间干净的“八”字尖
    return y < bnd ? 'b' : 'w';
  }
  /* 黄色小伙伴：以右半边为准镜像，底部是圆底 */
  var USA_EARS = [
    '............###.',
    '...........#...#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#'
  ];
  var USA_EARS_TILT = [
    '................',
    '............###.',
    '...........#...#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#',
    '..........#....#'
  ];
  var USA_HEAD = [
    '..........#....#',
    '........###.....',
    '......##........',
    '....##..........',
    '...#............',
    '..#.............',
    '..#.............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '.#..............',
    '..#.............',
    '..#.............',
    '...#............',
    '....##..........',
    '......##........',
    '........###.....',
    '...........#####'
  ];
  function usaPaint(x, y, w) { var c = x < 15 ? x : w - 1 - x; return (y >= 2 && y <= 9 && c === 11) ? 'i' : 'y'; }
  /* 下半圈贴着描边的一圈颜色稍深，像拼豆的立体感，不至于扁平 */
  function shade(g, map) {
    var h = g.length, from = Math.round(h * 0.6);
    for (var y = from; y < h; y++) for (var x = 0; x < g[y].length; x++) {
      var c = g[y][x]; if (!map[c]) continue;
      if ((g[y + 1] && g[y + 1][x] === '#') || g[y][x - 1] === '#' || g[y][x + 1] === '#') g[y][x] = map[c];
    }
    return g;
  }
  var BASE = {
    chii: shade(build(CHII, 'w'), { w: 's' }),
    hachi: shade(build(HACHI, 'w', hachiPaint), { w: 's' }),
    usagi: shade(build(USA_EARS.concat(USA_HEAD), 'y', usaPaint), { y: 'Y' }),
    usagiTilt: shade(build(USA_EARS_TILT.concat(USA_HEAD), 'y', usaPaint), { y: 'Y' })
  };

  /* ---------- 五官：三只都按各自的拼豆逐颗摆，列以 15 为中线 ---------- */
  function stamp(g, rows, x, y) { rows.forEach(function (r, j) { for (var i = 0; i < r.length; i++) if (r[i] !== '.' && g[y + j] && g[y + j][x + i] != null) g[y + j][x + i] = r[i]; }); }
  /* 白色小伙伴：4×4 圆环眼（两颗白高光）、斜斜的小眉、ω 嘴、带斜纹的粉腮红 */
  var C_EYE = { open: ['.kk.', 'khhk', 'kkkk', '.kk.'], blink: ['....', '....', 'kkkk', '....'], happy: ['....', '.kk.', 'k..k', '....'], doze: ['....', '....', 'k..k', '.kk.'] };
  var C_BLUSH = ['.ppp.', 'qpqpq', 'pqpqp', '.ppp.'];
  function chiiFace(g, o) {
    var e = C_EYE[o.eyes] || C_EYE.open, y = 12 + (o.look === 'up' ? -1 : 0);
    stamp(g, ['dd'], 10, 9); stamp(g, ['dd'], 19, 9);          // 成品拼豆里是两颗平平的短眉
    stamp(g, C_BLUSH, 4, 14); stamp(g, C_BLUSH, 22, 14);
    stamp(g, e, 9, y); stamp(g, e, 18, y);
    stamp(g, ['d.d.d', '.ddd.'], 13, 16);
  }
  /* 蓝帽小伙伴：和白色小伙伴同一套五官（4×4 黑豆眼 + 1 颗高光、小 ω 嘴、斜纹粉腮红），只多一顶蓝帽子 */
  var H_EYE = { open: ['.kk.', 'khkk', 'kkkk', '.kk.'], blink: C_EYE.blink, happy: C_EYE.happy, doze: C_EYE.doze };
  function hachiFace(g, o) {
    var e = H_EYE[o.eyes] || H_EYE.open, y = 12 + (o.look === 'up' ? -1 : 0);
    stamp(g, C_BLUSH, 4, 14); stamp(g, C_BLUSH, 22, 14);
    stamp(g, e, 9, y); stamp(g, e, 18, y);
    if (o.mouth === 'small') stamp(g, ['.d.', 'd.d', '.d.'], 14, 16);
    else stamp(g, ['d.d.d', '.d.d.'], 13, 16);
  }
  /* 黄色小伙伴：4×4 黑豆眼 + 一颗小白高光、细细的拱眉、Y 字嘴、粉紫斜纹腮红 */
  var U_EYE = {   // 拼豆原样：4×4 黑椭圆眼，上方一颗小白高光
    open:  ['.kk.', 'khkk', 'kkkk', '.kk.'],
    blink: ['....', '....', 'kkkk', '....'],
    happy: ['....', '.kk.', 'k..k', '....'],
    doze:  ['....', '....', 'k..k', '.kk.']
  };
  var U_MOUTH = {
    yell: ['d.d.d', '.dhd.', '.dhd.', '..d..', '..d..', '.....', '..d..'],   // 拼豆原样 Y 嘴 + 下面一颗
    ha:   ['d.d.d', '.dhd.', '.dhd.', '..d..', '.ddd.', '.dmd.', '.ddd.']    // “哈？”：下面张开
  };
  var U_BLUSH = ['.vvv.', 'vqvqv', 'vvqvv', '.vvv.'];
  function usaFace(g, o) {   // 行 = 拼豆行（耳朵加高 2 排），列 = 拼豆列（中线 15）
    var e = U_EYE[o.eyes] || U_EYE.open;
    stamp(g, U_BLUSH, 2, 22); stamp(g, U_BLUSH, 24, 22);
    stamp(g, ['..dd', '.d..', 'd...', 'd...'], 8, 15); stamp(g, ['dd..', '..d.', '...d', '...d'], 19, 15);
    stamp(g, e, 9, 20); stamp(g, e, 18, 20);
    stamp(g, U_MOUTH[o.mouth] || U_MOUTH.yell, 13, 24);
  }

  /* ---------- 绘制到低分辨率缓冲 ---------- */
  var cv = null, ctx = null, buf = new Array(W * H), raf = 0, running = false;
  function clear() { buf = new Array(W * H); }
  function put(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H && c) buf[y * W + x] = c; }
  function glyph(rows, x, y, pal) { rows.forEach(function (r, j) { for (var i = 0; i < r.length; i++) if (pal[r[i]]) put(x + i, y + j, pal[r[i]]); }); }
  /* 画头：bottom = 头最底一行所在 y；stretch = 呼吸时在第 sr 行多复制一行 */
  function drawGrid(g, x0, bottom, stretch, sr) {
    var h = g.length, extra = stretch ? 1 : 0, top = bottom - (h - 1) - extra;
    for (var r = 0; r < h; r++) {
      var yy = top + r + (stretch && r > sr ? 1 : 0);
      for (var c = 0; c < g[r].length; c++) { var ch = g[r][c]; if (ch !== '.') put(x0 + c, yy, PAL[ch]); }
      if (stretch && r === sr) for (c = 0; c < g[r].length; c++) if (g[r][c] !== '.') put(x0 + c, yy + 1, PAL[g[r][c] === 'k' || g[r][c] === 'h' ? 'w' : g[r][c]]);
    }
  }
  /* 椭圆小块（爪子 / 身体），自动描边 */
  function nub(cx, cy, rx, ry, fill) {
    function ins(x, y) { var dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; return dx * dx + dy * dy <= 1; }
    for (var y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) for (var x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
      if (!ins(x, y)) continue;
      put(x, y, (!ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1)) ? PAL['#'] : fill);
    }
  }
  var PAW = ['.##.', '#ww#', '#ww#', '.##.'];
  var CREW = {
    usagi: { x: 1, fill: PAL.y, sr: 13, faceFn: usaFace },
    chii: { x: 34, fill: PAL.w, sr: 6, faceFn: chiiFace },
    hachi: { x: 67, fill: PAL.w, sr: 4, faceFn: hachiFace }
  };
  function drawChar(name, o) {
    var C = CREW[name], base = name === 'usagi' && o.tilt ? BASE.usagiTilt : BASE[name];
    var g = base.map(function (r) { return r.slice(); });
    C.faceFn(g, o);
    var jy = Math.round(o.jy || 0), x0 = C.x + (o.dx || 0);
    if (o.up) {                                   // 站起来：头下面露出一点点小身子
      var by = G - 1 + jy;
      nub(x0 + 15.5, by - 3, 8.5, 3.6, C.fill);
      put(x0 + 15, by, PAL['#']); put(x0 + 15, by - 1, PAL['#']);           // 两只小脚之间的缝
      drawGrid(g, x0, by - 4 + (o.squash ? 1 : 0), false);
      var ay = by - 6 - (o.armsUp ? 4 : 0);
      nub(x0 + 1.5, ay, 2.2, 2.2, C.fill); nub(x0 + 29.5, ay, 2.2, 2.2, C.fill);
    } else {
      drawGrid(g, x0, G - 1 + jy, o.breath, C.sr);
      var pal = { '#': PAL['#'], w: C.fill };
      if (o.cheek) glyph(PAW, x0 + 3, G - 6, pal);                         // 托腮
      else glyph(PAW, x0 + 8, G - 2 + jy, pal);
      glyph(PAW, x0 + 19, G - 2 + jy, pal);
    }
  }

  /* ---------- 小特效 ---------- */
  var Z3 = ['zzzz', '..z.', '.z..', 'zzzz'], Z4 = ['zzzzz', '...z.', '..z..', '.z...', 'zzzzz'];
  var Q = ['.qq.', 'q..q', '..q.', '.q..', '....', '.q..'];
  var NOTE = ['..nnn', '..n.n', '..n..', 'nnn..', 'nnn..'];
  var BANG = ['b', 'b', 'b', '.', 'b'];
  var SPARK = ['..y..', '..y..', 'yywyy', '..y..', '..y..'], SPARK_S = ['.y.', 'ywy', '.y.'];
  var HRT = ['hh.hh', 'hhhhh', '.hhh.', '..h..'];
  function zzz(tm, still) {
    for (var i = 0; i < 3; i++) {
      var ph = still ? [0.05, 0.4, 0.75][i] : ((tm / 1000 + i * 1.1) % 3.3) / 3.3;
      if (ph > 0.82) continue;
      glyph(ph < 0.4 ? Z3 : Z4, 60 + ph * 5 + Math.sin(ph * 8) * 0.8, G - 30 - ph * 12, { z: '#d26f8b' });
    }
  }
  function bubble() {
    put(90, G - 27, '#e9a3b6'); put(91, G - 28, '#e9a3b6'); put(92, G - 29, '#e9a3b6');
    nub(91.5, G - 36, 6.6, 4.6, '#fffafb');
    // 气泡改为淡粉描边
    for (var i = 0; i < buf.length; i++) if (buf[i] === PAL['#'] && (i % W) > 84 && ((i / W) | 0) < G - 30 && ((i / W) | 0) > G - 43) buf[i] = '#e9a3b6';
    glyph(Q, 90, G - 39, { q: '#b8607a' });
  }
  function note(e) { var k = Math.floor(e / 260) % 3; glyph(NOTE, 90 + k, G - 33 - k * 2, { n: '#6aa6d8' }); if (k > 0) glyph(['.n', 'nn'], 86 - k, G - 37 + k, { n: '#9cc6ea' }); }
  function sparkles(e) {
    var f = Math.floor(e / 140) % 4;
    [[31, G - 33], [64, G - 33], [96, G - 24], [0, G - 40], [50, G - 40]].forEach(function (p, i) {
      if ((i + f) % 4 === 3) return;
      var big = (i + f) % 2;
      glyph(big ? SPARK : SPARK_S, p[0] + (big ? 0 : 1), p[1] + (big ? 0 : 1), { y: '#ffd76a', w: '#ffffff' });
    });
    glyph(HRT, 47, G - 35 - Math.min(5, Math.floor(e / 180)), { h: '#f28aa5' });
  }

  /* ---------- 状态机：三只各自循环；打卡时一起跳 ---------- */
  var S = { chii: { p: 'doze', t: 0, n: 0 }, hachi: { p: 'open', t: 0, n: 0 }, usagi: { p: 'open', t: 0, n: 0 } }, hopAt = -1e9, frozen = false, last = '';
  var DUR = { chii: { peek: 2000 }, hachi: { think: 4200, hum: 3000 }, usagi: { wiggle: 1800, ha: 1300 } };
  function now() { return performance.now(); }
  function set(name, p, tm) { var s = S[name]; s.p = p; s.t = tm; s.n = tm + (name === 'chii' ? 7000 : 3500) + Math.random() * 4000; }
  function schedule(tm) {
    ['chii', 'hachi', 'usagi'].forEach(function (nm) {
      var s = S[nm], d = DUR[nm][s.p];
      if (d && tm - s.t > d) set(nm, nm === 'chii' ? 'doze' : 'open', tm);
      else if (!d && tm > s.n) {
        var r = Math.random();
        set(nm, nm === 'chii' ? 'peek' : nm === 'hachi' ? (r < 0.6 ? 'think' : 'hum') : (r < 0.65 ? 'wiggle' : 'ha'), tm);
      }
    });
  }
  function hopY(e, delay) {
    e -= delay; if (e < 0) return { jy: 0, squash: false };
    if (e < 120) return { jy: 0, squash: true };
    if (e < 520) return { jy: -Math.round(7 * Math.sin(Math.PI * (e - 120) / 400)) };
    if (e < 640) return { jy: 0, squash: true };
    if (e < 940) return { jy: -Math.round(3 * Math.sin(Math.PI * (e - 640) / 300)) };
    return { jy: 0 };
  }
  function frame(tm) {
    var still = REDUCED.matches, he = tm - hopAt;
    clear();
    if (he < (still ? 1400 : 1900)) {             // 一起开心地跳
      [['usagi', 90], ['chii', 0], ['hachi', 50]].forEach(function (a) {
        var h = still ? { jy: 0 } : hopY(he, a[1]);
        drawChar(a[0], { up: true, eyes: 'happy', mouth: a[0] === 'chii' ? 'chii' : a[0] === 'hachi' ? 'cat' : 'yell', armsUp: !h.squash, jy: h.jy, squash: h.squash, tilt: a[0] === 'usagi' && Math.floor(he / 150) % 2 === 1 });
      });
      sparkles(still ? 300 : he);
    } else {
      var c = S.chii, ce = tm - c.t;
      if (c.p === 'doze') { drawChar('chii', { eyes: 'doze', breath: !still && Math.floor(tm / 1100) % 2 === 1 }); zzz(tm, still); }
      else drawChar('chii', { eyes: (ce > 600 && ce < 740) || (ce > 1400 && ce < 1540) ? 'blink' : 'open', look: 'up', jy: -1 });
      var hc = S.hachi, hhe = tm - hc.t;
      if (hc.p === 'think') { drawChar('hachi', { eyes: (hhe > 1500 && hhe < 1640) ? 'blink' : 'open', look: 'up', mouth: 'small', cheek: true, jy: -1 }); bubble(); }
      else if (hc.p === 'hum') { drawChar('hachi', { eyes: 'happy', mouth: 'cat', jy: still ? 0 : -(Math.floor(hhe / 260) % 2) }); note(still ? 0 : hhe); }
      else drawChar('hachi', { eyes: Math.floor(tm / 3700) % 3 === 0 && tm % 3700 < 140 ? 'blink' : 'open', mouth: 'cat' });
      var u = S.usagi, ue = tm - u.t;
      if (u.p === 'wiggle') drawChar('usagi', { eyes: 'open', mouth: 'yell', tilt: still ? true : Math.floor(ue / 160) % 2 === 0 });
      else if (u.p === 'ha') {
        var hy = still ? 0 : (ue < 450 ? -Math.round(4 * Math.sin(Math.PI * ue / 450)) : 0);
        drawChar('usagi', { eyes: 'open', mouth: 'ha', jy: hy, tilt: true });
        glyph(BANG, 29, G - 38 + hy, { b: '#e2607f' }); glyph(BANG, 31, G - 37 + hy, { b: '#e2607f' });
      } else drawChar('usagi', { eyes: tm % 4300 < 140 ? 'blink' : 'open', mouth: 'yell' });
    }
    paint();
  }
  function paint() {
    if (!ctx) return;
    var key = buf.join(','); if (key === last) return; last = key;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < buf.length; i++) if (buf[i]) { ctx.fillStyle = buf[i]; ctx.fillRect(i % W, (i / W) | 0, 1, 1); }
  }
  function tick() { raf = 0; if (!running) return; var tm = now(); if (!frozen) { schedule(tm); frame(tm); } raf = requestAnimationFrame(tick); }
  function size() {
    if (!cv) return;
    var P = parseInt(getComputedStyle(root).getPropertyValue('--cp'), 10) || 2;
    cv.width = W; cv.height = H; cv.style.width = W * P + 'px'; cv.style.height = H * P + 'px';
    cv.style.setProperty('--g', G); last = '';
  }
  /* 减弱动态：固定一帧（白色小伙伴打盹、另外两只睁眼），不循环、不跳 */
  function still() { hopAt = -1e9; S.chii.p = 'doze'; S.hachi.p = 'open'; S.usagi.p = 'open'; last = ''; frame(10000); }
  function play() {
    if (!cv || running) return;
    if (REDUCED.matches || document.hidden) { still(); return; }
    running = true; if (!raf) raf = requestAnimationFrame(tick);
  }
  function halt() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  if (REDUCED.addEventListener) REDUCED.addEventListener('change', function () { if (!cv) return; halt(); play(); });
  document.addEventListener('visibilitychange', function () { if (!cv) return; if (document.hidden) halt(); else play(); });
  window.Crew = {
    mount: function (canvas) {
      if (cv !== canvas) { halt(); cv = canvas; ctx = cv.getContext('2d'); size(); var t0 = now(); set('chii', 'doze', t0); set('hachi', 'open', t0); set('usagi', 'open', t0); }
      frozen = false; play();
    },
    stop: function () { halt(); if (ctx) ctx.clearRect(0, 0, W, H); cv = null; ctx = null; last = ''; },
    size: size,
    wake: function () { if (!cv || REDUCED.matches) return; hopAt = now(); play(); },
    running: function () { return running; },
    /* 截图 / 测试用：draw({chii:['doze',e], hachi:['think',e], usagi:['open',e]}, clock) 或 draw('hop', clock, e) */
    draw: function (spec, clock) {
      frozen = true; clock = clock || 10000;
      if (spec === 'hop') { hopAt = clock - arguments[2]; }
      else { hopAt = -1e9; Object.keys(spec).forEach(function (k) { S[k].p = spec[k][0]; S[k].t = clock - (spec[k][1] || 0); }); }
      last = ''; frame(clock);
    },
    unfreeze: function () { frozen = false; },
    base: BASE
  };
})();
