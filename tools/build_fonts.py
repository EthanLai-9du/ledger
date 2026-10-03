"""自托管字体子集化（fonttools / pyftsubset → woff2）
用法：python3 tools/build_fonts.py   （源字体放在 /workspace/fontsrc，见 fonts/LICENSES.md；需要 fonttools + brotli）

中文衬线（Noto Serif SC，可变字重 400–600）按 unicode-range 切片：
- ledger-serif-sc-ui.woff2   关键切片：首页 / 登录页 / 应用里真正用衬线渲染的标题文字（index.html 中标题类元素的文字、
                             JS 里设置的对话框标题、默认的一句话）+ 中文标点。首屏只预加载这一片（目标 < 80 KB）。
- ledger-serif-sc-01..NN.woff2 常用字切片：GB2312 一级字（3755）∪ 字频表前 3500 ∪ 全部界面用字，去掉关键切片已有的字，
                             按字频排序后每 CHUNK 个字一片。浏览器只在页面上出现该片里的字（例如用户自己写的一句话）时才下载。
@font-face 规则：关键切片写进 style.css 的 /* @font-sc:begin */ … /* @font-sc:end */ 之间；常用字切片写进
fonts/serif-sc.css（index.html 以 media=print → all 的方式非阻塞加载，约 11 KB gzip）。unicode-range 都是精确码位表，各片互不重叠。

拉丁字体（不切片）：
- ledger-serif.woff2        : Newsreader（opsz 28，可变字重 400–600）
- ledger-serif-italic.woff2 : Newsreader Italic（opsz 16，400）
- ledger-sans.woff2         : Inter（opsz 14，可变字重 300–600）
界面文案改动后重新运行即可（会重新扫描 index.html / *.js）。
"""
import re, subprocess, os, csv, json
from html.parser import HTMLParser
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = '/workspace/fontsrc'
G = '/usr/share/fonts/truetype/sand-box/google'
OUT = os.path.join(ROOT, 'fonts')
CSS = os.path.join(ROOT, 'style.css')
TOP_N = int(os.environ.get('TOP_N', '3500'))
CHUNK = int(os.environ.get('CHUNK', '300'))
# 用衬线渲染的元素（与 style.css「Typography」一节的选择器保持一致）
SERIF_CLASSES = {'landing__title', 'gate__title', 'hero__motto', 'section__title', 'dlg__title', 'auth-sent__title', 'pick__k', 'gate__points'}
PUNCT = '，。、；：？！「」『』（）《》〈〉【】…·～％＋－／０１２３４５６７８９　'
IN_RANGE = re.compile(r'[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]')   # 与 @font-face 覆盖的码位一致

def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S); s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'(?m)^\s*//.*$', '', s); return re.sub(r'\s//\s.*$', '', s, flags=re.M)
def read(f): return strip_comments(open(os.path.join(ROOT, f), encoding='utf-8').read())

class SerifText(HTMLParser):
    """收集 index.html 里位于衬线标题元素内的文字（以及 .landing__features 里的 h3）"""
    VOID = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'area', 'col', 'wbr', 'path', 'circle', 'rect'}
    def __init__(self):
        super().__init__(); self.stack = []; self.text = []
    def handle_starttag(self, tag, attrs):
        if tag in self.VOID: return
        cls = set((dict(attrs).get('class') or '').split())
        parent_serif = bool(self.stack) and self.stack[-1][1]
        in_feat = any('landing__features' in c for c, _ in self.stack)
        self.stack.append((' '.join(cls), parent_serif or bool(cls & SERIF_CLASSES) or (tag == 'h3' and in_feat)))
    def handle_endtag(self, tag):
        if tag not in self.VOID and self.stack: self.stack.pop()
    def handle_data(self, d):
        if self.stack and self.stack[-1][1]: self.text.append(d)

def critical_text():
    p = SerifText(); p.feed(read('index.html')); txt = ''.join(p.text)
    js = read('app.js') + read('cloud.js')
    for line in js.splitlines():                                   # 对话框 / 提示页标题
        if re.search(r"Title'\)\.textContent\s*=", line): txt += ''.join(re.findall(r"t\('([^']*)'", line))
        txt += ''.join(re.findall(r"confirmDlg\(t\('([^']*)'", line))
    txt += ''.join(re.findall(r"\w+: \['([^']*)',", js))           # cloud.js 的「邮件已寄出」标题
    txt += ''.join(re.findall(r"DEFAULT_MOTTO = '([^']*)'", js))
    return txt
