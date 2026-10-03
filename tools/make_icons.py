"""v10 · Ledger 图标：深色圆角方块 + 像素「L」+ 一个绿色小方点（无其他装饰）。
全部在整数像素格上绘制后按整数倍放大（nearest），边缘保持锐利。
输出：icons/*.png（PWA / favicon / apple-touch / maskable）、Android 启动图标 mipmap、shots/v10-icon.png 预览。
安全区：maskable 图标的标记整体落在中心 40% 半径圆内（W3C 规定 80% 直径）；Android 自适应前景落在 108dp 画布中心 66dp 内。"""
import os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons')
RES = '/workspace/ledger-android/android/app/src/main/res'
INK = (30, 31, 28, 255); PAPER = (246, 245, 241, 255); GREEN = (124, 192, 74, 255); CLEAR = (0, 0, 0, 0)

def mark(stem, h, foot, gap, dot):
    """L + 点 的格子坐标（左上原点）。返回 [(x, y, w, h, color)], 宽, 高"""
    rects = [(0, 0, stem, h, PAPER), (0, h - stem, foot, stem, PAPER), (foot + gap, h - dot, dot, dot, GREEN)]
    return rects, foot + gap + dot, h

MARK_S = mark(2, 8, 5, 1, 2)       # 8×8：16 / 24 格
MARK_M = mark(2, 10, 6, 1, 2)      # 9×10：32 / 36 格
MARK_L = mark(3, 15, 9, 2, 3)      # 14×15：54 格（Android 108dp 前景，1 格 = 2dp）

def grid(G, shape, mk, corner=0, margin=0):
    """shape: 'square'（阶梯圆角方块）| 'full'（满铺）| 'circle' | 'none'（透明，只有标记）"""
    im = Image.new('RGBA', (G, G), CLEAR); px = im.load()
    if shape == 'full':
        for y in range(G):
            for x in range(G): px[x, y] = INK
    elif shape == 'square':
        a, b = margin, G - margin
        for y in range(a, b):
            for x in range(a, b):
                dx = max(a + corner - 1 - x, x - (b - corner), 0); dy = max(a + corner - 1 - y, y - (b - corner), 0)
                if dx == 0 or dy == 0 or (dx + .5) ** 2 + (dy + .5) ** 2 <= corner ** 2: px[x, y] = INK
    elif shape == 'circle':
        c = G / 2
        for y in range(G):
            for x in range(G):
                if (x + .5 - c) ** 2 + (y + .5 - c) ** 2 <= (G / 2 - margin) ** 2: px[x, y] = INK
    rects, w, h = mk
    ox, oy = (G - w) // 2, (G - h) // 2
    d = ImageDraw.Draw(im)
    for x, y, rw, rh, col in rects: d.rectangle([ox + x, oy + y, ox + x + rw - 1, oy + y + rh - 1], fill=col)
    return im, (ox, oy, w, h)

def rounded(size, mk_grid, radius=.22, margin=.055, circle=False):
    """平滑的深色圆角方块（4× 超采样）+ 像素格的 L（按整数倍 nearest 放大，保持锐利）"""
    S = size * 4; base = Image.new('RGBA', (S, S), CLEAR); d = ImageDraw.Draw(base)
    m = round(S * margin)
    if circle: d.ellipse([m, m, S - m - 1, S - m - 1], fill=INK)
    else: d.rounded_rectangle([m, m, S - m - 1, S - m - 1], radius=round(S * radius), fill=INK)
    base = base.resize((size, size), Image.LANCZOS)
    base.alpha_composite(scaled(mk_grid, size))
    return base

