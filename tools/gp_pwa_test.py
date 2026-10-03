"""PWA 测试：manifest、图标、Service Worker 预缓存、离线打开、不缓存 Supabase 请求"""
import asyncio, json
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
BASE = 'http://127.0.0.1:8765/'
results = []
def ok(n, c, x=''): results.append(c); print(('PASS ' if c else 'FAIL ') + n, x if not c else '')
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(locale='zh-CN', viewport={'width': 390, 'height': 844}); p = await ctx.new_page(); errs = []
        p.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None); p.on('pageerror', lambda e: errs.append(str(e)))
        await p.goto(BASE)
        man = await p.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json())")
        ok('manifest parses', man['short_name'] == 'Ledger' and man['name'] == 'Ledger' and man['display'] == 'standalone')
        sizes = {(i['sizes'], i.get('purpose', 'any')) for i in man['icons']}
        ok('manifest has 192/512 any + maskable', {('192x192', 'any'), ('512x512', 'any'), ('512x512', 'maskable')} <= sizes)
        for i in man['icons'] + [{'src': 'icons/apple-touch-icon.png'}, {'src': 'icons/favicon-32.png'}]:
            dims = await p.evaluate("src => new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r(null); im.src = src; })", i['src'])
            ok('icon loads ' + i['src'], dims is not None and (('sizes' not in i) or f"{dims[0]}x{dims[1]}" == i['sizes']), dims)
        await p.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true)', timeout=10000)
        await p.reload(); await p.wait_for_timeout(800)
        ok('SW controls page', await p.evaluate('!!navigator.serviceWorker.controller'))
        keys = await p.evaluate("caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys()).then(rs => rs.map(r => r.url))))).then(a => a.flat())")
        need = ['index.html', 'icons/favicon-32.png', 'style.css', 'app.js', 'cloud.js', 'config.js', 'vendor/supabase.min.js', 'manifest.webmanifest']
        ok('shell precached', all(any(k.split('?')[0].endswith(n) for k in keys) for n in need), keys)
        ok('SW v12 cache only', await p.evaluate("caches.keys()") == ['gp-shell-v12-ledger'])
        ok('pixel shell precached (skin.js, pixel.css, critical pixel fonts)', all(any(k.split('?')[0].endswith(n) for k in keys) for n in ('skin.js', 'pixel.css', 'px-sc.css', 'px-sc-ui.woff2', 'px-latin.woff2', 'px-sym.woff2', 'px-arcade.woff2')), keys)
        ok('v11 files precached (crew.js, cuties.css)', all(any(k.split('?')[0].endswith(n) for k in keys) for n in ('crew.js', 'cuties.css')), keys)
        ok('on-demand pixel chunks not precached', not any(__import__('re').search(r'px-sc-\d\d', k) for k in keys))
        from PIL import Image
        mk = Image.open('/workspace/growth-plan-app/icons/icon-maskable-512.png').convert('RGB'); px = mk.load()
        lit = [(x, y) for y in range(0, 512, 4) for x in range(0, 512, 4) if sum(px[x, y]) > 200]
        ok('maskable icon: mark inside the 80% safe zone', lit and all((x - 256) ** 2 + (y - 256) ** 2 <= 204 ** 2 for x, y in lit))
        ok('no supabase.co in cache', not any('supabase.co' in k for k in keys))
        ok('landing shown first (SW-controlled)', await p.locator('#landing').is_visible())
        await p.click('#landingCta'); await p.click('#gateLocal'); await p.wait_for_timeout(200)
        await ctx.set_offline(True)
        await p.reload(); await p.wait_for_timeout(1000)
        ok('offline reload renders app', await p.locator('#habitList .habit').count() > 0 and await p.evaluate('typeof GP') == 'object')
        await p.locator('#habitList .seal').first.click(); await p.wait_for_timeout(200)
        ok('offline check-in works', await p.locator('#habitList .seal').first.get_attribute('aria-checked') == 'true')
        ok('sw.js excludes cross-origin', 'url.origin !== self.location.origin' in open('/workspace/growth-plan-app/sw.js').read())
        await ctx.set_offline(False)
        ok('no console errors', not errs, errs)
        await b.close()
    print('\n%d/%d passed' % (sum(results), len(results)))
asyncio.run(main())
