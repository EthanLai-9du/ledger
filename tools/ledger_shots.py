"""Ledger 截图：应用 desktop 1440 / mobile 390 × light/dark，登录页 desktop/mobile × light/dark
用法：python3 tools/ledger_shots.py <tag>   （需本地服务器 127.0.0.1:8765）"""
import sys, asyncio
from playwright.async_api import async_playwright
tag = sys.argv[1] if len(sys.argv) > 1 else 'ledger'
BASE = 'http://127.0.0.1:8765/'
OUT = '/workspace/growth-plan-app/shots/'
FAKE = "window.SUPABASE_URL='https://qgqfbouvhbenjgcrstyz.supabase.co';window.SUPABASE_KEY='sb_publishable_MOCK_0123456789abcdef';"
VIEWS = [('desktop', 1440, 900, 1), ('mobile', 390, 844, 2)]
async def settle(p):
    h = await p.evaluate('document.body.scrollHeight')
    for y in range(0, h, 400):
        await p.evaluate(f'window.scrollTo(0,{y})'); await p.wait_for_timeout(40)
    await p.evaluate('window.scrollTo(0,0)'); await p.wait_for_timeout(1200)
async def main():
    errs = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for scheme in ('light', 'dark'):
            for name, w, h, dpr in VIEWS:
                # 登录页
                ctx = await b.new_context(locale='zh-CN', viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=dpr, service_workers='block')
                await ctx.route('**/config.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE))
                p = await ctx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)))
                p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
                await p.goto(BASE); await p.wait_for_timeout(1500)
                await p.click('#landingCta'); await p.wait_for_timeout(900)
                await p.evaluate('document.activeElement && document.activeElement.blur()')
                await p.screenshot(path=f'{OUT}{tag}-login-{name}-{scheme}.png')
                # 应用
                await p.click('#gateLocal'); await p.wait_for_timeout(300)
                await settle(p)
                await p.screenshot(path=f'{OUT}{tag}-app-{name}-{scheme}.png')
                await p.screenshot(path=f'{OUT}{tag}-app-{name}-{scheme}-full.png', full_page=True)
                if scheme == 'light':
                    await p.locator('#today').scroll_into_view_if_needed(); await p.wait_for_timeout(200)
                    seals = p.locator('#habitList .seal')
                    for i in range(2): await seals.nth(i).click(); await p.wait_for_timeout(200)
                    await p.locator('.task input').nth(2).check(); await p.wait_for_timeout(700)
                    await p.locator('#today').scroll_into_view_if_needed(); await p.wait_for_timeout(300)
                    await p.screenshot(path=f'{OUT}{tag}-app-{name}-{scheme}-checked.png')
                    await p.click('[data-action="add-habit"]'); await p.wait_for_timeout(500)
                    await p.screenshot(path=f'{OUT}{tag}-dialog-{name}-{scheme}.png')
                await ctx.close()
        await b.close()
    print('errors:', errs)
asyncio.run(main())
