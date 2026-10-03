"""首次加载字节数（中文首页）：列出首屏请求、字体请求，以及 Service Worker 安装后预缓存的额外字节。
用法：python3 tools/gp_firstload.py [URL]"""
import asyncio, sys, gzip, json
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
async def run(b, sw, w=390):
    ctx = await b.new_context(locale='zh-CN', viewport={'width': w, 'height': 844}, service_workers='allow' if sw else 'block')
    p = await ctx.new_page(); reqs = {}
    async def on_fin(r):
        try:
            body = await r.response()
            if body is None: return
            data = await body.body()
            reqs[r.url] = (len(data), len(gzip.compress(data)) if not r.url.endswith(('.woff2', '.png')) else len(data), r.resource_type)
        except Exception: pass
    p.on('requestfinished', lambda r: asyncio.ensure_future(on_fin(r)))
    await p.goto(URL); await p.wait_for_load_state('networkidle'); await p.wait_for_timeout(1500 if sw else 600)
    await ctx.close()
    return reqs
def sw_precache():
    import urllib.request, re as _re
    sw = urllib.request.urlopen(URL + 'sw.js').read().decode()
    files = _re.findall(r"'\./([^']*)'", sw.split('var SHELL')[1].split('];')[0])
    return sum(len(urllib.request.urlopen(URL + f).read()) for f in files if f)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await run(b, False)
        def tot(d, pred=lambda u: True): return sum(v[0] for u, v in d.items() if pred(u)), sum(v[1] for u, v in d.items() if pred(u))
        fonts = {u.split('/')[-1]: v[0] for u, v in page.items() if '.woff2' in u}
        out = {'page_raw': tot(page)[0], 'page_gzip': tot(page)[1], 'page_fonts': fonts, 'page_font_bytes': sum(fonts.values()),
               'sw_precache_raw': sw_precache()}
        for u, v in sorted(page.items(), key=lambda x: -x[1][0]): print(f'{v[0]:9d} {v[1]:9d}  {u.split("/", 3)[-1]}')
        print(json.dumps(out, ensure_ascii=False))
        await b.close()
asyncio.run(main())
