"""像素主题的字体子集化（fonttools / pyftsubset → woff2）。用法：python3 tools/build_px_fonts.py
源字体（都是 SIL OFL 1.1，许可见 fonts/LICENSES.md）：
- Fusion Pixel Font 12px proportional zh_hans（/workspace/fontsrc/fusion/）→ 中文像素字 "FusionPx"
- Pixelify Sans（可变字重 400–700）→ 英文像素字 "PixelLatin"
- Press Start 2P → 电玩主题的标题 / 数字 "Arcade8"

和衬线一样切片（见 build_fonts.py）：
- px-sc-ui.woff2      关键切片：index.html / app.js / cloud.js / i18n.js 里出现的全部中文 + ASCII + 中文标点 + 界面符号。
                      写进 pixel.css（font-display: block，中文像素主题首屏预加载这一片）。
- px-sc-01..NN.woff2  常用字切片：GB2312 一级 ∪ 字频前 3500，去掉关键切片已有的字，按字频每 CHUNK 个字一片；
                      写进 fonts/px-sc.css（非阻塞加载，swap）。用户自己输入的中文（习惯名、笔记）用到哪片才下载哪片；
                      不在任何切片里的生僻字按字体栈回退到系统字体，不会出现豆腐块。
- px-latin.woff2      Pixelify Sans 拉丁子集（英文模式只下载它和 px-sym，不下载中文像素字）
- px-sym.woff2        Pixelify 缺的界面符号（→ ← ↑ ↓ ★ ☀ ☾ ▶ ％ ＋ …），从 Fusion 里切出来
- px-arcade.woff2     Press Start 2P 的 ASCII 子集
"""
import re, os, csv, subprocess, sys
from fontTools.ttLib import TTFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'fonts')
FUSION = '/workspace/fontsrc/fusion/fusion-pixel-12px-proportional-zh_hans.otf.woff2'
PIXELIFY = '/workspace/ledger-stardew-preview/_src/Pixelify.ttf'
PS2P = '/workspace/ledger-stardew-preview/_src/PressStart2P.ttf'
HANZI = '/workspace/fontsrc/hanzi.csv'
TOP_N = int(os.environ.get('TOP_N', '3500'))
CHUNK = int(os.environ.get('CHUNK', '400'))
PUNCT = '，。、；：？！「」『』（）《》〈〉【】…·～％＋－／０１２３４５６７８９　“”‘’—'
CJK = re.compile(r'[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]')
ASCII = ''.join(chr(c) for c in range(0x20, 0x7f))