def scaled(im, size):
    G = im.size[0]
    if size % G == 0: return im.resize((size, size), Image.NEAREST)
    big = im.resize((G * (size // G + 1),) * 2, Image.NEAREST)
    return big.resize((size, size), Image.LANCZOS)

def safe_ok(box, G, radius_frac):
    ox, oy, w, h = box; c = G / 2; r = G * radius_frac
    return all((x - c) ** 2 + (y - c) ** 2 <= r * r for x in (ox, ox + w) for y in (oy, oy + h))

if __name__ == '__main__':
    out = {}
    mk32, _ = grid(32, 'none', MARK_M)
    full32, b32 = grid(32, 'full', MARK_M)
    full36, _ = grid(36, 'full', MARK_M)
    mk16, _ = grid(16, 'none', MARK_S)
    assert safe_ok(b32, 32, .40), 'maskable mark outside safe zone'
    out['icon-512.png'] = rounded(512, mk32); out['icon-192.png'] = rounded(192, mk32)
    out['icon-maskable-512.png'] = scaled(full32, 512); out['icon-maskable-192.png'] = scaled(full32, 192)
    out['apple-touch-icon.png'] = scaled(full36, 180).convert('RGB')
    out['favicon-32.png'] = rounded(32, mk16, radius=.2, margin=0)
    for k, im in out.items(): im.save(os.path.join(OUT, k), optimize=True)
    # Android：自适应前景（108dp，透明）+ 纯色背景；旧式 48dp 方 / 圆
    fg54, bfg = grid(54, 'none', MARK_L)
    assert safe_ok(bfg, 54, 33 / 108), 'adaptive foreground outside 66dp safe zone'
    mk24, _ = grid(24, 'none', MARK_S)
    bg = Image.new('RGBA', (54, 54), INK)
    if os.path.isdir(RES):
        for dpi, m in (('ldpi', .75), ('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)):
            d = os.path.join(RES, 'mipmap-' + dpi)
            scaled(fg54, int(108 * m)).save(os.path.join(d, 'ic_launcher_foreground.png'), optimize=True)
            scaled(bg, int(108 * m)).save(os.path.join(d, 'ic_launcher_background.png'), optimize=True)
            rounded(int(48 * m), mk24, margin=1 / 24).save(os.path.join(d, 'ic_launcher.png'), optimize=True)
            rounded(int(48 * m), mk24, margin=1 / 24, circle=True).save(os.path.join(d, 'ic_launcher_round.png'), optimize=True)
    # 预览：常规 / maskable（叠安全区圆）/ Android 圆形遮罩 / 小尺寸
    W, H = 1320, 470; pv = Image.new('RGBA', (W, H), (236, 233, 224, 255)); dr = ImageDraw.Draw(pv)
    x = 40
    pv.alpha_composite(out['icon-512.png'].resize((360, 360), Image.LANCZOS), (x, 55)); x += 400
    mk = out['icon-maskable-512.png'].resize((360, 360), Image.LANCZOS).copy(); md = ImageDraw.Draw(mk)
    md.ellipse([36, 36, 324, 324], outline=(124, 192, 74, 160), width=2)
    pv.alpha_composite(mk, (x, 55)); x += 400
    ad = Image.new('RGBA', (324, 324), INK); ad.alpha_composite(scaled(fg54, 324))
    m = Image.new('L', (324, 324), 0); ImageDraw.Draw(m).ellipse([0, 0, 323, 323], fill=255); ad.putalpha(m)
    pv.alpha_composite(ad, (x, 73)); x += 344
    yy = 70
    for s in (96, 48, 32):
        pv.alpha_composite(out['icon-192.png'].resize((s, s), Image.LANCZOS) if s > 32 else out['favicon-32.png'], (x + (96 - s) // 2, yy)); yy += s + 24
    from PIL import ImageFont
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
    except Exception: f = ImageFont.load_default()
    for lx, t in ((40, 'icon-512 (any)'), (440, 'maskable · 80% safe zone'), (840, 'Android adaptive (circle mask)'), (1180, "96 · 48 · 32")):
        dr.text((lx, 432), t, font=f, fill=(90, 88, 80, 255))
    pv.convert('RGB').save(os.path.join(ROOT, 'shots', 'v10-icon.png'))
    print('icons ok; maskable mark box', b32, 'adaptive box', bfg)

# ---- Android 启动画面 + Capacitor assets/ 源图 + 通知小图标（同一个像素 L）----
def splash_all():
    import glob
    if not os.path.isdir(RES): return
    mk32, _ = grid(32, 'none', MARK_M)
    for f in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
        w, h = Image.open(f).size; night = '-night' in f
        bgc = (20, 21, 19, 255) if night else (246, 245, 241, 255)
        im = Image.new('RGBA', (w, h), bgc)
        s = int(min(w, h) * .35) // 32 * 32 or 32
        ic = rounded(s, mk32, margin=0)
        if night:   # 深色底上让方块略亮一点，才能看出轮廓
            r, g, b_, a = ic.split(); tint = Image.new('RGBA', ic.size, (44, 45, 41, 255)); tint.putalpha(a)
            tint.alpha_composite(scaled(mk32, s)); ic = tint
        im.alpha_composite(ic, ((w - s) // 2, (h - s) // 2)); im.convert('RGB').save(f, optimize=True)
    A = '/workspace/ledger-android/assets'
    if os.path.isdir(A):
        rounded(1024, mk32, margin=0).save(os.path.join(A, 'icon-only.png'))
        scaled(grid(54, 'none', MARK_L)[0], 1024).save(os.path.join(A, 'icon-foreground.png'))
        Image.new('RGBA', (1024, 1024), INK).save(os.path.join(A, 'icon-background.png'))
        for name, bgc in (('splash.png', (246, 245, 241, 255)), ('splash-dark.png', (20, 21, 19, 255))):
            im = Image.new('RGBA', (2732, 2732), bgc); s = 960; im.alpha_composite(rounded(s, mk32, margin=0), ((2732 - s) // 2,) * 2); im.convert('RGB').save(os.path.join(A, name))
    # 通知小图标：24dp 矢量，只用 alpha —— 像素 L（2 格粗）+ 方点
    V = os.path.join(RES, 'drawable', 'ic_stat_ledger.xml')
    open(V, 'w', encoding='utf-8').write('''<?xml version="1.0" encoding="utf-8"?>
<!-- Ledger 通知小图标（v10）：像素 L + 一个方点；状态栏图标只用 alpha，颜色由系统 / iconColor 决定 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M5,3h3v15h6v3H5Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M16,18h3v3h-3Z" />
</vector>
''')

if __name__ == '__main__':
    splash_all(); print('splash + assets + notification icon ok')
