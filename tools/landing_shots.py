"""首页截图：phone 390x844 light/dark，desktop 1440x900 light（+ 可选 tag 前缀）
用法：python3 tools/landing_shots.py [tag]   （需本地服务器 127.0.0.1:8765）"""
import sys, asyncio
from playwright.async_api import async_playwright
tag = sys.argv[1] if len(sys.argv) > 1 else 'landing'
BASE = 'http://127.0.0.1:8765/'
OUT = '/workspace/growth-plan-app/shots/'
FAKE = "window.SUPABASE_URL='https://qgqfbouvhbenjgcrstyz.supabase.co';window.SUPABASE_KEY='sb_publishable_MOCK_0123456789abcdef';"
SHOTS = [('phone-light', 390, 844, 3, 'light'), ('phone-dark', 390, 844, 3, 'dark'), ('desktop-light', 1440, 900, 1, 'light'), ('desktop-dark', 1440, 900, 1, 'dark')]
async def main():
    errs = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for name, w, h, dpr, scheme in SHOTS:
            ctx = await b.new_context(locale='zh-CN', viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=dpr, service_workers='block', has_touch=w < 600, is_mobile=w < 600)
            await ctx.route('**/config.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE))
            p = await ctx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)))
            p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await p.goto(BASE); await p.wait_for_timeout(2600)
            await p.evaluate('document.activeElement && document.activeElement.blur()')
            await p.screenshot(path=f'{OUT}{tag}-{name}.png')
            if w < 600:
                await p.evaluate("document.querySelector('#gate').scrollTo(0, 99999)"); await p.wait_for_timeout(300)
                await p.screenshot(path=f'{OUT}{tag}-{name}-bottom.png')
                await p.evaluate("document.querySelector('#gate').scrollTo(0, 0)")
            await p.click('#landingCta'); await p.wait_for_timeout(900)
            await p.evaluate('document.activeElement && document.activeElement.blur()')
            await p.screenshot(path=f'{OUT}{tag}-{name}-auth.png')
            await ctx.close()
        await b.close()
    print('errors:', errs)
asyncio.run(main())