def ui_text(): return ''.join(read(f) for f in ['index.html', 'app.js', 'cloud.js', 'i18n.js'])
def cjk(s): return set(IN_RANGE.findall(s))
def gb2312_level1():
    out = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try: out.append(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError: pass
    return out
def ranges(chars):
    cps = sorted(ord(c) for c in chars); out = []; i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1: j += 1
        out.append('U+%X' % cps[i] if i == j else 'U+%X-%X' % (cps[i], cps[j])); i = j + 1
    return ','.join(out)

def run(*a): subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def inst(src, dst, *axes): run('fonttools', 'varLib.instancer', src, *axes, '-o', dst)
def subset_sc(chars, name):
    tf = f'/tmp/ledger-fonts/{name}.txt'; open(tf, 'w', encoding='utf-8').write(''.join(sorted(chars)))
    run('pyftsubset', f'{tmp}/sc.ttf', f'--text-file={tf}', '--flavor=woff2', f'--output-file={OUT}/{name}.woff2',
        '--layout-features=kern,palt,vert,vrt2,locl', '--no-hinting', '--desubroutinize')
    return os.path.getsize(f'{OUT}/{name}.woff2')

os.makedirs(OUT, exist_ok=True)
tmp = '/tmp/ledger-fonts'; os.makedirs(tmp, exist_ok=True)
if not os.path.exists(f'{tmp}/sc.ttf') or os.path.getmtime(f'{tmp}/sc.ttf') < os.path.getmtime(f'{SRC}/NotoSerifSC.ttf'):
    inst(f'{SRC}/NotoSerifSC.ttf', f'{tmp}/sc.ttf', 'wght=400:600')

# ---- 中文切片 ----
crit = cjk(critical_text() + PUNCT)
ui = cjk(ui_text())
with open(os.path.join(SRC, 'hanzi.csv'), encoding='utf-8') as f:
    rank = {r['charcter']: int(r['frequency_rank']) for r in csv.DictReader(f)}
pool = set(gb2312_level1()) | {c for c, n in rank.items() if n <= TOP_N} | ui
pool = {c for c in pool if IN_RANGE.match(c)} - crit
ordered = sorted(pool, key=lambda c: (rank.get(c, 10 ** 6), ord(c)))
chunks = [ordered[i:i + CHUNK] for i in range(0, len(ordered), CHUNK)]

for f in os.listdir(OUT):                                          # 清掉旧的整包与旧切片
    if re.match(r'ledger-serif-sc(-\w+)?\.woff2$', f): os.remove(os.path.join(OUT, f))
sizes = {'ledger-serif-sc-ui.woff2': subset_sc(crit, 'ledger-serif-sc-ui')}
faces = []
for i, ch in enumerate(chunks, 1):
    name = 'ledger-serif-sc-%02d' % i
    sizes[name + '.woff2'] = subset_sc(set(ch), name)
    faces.append((name, ranges(ch)))

rule = '@font-face { font-family: "Ledger Serif SC"; src: url("%s.woff2") format("woff2"); font-weight: 400 600; font-style: normal; font-display: swap; unicode-range: %s; }'
# 关键切片：写进 style.css（首屏就要用）；常用字切片：写进 fonts/serif-sc.css，由 index.html 非阻塞加载。
# 各片码位互不重叠（unicode-range 是精确码位表），所以两个样式表的先后顺序不影响匹配。
crit_rule = (rule % ('fonts/ledger-serif-sc-ui', ranges(crit)))
block = '/* @font-sc:begin — 由 tools/build_fonts.py 生成，请勿手改；常用字切片见 fonts/serif-sc.css（按需下载） */\n' + crit_rule + '\n/* @font-sc:end */'
css = open(CSS, encoding='utf-8').read()
css, n = re.subn(r'/\* @font-sc:begin.*?/\* @font-sc:end \*/', lambda m: block, css, flags=re.S)
if not n:   # 首次运行：替换旧的单文件规则
    css, n = re.subn(r'@font-face \{ font-family: "Ledger Serif SC";[^\n]*\}', lambda m: block, css, count=1)
assert n == 1, 'style.css: font-sc block not found'
open(CSS, 'w', encoding='utf-8').write(css)
open(os.path.join(OUT, 'serif-sc.css'), 'w', encoding='utf-8').write(
    '/* Ledger Serif SC · 常用字切片（GB2312 一级 + 常用 3500 字，按字频分片）。由 tools/build_fonts.py 生成，请勿手改。\n'
    ' * 浏览器只在页面里出现某片的字时才下载那一片；关键切片（界面标题用字）在 style.css 里。 */\n'
    + '\n'.join(rule % (name, r) for name, r in faces) + '\n')
json.dump({'critical': ''.join(sorted(crit)), 'chunks': len(chunks), 'chunk_size': CHUNK}, open(f'{tmp}/manifest.json', 'w'), ensure_ascii=False)

# ---- 拉丁 ----
LATIN = 'U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212,U+2215'
inst(f'{G}/Newsreader/Newsreader-VariableFont_opsz,wght.ttf', f'{tmp}/nr.ttf', 'opsz=28', 'wght=400:600')
run('pyftsubset', f'{tmp}/nr.ttf', f'--unicodes={LATIN}', '--flavor=woff2', f'--output-file={OUT}/ledger-serif.woff2', '--layout-features=kern,liga,lnum,onum,tnum,pnum', '--no-hinting')
inst(f'{G}/Newsreader/Newsreader-Italic-VariableFont_opsz,wght.ttf', f'{tmp}/nri.ttf', 'opsz=16', 'wght=400')
run('pyftsubset', f'{tmp}/nri.ttf', f'--unicodes={LATIN}', '--flavor=woff2', f'--output-file={OUT}/ledger-serif-italic.woff2', '--layout-features=kern,liga,lnum', '--no-hinting')
inst(f'{G}/Inter/Inter-VariableFont_opsz,wght.ttf', f'{tmp}/inter.ttf', 'opsz=14', 'wght=300:600')
run('pyftsubset', f'{tmp}/inter.ttf', f'--unicodes={LATIN}', '--flavor=woff2', f'--output-file={OUT}/ledger-sans.woff2', '--layout-features=kern,liga,calt,tnum,lnum,case', '--no-hinting')

tot = 0
for f in sorted(os.listdir(OUT)):
    if f.endswith('.woff2'):
        n = os.path.getsize(os.path.join(OUT, f)); tot += n; print(f'{f:28s} {n/1024:7.1f} KB')
sc_tot = sum(v for k, v in sizes.items())
print(f'critical CJK glyphs: {len(crit)} ({sizes["ledger-serif-sc-ui.woff2"]/1024:.1f} KB); on-demand: {len(pool)} chars in {len(chunks)} chunks; '
      f'SC total {sc_tot/1024:.1f} KB; all fonts {tot/1024:.1f} KB')
