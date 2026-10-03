"""v10：像素主题（默认）的 FusionPx 切片 + 「简约」主题的中文衬线切片。
中文衬线按 unicode-range 切片：首屏只下关键切片；用户写的一句话按需加载常用字切片；英文模式不下中文字体；SW 只预缓存关键切片"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra if not cond else '')
def parse_ranges(s):
    out = set()
    for part in s.split(','):
        part = part.strip().upper().replace('U+', '')
        if not part: continue
        a, _, b2 = part.partition('-'); out |= set(range(int(a, 16), int(b2 or a, 16) + 1))
    return out
def faces_from(css, fam='Ledger Serif SC'):
    return [(m.group(1), parse_ranges(m.group(2))) for m in re.finditer(r'"' + fam + r'"; src: url\("([^"]+)"\)[^}]*unicode-range: ([^;]+);', css)]

async def page(b, lang='zh-CN', w=390, sw='block', skin='minimal'):
    ctx = await b.new_context(locale=lang, viewport={'width': w, 'height': 844}, reduced_motion='reduce', service_workers=sw)
    if skin: await ctx.add_init_script("localStorage.setItem('growth-plan:skin', '%s')" % skin)
    p = await ctx.new_page(); fonts = []; errs = []
    p.on('request', lambda r: fonts.append(r.url.split('/')[-1]) if r.url.endswith('.woff2') else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    return ctx, p, fonts, errs

async def main():
    # ---- 静态检查：文件大小、码位不重叠、切片完整 ----
    css = open(os.path.join(ROOT, 'style.css'), encoding='utf-8').read()
    chunk_css = open(os.path.join(ROOT, 'fonts', 'serif-sc.css'), encoding='utf-8').read()
    crit = faces_from(css); chunks = faces_from(chunk_css)
    ok('style.css declares only the critical SC face', len(crit) == 1 and crit[0][0] == 'fonts/ledger-serif-sc-ui.woff2', [c[0] for c in crit])
    ok('serif-sc.css declares >= 8 on-demand chunks', len(chunks) >= 8, len(chunks))
    crit_size = os.path.getsize(os.path.join(ROOT, 'fonts', 'ledger-serif-sc-ui.woff2'))
    ok(f'critical chunk < 80 KB ({crit_size/1024:.1f} KB)', crit_size < 80 * 1024)
    ok('every chunk file exists', all(os.path.exists(os.path.join(ROOT, 'fonts', f)) for f, _ in chunks))
    ok('no stale monolithic ledger-serif-sc.woff2', not os.path.exists(os.path.join(ROOT, 'fonts', 'ledger-serif-sc.woff2')))
    allsets = [crit[0][1]] + [r for _, r in chunks]
    ok('unicode-ranges do not overlap', sum(len(s) for s in allsets) == len(set().union(*allsets)))
    covered = set().union(*allsets)
    gb1 = set()
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try: gb1.add(ord(bytes([hi, lo]).decode('gb2312')))
            except UnicodeDecodeError: pass
    ok(f'covers all GB2312 level-1 hanzi ({len(gb1)})', gb1 <= covered, len(gb1 - covered))
    ok('index.html preloads only the critical chunk (script-inserted per skin)', "fonts/ledger-serif-sc-ui.woff2" in open(os.path.join(ROOT, 'index.html')).read() and not re.search(r'ledger-serif-sc-\d\d', open(os.path.join(ROOT, 'index.html')).read()))
    sw = open(os.path.join(ROOT, 'sw.js')).read()
    ok('SW precaches critical chunk + chunk CSS, not on-demand chunks', "'./fonts/ledger-serif-sc-ui.woff2'" in sw and "'./fonts/serif-sc.css?v=" in sw and not re.search(r"ledger-serif-sc-\d\d", sw.split('SHELL')[1].split('];')[0]))

    # ---- 像素字体（田园 / 电玩 / 星夜）----
    pcss = open(os.path.join(ROOT, 'pixel.css'), encoding='utf-8').read()
    pchunk_css = open(os.path.join(ROOT, 'fonts', 'px-sc.css'), encoding='utf-8').read()
    pcrit = faces_from(pcss, 'FusionPx'); pchunks = faces_from(pchunk_css, 'FusionPx')
    ok('pixel.css declares only the critical FusionPx face', len(pcrit) == 1 and pcrit[0][0] == 'fonts/px-sc-ui.woff2', [c[0] for c in pcrit])
    ok('px-sc.css declares >= 6 on-demand chunks', len(pchunks) >= 6, len(pchunks))
    psize = os.path.getsize(os.path.join(ROOT, 'fonts', 'px-sc-ui.woff2'))
    ok(f'critical pixel chunk < 40 KB ({psize/1024:.1f} KB)', psize < 40 * 1024)
    ok('every pixel chunk file exists', all(os.path.exists(os.path.join(ROOT, 'fonts', f)) for f, _ in pchunks))
    psets = [pcrit[0][1]] + [r for _, r in pchunks]
    ok('pixel unicode-ranges do not overlap', sum(len(x) for x in psets) == len(set().union(*psets)))
    ok('pixel chunks cover all GB2312 level-1 hanzi', gb1 <= set().union(*psets), len(gb1 - set().union(*psets)))
    ui_cjk = set()
    for f in ('index.html', 'app.js', 'i18n.js', 'skin.js', 'cloud.js'):
        t = open(os.path.join(ROOT, f), encoding='utf-8').read()
        t = re.sub(r'(?m)^\s*//.*$', '', t); t = re.sub(r'\s//\s.*$', '', t, flags=re.M); t = re.sub(r'/\*.*?\*/', '', t, flags=re.S); t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
        ui_cjk |= {ord(c) for c in t if '\u3400' <= c <= '\u9fff'}
    ok('every UI hanzi is in the critical pixel chunk', ui_cjk <= pcrit[0][1], ''.join(chr(c) for c in sorted(ui_cjk - pcrit[0][1]))[:40])
    ok('SW precaches px critical chunk + px-sc.css, not on-demand pixel chunks', "'./fonts/px-sc-ui.woff2'" in sw and "'./fonts/px-sc.css?v=" in sw and not re.search(r"px-sc-\d\d", sw.split('SHELL')[1].split('];')[0]))

    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for w in (390, 1280):
            ctx, p, fonts, errs = await page(b, w=w)
            await p.goto(URL); await p.wait_for_load_state('networkidle'); await p.wait_for_timeout(600)
            sc = sorted(f for f in fonts if 'serif-sc' in f)
            ok(f'zh landing ({w}px): only critical SC chunk downloaded', sc == ['ledger-serif-sc-ui.woff2'], sc)
            # 首页上所有用衬线的中文都在关键切片里
            miss = await p.evaluate("""(crit) => {
              const set = new Set(crit), out = new Set();
              document.querySelectorAll('#landing *').forEach(el => {
                if (!el.offsetParent && el.tagName !== 'BODY') return;
                if (!/Ledger Serif/.test(getComputedStyle(el).fontFamily)) return;
                for (const n of el.childNodes) if (n.nodeType === 3) for (const ch of n.nodeValue) if (/[\\u3400-\\u9fff]/.test(ch) && !set.has(ch.codePointAt(0))) out.add(ch);
              }); return [...out].join(''); }""", sorted(crit[0][1]))
            ok(f'zh landing ({w}px): all serif CJK glyphs in critical chunk', miss == '', miss)
            ok(f'zh landing ({w}px): critical face loaded', await p.evaluate("document.fonts.check('600 32px \"Ledger Serif SC\"', '安静地记下来')"))
            ok(f'zh landing ({w}px): chunk stylesheet applied (non-blocking)', await p.evaluate("[...document.styleSheets].some(s => /serif-sc\\.css(\\?v=\\d+)?$/.test(s.href || '') && s.media.mediaText === 'all')"))
            if w == 390:
                # 进入应用 → 改写一句话（含关键切片之外的常用字）→ 对应切片按需下载，标题仍用思源宋体
                await p.click('#landingCta'); await p.wait_for_timeout(150); await p.click('#gateLocal'); await p.wait_for_timeout(400)
                sc_app = sorted(f for f in fonts if 'serif-sc' in f)
                ok('zh app (default content): still only critical chunk', sc_app == ['ledger-serif-sc-ui.woff2'], sc_app)
                motto = '春风十里，不如读书。'
                need = {f for f, r in chunks if any(ord(c) in r for c in motto)}
                await p.click('#editMotto'); await p.fill('#mText', motto); await p.click('#formMotto .btn--primary')
                await p.wait_for_timeout(1200)
                got = {f for f in fonts if re.match(r'ledger-serif-sc-\d\d', f)}
                ok('typed motto: exactly the chunks covering its chars load on demand', got == {n.split('/')[-1] for n in need}, (sorted(got), sorted(need)))
                ok('typed motto: all its glyphs available in Ledger Serif SC', await p.evaluate("t => document.fonts.check('500 40px \"Ledger Serif SC\"', t)", motto))
                rendered = await p.evaluate("""() => [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Ledger Serif SC' && f.status === 'loaded').length""")
                ok('typed motto: chunk faces now loaded', rendered >= 1 + len(need), rendered)
            ok(f'no page errors ({w}px)', not errs, errs)
            await ctx.close()
        # 像素主题（默认田园）：首屏只下关键切片；用户写的中文按需下载对应切片
        ctx, p, fonts, errs = await page(b, skin=None)
        await p.goto(URL); await p.wait_for_load_state('networkidle'); await p.wait_for_timeout(600)
        pxf = sorted(f for f in fonts if f.startswith('px-sc'))
        ok('pixel zh landing: only px-sc-ui downloaded, no serif', pxf == ['px-sc-ui.woff2'] and not any('serif' in f for f in fonts), fonts)
        ok('pixel zh: critical face loaded', await p.evaluate("document.fonts.check('16px FusionPx', '把小小的进步')"))
        await p.click('#landingCta'); await p.wait_for_timeout(150); await p.click('#gateLocal'); await p.wait_for_timeout(500)
        ok('pixel zh app: still only px-sc-ui', sorted(f for f in fonts if f.startswith('px-sc')) == ['px-sc-ui.woff2'], fonts)
        name = '晨跑绕湖两圈'
        need = {f.split('/')[-1] for f, r in pchunks if any(ord(c) in r for c in name)}
        await p.click('[data-action="add-habit"]'); await p.wait_for_timeout(200); await p.fill('#hName', name); await p.click('#formHabit .btn--primary'); await p.wait_for_timeout(1200)
        got = {f for f in fonts if re.match(r'px-sc-\d\d', f)}
        ok('typed habit name: exactly its pixel chunks load on demand', got == need and need, (sorted(got), sorted(need)))
        ok('typed habit name renders in FusionPx', await p.evaluate("t => document.fonts.check('16px FusionPx', t)", name))
        ok('no page errors (pixel)', not errs, errs)
        await ctx.close()
        ctx, p, fonts, errs = await page(b, lang='en-US', w=1280, skin=None)
        await p.goto(URL); await p.wait_for_load_state('networkidle'); await p.wait_for_timeout(600)
        ok('pixel EN landing: px-latin only, no Chinese pixel font', 'px-latin.woff2' in fonts and not any(f.startswith('px-sc') for f in fonts), fonts)
        await ctx.close()
        # 英文：完全不下中文字体
        ctx, p, fonts, errs = await page(b, lang='en-US', w=1280)
        await p.goto(URL); await p.wait_for_load_state('networkidle'); await p.wait_for_timeout(600)
        ok('EN landing: no Chinese font downloaded', not any('serif-sc' in f for f in fonts), fonts)
        await ctx.close()
        # SW：预缓存关键切片；用到的常用字切片在运行时写入缓存（离线可用）
        ctx, p, fonts, errs = await page(b, sw='allow')
        await p.goto(URL); await p.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true)', timeout=10000)
        await p.reload(); await p.wait_for_timeout(800)
        keys = await p.evaluate("caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys()).then(rs => rs.map(r => r.url))))).then(a => a.flat())")
        ok('SW cache: v12, critical chunk precached, no on-demand chunk yet', await p.evaluate("caches.keys()") == ['gp-shell-v12-ledger'] and any(k.endswith('ledger-serif-sc-ui.woff2') for k in keys) and not any(re.search(r'sc-\d\d\.woff2$', k) for k in keys), keys)
        await p.click('#landingCta'); await p.wait_for_timeout(150); await p.click('#gateLocal'); await p.wait_for_timeout(300)
        await p.click('#editMotto'); await p.fill('#mText', '春风十里，不如读书。'); await p.click('#formMotto .btn--primary'); await p.wait_for_timeout(1500)
        keys = await p.evaluate("caches.open('gp-shell-v12-ledger').then(c => c.keys()).then(rs => rs.map(r => r.url))")
        ok('SW: on-demand chunk runtime-cached after use', any(re.search(r'sc-\d\d\.woff2$', k) for k in keys))
        await ctx.close()
        await b.close()
    n = sum(1 for _, c in results if c); print(f'\n{n}/{len(results)} passed'); sys.exit(0 if n == len(results) else 1)
asyncio.run(main())