def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S); s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'(?m)^\s*//.*$', '', s); return re.sub(r'\s//\s.*$', '', s, flags=re.M)
def ui_text(): return ''.join(strip_comments(open(os.path.join(ROOT, f), encoding='utf-8').read()) for f in ['index.html', 'app.js', 'cloud.js', 'i18n.js', 'skin.js'])
def gb2312_level1():
    out = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try: out.append(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError: pass
    return out
def ranges(chars):
    cps = sorted(set(ord(c) for c in chars)); out = []; i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1: j += 1
        out.append('U+%X' % cps[i] if i == j else 'U+%X-%X' % (cps[i], cps[j])); i = j + 1
    return ','.join(out)
def run(*a): subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
tmp = '/tmp/ledger-pxfonts'; os.makedirs(tmp, exist_ok=True)
def subset(src, chars, name, feats='kern'):
    tf = f'{tmp}/{name}.txt'; open(tf, 'w', encoding='utf-8').write(''.join(sorted(set(chars))))
    run('pyftsubset', src, f'--text-file={tf}', '--flavor=woff2', f'--output-file={OUT}/{name}.woff2', f'--layout-features={feats}', '--no-hinting', '--desubroutinize', '--name-IDs=*', '--name-languages=*')
    return os.path.getsize(f'{OUT}/{name}.woff2')

fus = set(map(chr, TTFont(FUSION).getBestCmap()))
pix = set(map(chr, TTFont(PIXELIFY).getBestCmap()))
ps2 = set(map(chr, TTFont(PS2P).getBestCmap()))
ui = ui_text()
ui_chars = set(ui)

# ---- 中文像素字 ----
crit = ({c for c in ui_chars if CJK.match(c)} | set(PUNCT) | set(ASCII) | {c for c in ui_chars if ord(c) > 0x7f and not CJK.match(c)}) & fus
with open(HANZI, encoding='utf-8') as f:
    rank = {r['charcter']: int(r['frequency_rank']) for r in csv.DictReader(f)}
pool = (set(gb2312_level1()) | {c for c, n in rank.items() if n <= TOP_N}) & fus
pool = {c for c in pool if CJK.match(c)} - crit
ordered = sorted(pool, key=lambda c: (rank.get(c, 10 ** 6), ord(c)))
chunks = [ordered[i:i + CHUNK] for i in range(0, len(ordered), CHUNK)]
for f in os.listdir(OUT):
    if re.match(r'px-sc(-\w+)?\.woff2$', f): os.remove(os.path.join(OUT, f))
sizes = {'px-sc-ui': subset(FUSION, crit, 'px-sc-ui')}
faces = []
for i, ch in enumerate(chunks, 1):
    name = 'px-sc-%02d' % i
    sizes[name] = subset(FUSION, ch, name); faces.append((name, ranges(ch)))

rule = '@font-face { font-family: "FusionPx"; src: url("%s.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: %s; unicode-range: %s; }'
open(os.path.join(OUT, 'px-sc.css'), 'w', encoding='utf-8').write(
    '/* FusionPx · 中文像素字的常用字切片（GB2312 一级 + 常用 3500 字，按字频分片）。由 tools/build_px_fonts.py 生成，请勿手改。\n'
    ' * 浏览器只在页面里出现某片的字（例如自己输入的习惯名、笔记）时才下载那一片；界面用字的关键切片在 pixel.css 里。 */\n'
    + '\n'.join(rule % (n, 'swap', r) for n, r in faces) + '\n')

# ---- 拉丁 / 符号 / 电玩 ----
latin = (set(ASCII) | {chr(c) for c in range(0xa0, 0x100)} | set('–—‘’“”•…×')) & pix
sizes['px-latin'] = subset(PIXELIFY, latin, 'px-latin', 'kern,liga')
sym = {c for c in ui_chars if ord(c) > 0x7f and not CJK.match(c) and c not in pix and c in fus and not c.isspace()} | (set('→←↑↓★☀☾▶％＋·') & fus) - pix
sizes['px-sym'] = subset(FUSION, sym, 'px-sym')
arc = set(ASCII) & ps2
sizes['px-arcade'] = subset(PS2P, arc, 'px-arcade')
# Press Start 2P 声明了保留字体名（Reserved Font Name）：子集属于修改版，内部名改为 Arcade8，不再沿用原名。
from fontTools.ttLib import TTFont
_t = TTFont(f'{OUT}/px-arcade.woff2')
for _n in _t['name'].names:
    if _n.nameID in (1, 4, 16): _n.string = 'Arcade8'
    elif _n.nameID == 6: _n.string = 'Arcade8-Regular'
    elif _n.nameID == 3: _n.string = 'Arcade8 (subset of Press Start 2P, OFL)'
_t.flavor = 'woff2'; _t.save(f'{OUT}/px-arcade.woff2')
sizes['px-arcade'] = os.path.getsize(f'{OUT}/px-arcade.woff2')

block = '\n'.join([
    '/* @font-px:begin — 由 tools/build_px_fonts.py 生成，请勿手改 */',
    rule % ('fonts/px-sc-ui', 'block', ranges(crit)),
    '@font-face { font-family: "PixelLatin"; src: url("fonts/px-latin.woff2") format("woff2"); font-weight: 400 700; font-style: normal; font-display: block; unicode-range: %s; }' % ranges(latin),
    '@font-face { font-family: "PxSym"; src: url("fonts/px-sym.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; unicode-range: %s; }' % ranges(sym),
    '@font-face { font-family: "Arcade8"; src: url("fonts/px-arcade.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; unicode-range: %s; }' % ranges(arc),
    '/* @font-px:end */'])
css_path = os.path.join(ROOT, 'pixel.css')
css = open(css_path, encoding='utf-8').read() if os.path.exists(css_path) else ''
css, n = re.subn(r'/\* @font-px:begin.*?/\* @font-px:end \*/', lambda m: block, css, flags=re.S)
assert n == 1, 'pixel.css: @font-px block not found'
open(css_path, 'w', encoding='utf-8').write(css)
for k, v in sizes.items(): print(f'{k + ".woff2":20s} {v / 1024:7.1f} KB')
print(f'critical CJK: {len([c for c in crit if CJK.match(c)])} chars; on-demand {len(pool)} chars in {len(chunks)} chunks; '
      f'total pixel {sum(sizes.values()) / 1024:.1f} KB; sym: {"".join(sorted(sym))}')
