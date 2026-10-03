/* Ledger · 像素主题（田园 / 电玩 / 星夜）的美术：作物、电池、月相、场景条、打卡动效、加载画面。
 * 全部像素画都是原创、用代码绘制（SVG rect / canvas），不引用外部图片。简约主题不用这里的任何东西。
 * 对外：window.SKIN = { list, isPixel, sprite, stage, icon, cellIcon, emptyIcon, drawScene, fx, bootArt }
 */
(function () {
  'use strict';
  var LIST = ['farm', 'arcade', 'night', 'minimal'];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 像素画工具 ---------- */
  function svg(rows, pal, cls) {
    var h = rows.length, w = rows[0].length, out = '';
    for (var y = 0; y < h; y++) {
      var x = 0;
      while (x < w) {
        var c = rows[y][x];
        if (c === '.' || !pal[c]) { x++; continue; }
        var s = x; while (x < w && rows[y][x] === c) x++;
        out += '<rect x="' + s + '" y="' + y + '" width="' + (x - s) + '" height="1" fill="' + pal[c] + '"/>';
      }
    }
    return '<svg class="' + (cls || 'px') + '" viewBox="0 0 ' + w + ' ' + h + '" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' + out + '</svg>';
  }
  function dataUrl(s) { return 'url("data:image/svg+xml,' + encodeURIComponent(s.replace(/ class="[^"]*"/, ' xmlns="http://www.w3.org/2000/svg"').replace(' aria-hidden="true" focusable="false"', '')) + '")'; }
  function lighten(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, r + k); g = Math.min(255, g + k); b = Math.min(255, b + k);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ---------- 田园：作物 5 个阶段（种子 → 丰收），果实颜色跟着领域色 ---------- */
  var SOIL = ['..SSSSSSSS..', '.SsSSsSSsSS.', '..ssssssss..'];
  var CROP = [
    ['............', '............', '............', '............', '............', '............', '............', '............', '.....dd.....'],
    ['............', '............', '............', '............', '............', '............', '....GG.GG...', '.....GgG....', '......g.....'],
    ['............', '............', '............', '......GG....', '..GG..gGG...', '.GGGG.g.....', '..GGgGg.GG..', '......gGGGG.', '......g.GG..'],
    ['............', '.....GG.....', '....GGGG....', '..G.GgGG.G..', '.GGGGgGGGGG.', 'GGgGGgGGgGG.', '.GGGggGgGG..', '..GG.gGGG...', '......g.....'],
    ['............', '.....GG.....', '....GGGG....', '..G.GgGFfG..', '.GGGGgGFFGG.', 'GFfGGgGGgGG.', '.FFGggGgFf..', '..GG.gGGFF..', '......g.....']
  ];
  var FRUIT = { indigo: ['#4c6fd8', '#9fb6ff'], pine: ['#e8892f', '#ffc27a'], ochre: ['#efbd2c', '#fff0a0'], cinnabar: ['#de4a3a', '#ff9c84'], plum: ['#8c52bd', '#d4a6f2'], slate: ['#e85d9e', '#ffb3d6'] };
  function crop(stage, color) {
    var f = FRUIT[color] || FRUIT.cinnabar;
    return svg(CROP[stage].concat(SOIL), { S: '#9a6338', s: '#6b3f22', d: '#c79a5a', G: '#6fb43f', g: '#3f7d2b', F: f[0], f: f[1] });
  }

  /* ---------- 电玩：能量电池（4 格电 = 满级），颜色跟着领域色 ---------- */
  var NEON = { indigo: '#3cf2ff', pine: '#5dff9e', ochre: '#ffe45c', cinnabar: '#ff5c8a', plum: '#c98bff', slate: '#9fb4ff' };
  function battery(stage, color) {
    var c = NEON[color] || NEON.indigo, rows = [];
    for (var y = 0; y < 12; y++) {
      var r = '';
      for (var x = 0; x < 12; x++) {
        var ch = '.';
        if (y === 0) ch = x >= 4 && x <= 7 ? 'o' : '.';
        else if (x >= 2 && x <= 9) {
          if (y === 1 || y === 11 || x === 2 || x === 9) ch = 'o';
          else if (x >= 4 && x <= 7 && y >= 3 && y <= 10) {
            var bar = 4 - Math.floor((y - 3) / 2);
            ch = bar <= stage ? (y % 2 ? 'l' : 'L') : 'e';
          } else if (x === 3 && y === 2) ch = 'h';
        }
        if (stage === 4 && y === 5 && x === 11) ch = 'z';
        if (stage === 4 && y === 6 && (x === 10 || x === 11)) ch = 'z';
        if (stage === 4 && y === 7 && x === 10) ch = 'z';
        r += ch;
      }
      rows.push(r);
    }
    return svg(rows, { o: stage === 4 ? c : '#5a5fa8', L: c, l: lighten(c, 60), e: '#23214a', h: '#8d92d8', z: '#ffe45c' });
  }

  /* ---------- 星夜：月相（新月 → 满月） ---------- */
  function moon(stage) {
    var rows = [], R = 5.2, k = [1, 0.5, 0, -0.45, -1][stage];
    for (var y = 0; y < 12; y++) {
      var r = '';
      for (var x = 0; x < 12; x++) {
        var dx = x + 0.5 - 6, dy = y + 0.5 - 6, d = dx * dx + dy * dy;
        if (d > R * R) { r += (stage === 4 && ((x === 0 && y === 1) || (x === 11 && y === 10))) ? 's' : '.'; continue; }
        var w = Math.sqrt(Math.max(0, R * R - dy * dy));
        var lit = stage === 4 || (stage > 0 && dx > w * k - 0.15);
        var crater = (x === 7 && y === 4) || (x === 4 && y === 7) || (x === 8 && y === 7) || (x === 5 && y === 3);
        var rim = d > (R - 1) * (R - 1);
        r += lit ? (crater ? 'c' : (rim && dy > 1 ? 'm' : 'L')) : (rim ? 'r' : 'u');
      }
      rows.push(r);
    }
    return svg(rows, { L: '#fbefc0', m: '#e6cf86', c: '#d8bf73', u: '#27335f', r: '#3d4c86', s: '#ffe8a3' });
  }

  /* ---------- 隐藏主题（小可爱）：粉色花盆里的小花，5 个阶段（取自已确认的预览） ---------- */
  var POT = ['.PPPPPPPPPP.', '..pPPPPPPp..', '...pppppp...'];
  var FLOWER = [
    ['............', '............', '............', '............', '............', '............', '............', '............', '.....dd.....'],
    ['............', '............', '............', '............', '............', '............', '....GG.GG...', '.....GgG....', '......g.....'],
    ['............', '............', '............', '......GG....', '..GG..gGG...', '.GGGG.g.....', '..GGgGg.GG..', '......gGGGG.', '......g.GG..'],
    ['............', '.....ff.....', '....fFFf....', '....FFFF....', '.....gg.....', '..GG.g......', '.GGGgg.GG...', '..GG.gGGGG..', '.....g......'],
    ['....fFFf....', '..fFFffFFf..', '..FFfccfFF..', '..FFfccfFF..', '..fFFffFFf..', '....fFgf....', '..GG.g......', '.GGGgg.GG...', '.....gGGGG..']
  ];
  var PETAL = { cinnabar: ['#f28aa5', '#ffd0dc'], ochre: ['#f59a7d', '#ffd8c6'], plum: ['#d99ad9', '#f4d6f4'], indigo: ['#8fb0e8', '#d6e3ff'], pine: ['#f28aa5', '#ffd0dc'], slate: ['#8fb0e8', '#d6e3ff'] };
  function flower(st, color) {
    var f = PETAL[color] || PETAL.cinnabar;
    return svg(FLOWER[Math.max(0, Math.min(4, st))].concat(POT), { P: '#f4a9bb', p: '#d98299', d: '#b88a7c', G: '#8fcf86', g: '#5d9e68', F: f[0], f: f[1], c: '#ffd76a' });
  }
  var HEART = ['.HH.HH.', 'HwHHHHH', 'HHHHHHH', '.HHHHH.', '..HHH..', '...H...'];
  var CUTE_FACE = ['.o....o.', 'oWo..oWo', 'oWWWWWWo', 'WWeWWeWW', 'WbWWWWbW', 'oWWWWWWo', '.oooooo.'];
  function stage(done, target) {
    if (done <= 0) return 0;
    if (!target || done >= target) return 4;
    return Math.min(3, 1 + Math.floor(3 * done / target));
  }
  function sprite(skin, st, color) { return skin === 'cuties' ? flower(st, color) : skin === 'arcade' ? battery(st, color) : skin === 'night' ? moon(st) : crop(st, color); }

  /* ---------- 小图标 ---------- */
  var ICO = {
    farm: svg(['....GG..', '...GgG..', '.GG.g...', 'GgGgg...', '.GGg....', 'SSSSSSSS', 'ssssssss'], { G: '#7cc04a', g: '#3f7d2b', S: '#a8703f', s: '#6b3f22' }),
    arcade: svg(['.o....o.', '..o..o..', '.oooooo.', 'oo.oo.oo', 'oooooooo', 'o.oooo.o', 'o.o..o.o', '...oo...'], { o: '#3dffa0' }),
    night: svg(['..LLL...', '.LL.....', 'LL......', 'LL....y.', 'LL...yWy', '.LL...y.', '..LLL...', '........'], { L: '#f6e9b2', y: '#ffd76a', W: '#fff' }),
    minimal: svg(['.kkkkk..', '.kpppk..', '.kpppk..', '.kpppk..', '.kpppk.g', '.kkkkk..', '........'], { k: '#57595a', p: '#f6f5f1', g: '#4A6A59' })
  };
  var CHECK = ['.........#', '........##', '.......##.', '#.....##..', '##...##...', '.##.##....', '..###.....', '...#......'];
  var COIN = ['..YYYY..', '.YyyyyY.', 'YyWyyyyY', 'YyWyyyyY', 'YyyyyyyY', 'YyyyyyyY', '.YyyyyY.', '..YYYY..'];
  var DROP = ['..B..', '.BbB.', 'BbbbB', 'BbWbB', '.BBB.'];
  // 应用标志：深色圆角方块 + 像素 L + 绿色小方点（与 icons/ 同一套，tools/make_icons.py）
  var LOGO = ['..KKKKKKKKKKKK..', '.KKKKKKKKKKKKKK.', 'KKKKKKKKKKKKKKKK', 'KKKKKKKKKKKKKKKK', 'KKKKWWKKKKKKKKKK', 'KKKKWWKKKKKKKKKK', 'KKKKWWKKKKKKKKKK', 'KKKKWWKKKKKKKKKK',
              'KKKKWWKKKKKKKKKK', 'KKKKWWKKKKKKKKKK', 'KKKKWWWWWKGGKKKK', 'KKKKWWWWWKGGKKKK', 'KKKKKKKKKKKKKKKK', 'KKKKKKKKKKKKKKKK', '.KKKKKKKKKKKKKK.', '..KKKKKKKKKKKK..'];
  var STAR = ['..y..', '..Y..', 'yYWYy', '..Y..', '..y..'];
  function icon(name) {
    if (ICO[name]) return ICO[name];
    if (name === 'cuties') return svg(CUTE_FACE, { o: '#7a5560', W: '#ffffff', e: '#3b2a30', b: '#ffadbd' });
    if (name === 'heart') return svg(HEART, { H: '#d9607f', w: '#ffffff' });
    if (name === 'logo') return svg(LOGO, { K: '#1e1f1c', W: '#f6f5f1', G: '#7cc04a' });
    if (name === 'check') return svg(CHECK, { '#': 'currentColor' });
    if (name === 'coin') return svg(COIN, { Y: '#c98a00', y: '#ffd319', W: '#fff6b0' });
    if (name === 'drop') return svg(DROP, { B: '#2f7fc8', b: '#5fb6f0', W: '#d8f1ff' });
    if (name === 'star') return svg(STAR, { Y: '#ffd76a', y: '#b8902e', W: '#fffbe6' });
    return '';
  }
  function cellIcon(skin) { if (skin === 'cuties') return dataUrl(icon('heart')); return dataUrl(icon(skin === 'arcade' ? 'coin' : skin === 'night' ? 'star' : 'drop')); }
  function emptyIcon(skin) { return dataUrl(sprite(skin, 0, 'pine')); }

  /* ---------- 场景条：canvas 低分辨率绘制，按「像素」放大 ---------- */
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function bayer(x, y) { return [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y & 3][x & 3] / 16; }

  function drawScene(cv, skin, opts) {
    opts = opts || {};
    var P = opts.P || 3, H = opts.H || 40;
    var W = Math.max(40, Math.ceil((cv.parentNode.clientWidth || 360) / P));
    cv.width = W; cv.height = H; cv.style.width = W * P + 'px'; cv.style.height = H * P + 'px';
    var g = cv.getContext('2d'), R = rng(7), fx = [];
    function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); }
    function blob(rows, x, y, pal) { rows.forEach(function (r, j) { for (var i = 0; i < r.length; i++) if (pal[r[i]]) px(x + i, y + j, 1, 1, pal[r[i]]); }); }
    /* 有序抖动的渐变天空：像素画式的平滑过渡 */
    function sky(stops, y0, y1) {
      for (var y = y0; y < y1; y++) {
        var t = (y - y0) / Math.max(1, y1 - y0 - 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
        for (var x = 0; x < W; x++) px(x, y, 1, 1, f > bayer(x, y) ? stops[i + 1] : stops[i]);
      }
    }
    if (skin === 'cuties') {
      // 奶白粉的天空：两朵云、几颗小星点和一道远处的柔粉小丘（与预览一致）
      [['#fff0f4', 0, 12], ['#fff2f5', 12, 10], ['#fff4f6', 22, 18]].forEach(function (b) { px(0, b[1], W, b[2], b[0]); });
      var ccloud = ['....wwww.......', '..wwwwwwww.ww..', '.wwwwwwwwwwwwww', 'wwwwwwwwwwwwwww', '.lllllllllllll.'];
      [[6, 8], [Math.round(W * 0.3), 2]].forEach(function (c) { blob(ccloud, c[0], c[1], { w: '#ffffff', l: '#fbe1e8' }); });
      [[0.2, 20], [0.62, 4], [0.93, 12]].forEach(function (st) { blob(['.s.', 'sss', '.s.'], Math.round(W * st[0]), st[1], { s: '#f8cdd8' }); });
      for (var cx = 0; cx < W; cx++) { var ch1 = 31 + Math.round(1.5 * Math.sin(cx / 11) + Math.sin(cx / 4.3) * 0.8); px(cx, ch1, 1, H - ch1, '#fde6ec'); }
    } else if (skin === 'farm') {
      [['#6cbdea', 0, 12], ['#86cdf0', 12, 8], ['#a6dcf3', 20, 6], ['#c4e9f4', 26, 6]].forEach(function (b) { px(0, b[1], W, b[2], b[0]); });
      var sx = W - 22;
      blob(['...yyyy...', '..yYYYYy..', '.yYYYYYYy.', 'yYYYWYYYYy', 'yYYYYYYYYy', 'yYYYYYYYYy', '.yYYYYYYy.', '..yYYYYy..', '...yyyy...'], sx, 4, { y: '#ffc24d', Y: '#ffe07a', W: '#fff6c8' });
      var cloud = ['....wwww.......', '..wwwwwwww.ww..', '.wwwwwwwwwwwwww', 'wwwwwwwwwwwwwww', '.lllllllllllll.'];
      [[6, 5], [Math.round(W * 0.42), 9], [Math.round(W * 0.7), 3]].forEach(function (c) { blob(cloud, c[0], c[1], { w: '#ffffff', l: '#d6eef8' }); });
      for (var x = 0; x < W; x++) {
        var h1 = 25 + Math.round(3 * Math.sin(x / 9) + 2 * Math.sin(x / 4.3));
        px(x, h1, 1, H - h1, '#8cc25a');
        var h2 = 29 + Math.round(2 * Math.sin(x / 13 + 2) + Math.sin(x / 5));
        px(x, h2, 1, H - h2, '#6aa83e');
      }
      px(0, 33, W, 7, '#5c9a35');
      for (x = 0; x < W; x++) { if (R() < 0.35) px(x, 32 + (R() < 0.5 ? 0 : 1), 1, 1, '#4c852b'); if (R() < 0.05) px(x, 35 + Math.floor(R() * 4), 1, 1, R() < 0.5 ? '#ffd6e6' : '#fff3a0'); }
      px(0, 38, W, 2, '#8a5a34'); px(0, 39, W, 1, '#6b3f22');
      for (x = 2; x < W; x += 7) { px(x, 27, 2, 9, '#a9713f'); px(x, 27, 2, 1, '#c98d55'); px(x + 1, 28, 1, 8, '#7a4a26'); }
      px(0, 29, W, 1, '#c98d55'); px(0, 30, W, 1, '#8a5a34'); px(0, 33, W, 1, '#c98d55'); px(0, 34, W, 1, '#8a5a34');
    } else if (skin === 'arcade') {
      /* 夕阳下的霓虹城：抖动渐变天空、条纹夕阳（被城市挡住下沿）、远近两层天际线（亮窗 + 天线灯）、干净的透视网格地面 */
      var HZ = 26;
      sky(['#090720', '#170a3c', '#33105e', '#661776', '#ad2575', '#ef4a6c', '#ff8a52'], 0, HZ);
      for (var i = 0; i < W / 3; i++) { var a = R(), b = R(); if (b < 0.45) px(a * W, b * 22, 1, 1, R() < 0.3 ? '#bdf6ff' : '#8a7ce0'); }
      var cx = Math.round(W * 0.68), cy = HZ, r = Math.min(13, Math.round(W / 9));
      for (var y = cy - r; y < cy; y++) {
        var dy = cy - y, gap = dy <= 3 ? dy % 2 === 1 : dy <= 8 ? dy % 3 === 1 : false;
        if (gap) continue;
        var w2 = Math.round(Math.sqrt(r * r - (dy - 0.5) * (dy - 0.5)));
        var tcol = dy > r * 0.75 ? '#fff4a8' : dy > r * 0.5 ? '#ffd650' : dy > r * 0.28 ? '#ffa040' : '#ff6a6a';
        px(cx - w2, y, w2 * 2, 1, tcol);
      }
      function city(base, col, top, win, seed, minH, maxH, skipSun) {
        var Rc = rng(seed), xx = 0;
        while (xx < W) {
          var bw = 3 + Math.floor(Rc() * 6), bh = minH + Math.floor(Rc() * (maxH - minH));
          if (skipSun && Math.abs(xx + bw / 2 - cx) < r - 2) { xx += 2; continue; }
          px(xx, base - bh, bw, bh, col);
          if (top) px(xx, base - bh, bw, 1, top);
          for (var wy = base - bh + 2; wy < base - 1; wy += 2) for (var wx = xx + 1; wx < xx + bw - 1; wx += 2) if (Rc() < 0.3) px(wx, wy, 1, 1, win[Math.floor(Rc() * win.length)]);
          if (Rc() < 0.22 && bh > maxH - 4) { px(xx + (bw >> 1), base - bh - 3, 1, 3, col); fx.push({ x: xx + (bw >> 1), y: base - bh - 4, c: 'blink' }); }
          xx += bw + (Rc() < 0.25 ? 1 : 0);
        }
      }
      city(HZ, '#3a1b6c', '#5a2c90', ['#7d66d8', '#9b5bc0'], 5, 5, 13, true);
      city(HZ, '#140a2e', null, ['#3cf2ff', '#ffe45c', '#ff6fd8', '#3cf2ff', '#9af7ff'], 11, 3, 8, false);
      px(0, HZ, W, H - HZ, '#0c0622');
      px(0, HZ, W, 1, '#ff7ad9'); px(0, HZ + 1, W, 1, '#4a1158');
      for (var k = 1; ; k++) { var yy = HZ + 1 + Math.round(Math.pow(k, 1.55)); if (yy >= H) break; px(0, yy, W, 1, yy > HZ + 7 ? '#d6338f' : '#8a2390'); }
      var vx = W / 2, step = Math.max(14, Math.round(W / 7));
      for (var bx = vx - step * 12; bx < vx + step * 12; bx += step) for (y = HZ + 2; y < H; y++) { var tx = vx + (bx - vx) * (y - HZ) / (H - HZ); if (tx >= 0 && tx < W) px(tx, y, 1, 1, y > HZ + 7 ? '#d6338f' : '#8a2390'); }
    } else {
      /* 星夜：抖动渐变夜空、银河、不同亮度的星、带光晕的月亮、暖色窗灯的小屋、萤火虫 */
      sky(['#060b1f', '#0b1533', '#13204a', '#1f2258', '#2e2a66'], 0, 30);
      for (i = 0; i < W * 0.9; i++) { var t = R(), mx0 = t * W, my0 = 2 + t * 14 + (R() - 0.5) * 7; if (R() < 0.5) px(mx0, my0, 1, 1, R() < 0.5 ? '#26326a' : '#1f2a5c'); }
      for (i = 0; i < W / 2.2; i++) { a = R(); b = R(); var c0 = R(); px(a * W, b * 24, 1, 1, c0 < 0.12 ? '#ffffff' : c0 < 0.4 ? '#aab8ec' : '#56649e'); }
      for (i = 0; i < 6; i++) {
        var stx = Math.round(R() * (W - 34)) + 3, sty = Math.round(R() * 16) + 2;
        blob(['.y.', 'yWy', '.y.'], stx, sty, { y: i % 2 ? '#9fb3ff' : '#ffd76a', W: '#fffbe6' });
        fx.push({ x: stx + 1, y: sty + 1, c: 'tw', d: i });
      }
      for (i = 0; i < 14; i++) fx.push({ x: Math.round(R() * W), y: Math.round(R() * 22), c: 'tw-s', d: i });
      var mxx = W - 22, myy = 3;
      for (y = -4; y < 18; y++) for (x = -4; x < 18; x++) {
        var ddx = x - 6.5, ddy = y - 6.5, dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd > 7 && dd < 10.5 && bayer(x + mxx, y + myy) < (10.5 - dd) / 6) px(mxx + x, myy + y, 1, 1, '#24306a');
      }
      for (y = 0; y < 14; y++) for (x = 0; x < 14; x++) {
        var ex = x - 6.5, ey = y - 6.5, e2 = ex * ex + ey * ey; if (e2 > 42) continue;
        var cx2 = x - 9.5, cy2 = y - 4.5, inShadow = cx2 * cx2 + cy2 * cy2 < 30;
        var col = inShadow ? '#2c3a74' : (e2 > 30 ? '#e8d48c' : ((x * 7 + y * 3) % 11 === 0 ? '#e2cd84' : '#fbefc4'));
        if (!inShadow && ((x === 3 && y === 8) || (x === 4 && y === 9) || (x === 2 && y === 5))) col = '#d9c27a';
        px(mxx + x, myy + y, 1, 1, col);
      }
      var sx0 = Math.round(W * 0.28);
      for (x = 0; x < 10; x++) px(sx0 + x, 5 + Math.floor(x / 3), 1, 1, x < 2 ? '#ffffff' : x < 5 ? '#b9c6ff' : '#4d5c9a');
      for (x = 0; x < W; x++) {
        var m1 = 23 + Math.round(4 * Math.abs(Math.sin(x / 11)) + 2 * Math.sin(x / 4.7));
        px(x, m1, 1, H - m1, '#1a2552'); px(x, m1, 1, 1, '#2d3b78');
        var m2 = 29 + Math.round(2 * Math.sin(x / 9 + 1) + Math.sin(x / 3.3));
        px(x, m2, 1, H - m2, '#111a3a');
      }
      for (x = 3; x < W; x += 9 + (x % 4)) { var ph = 4 + (x % 3); for (y = 0; y < ph; y++) px(x - Math.floor(y / 2), 31 - y + ph - 4, 1 + Math.floor(y / 2) * 2, 1, '#0b1330'); }
      px(0, 35, W, 5, '#0a1128');
      [[0.12, 31], [0.47, 32], [0.81, 30]].forEach(function (hh, n) {
        var hx = Math.round(W * hh[0]), hy = hh[1];
        blob(['......c...', '...rrrc...', '..rrrrrr..', '.rRRRRRRr.', 'rrrrrrrrrr', '.wwwwwwww.', '.wYywwYyw.', '.wyywwyyw.', '.wwwDDwww.', '.wwwDdwww.'], hx, hy - 6, { r: '#3a2a55', R: '#4b3870', c: '#2a2244', w: '#232e5c', Y: '#ffd88a', y: '#ffb85c', D: '#3a2a55', d: '#ffb85c' });
        px(hx + 1, hy - 1, 1, 1, '#5a4630'); px(hx + 8, hy - 1, 1, 1, '#5a4630');
        fx.push({ x: hx + 2, y: hy, c: 'win', d: n });
      });
      for (i = 0; i < 9; i++) fx.push({ x: Math.round(R() * W), y: 30 + Math.round(R() * 8), c: 'fly', d: i });
    }
    // 动态小点（闪烁的星 / 天线灯 / 萤火虫）：DOM 叠加层，减弱动态时静止
    var layer = opts.layer;
    if (layer) {
      layer.innerHTML = fx.map(function (f) { return '<i class="sfx sfx--' + f.c + '" style="left:' + f.x * P + 'px;top:' + f.y * P + 'px;--d:' + ((f.d || 0) * 0.37 % 3).toFixed(2) + 's"></i>'; }).join('');
    }
  }

  /* ---------- 打卡动效 ---------- */
  function fx(el, skin, text) {
    if (!el || reduce || skin === 'minimal') return;
    var box = document.createElement('span'); box.className = 'fx fx--' + skin; box.setAttribute('aria-hidden', 'true');
    if (skin === 'farm') box.innerHTML = '<i></i><i></i><i></i><b>' + text + '</b>';
    else if (skin === 'cuties') box.innerHTML = '<i></i><i></i><i></i><i></i><b>' + text + '</b>';
    else if (skin === 'arcade') box.innerHTML = '<span class="fx__coin">' + icon('coin') + '</span><i></i><i></i><i></i><i></i><b>' + text + '</b>';
    else box.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><span class="fx__star">' + icon('star') + '</span><b>' + text + '</b>';
    el.appendChild(box);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    setTimeout(function () { box.remove(); el.classList.remove('pop'); }, 1300);
  }

  /* ---------- 加载画面 ---------- */
  function bootArt(skin) {
    if (skin === 'minimal') return '';
    var frames = [0, 1, 2, 3, 4].map(function (s) { return '<span class="boot__f" style="--f:' + s + '">' + sprite(skin, s, skin === 'arcade' ? 'indigo' : 'cinnabar') + '</span>'; }).join('');
    return '<span class="boot__frames">' + frames + '</span>';
  }

  window.SKIN = {
    list: LIST,
    isPixel: function (s) { return s === 'farm' || s === 'arcade' || s === 'night' || s === 'cuties'; },
    valid: function (s) { return LIST.indexOf(s) >= 0 || s === 'cuties'; },
    sprite: sprite, stage: stage, icon: icon, cellIcon: cellIcon, emptyIcon: emptyIcon,
    drawScene: drawScene, fx: fx, bootArt: bootArt, svg: svg, url: dataUrl
  };
})();
