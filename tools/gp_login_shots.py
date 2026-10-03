"""登录页截图：桌面 / 移动 × 浅色 / 深色；含未配置 key、错误提示、已寄出、登录后主界面"""
import asyncio, sys
sys.path.insert(0, '/workspace/growth-plan-app/tools')
from playwright.async_api import async_playwright
from gp_cloud_test import Mock, FAKE_CFG, SB
BASE = 'http://127.0.0.1:8765/'; OUT = '/workspace/growth-plan-app/shots/'
VIEWS = [('desktop', 1440, 900, 1), ('mobile', 390, 844, 3)]
async def main():
    mock = Mock(); mock.users['demo@example.com'] = {'id': '00000000-0000-4000-8000-000000000001', 'email': 'demo@example.com', 'password': 'secret123', 'confirmed': True}
    errs = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for scheme in ('light', 'dark'):
            for name, w, h, dpr in VIEWS:
                for cfg in ('configured', 'unconfigured'):
                    ctx = await b.new_context(locale='zh-CN', viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=dpr, service_workers='block')
                    p = await ctx.new_page()
                    p.on('pageerror', lambda e: errs.append(str(e)))
                    if cfg == 'unconfigured':
                        await ctx.route('**/config.js', lambda r: r.fulfill(content_type='application/javascript', body="window.SUPABASE_URL='https://qgqfbouvhbenjgcrstyz.supabase.co';window.SUPABASE_KEY='PASTE_PUBLISHABLE_KEY_HERE';"))
                    if cfg == 'configured':
                        await ctx.route('**/config.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE_CFG))
                        await ctx.route(SB + '/**', mock.handle)
                    await p.goto(BASE); await p.wait_for_timeout(1600)
                    await p.click('#landingCta'); await p.wait_for_timeout(900)
                    await p.evaluate('document.activeElement && document.activeElement.blur()')
                    tag = '' if cfg == 'configured' else '-unconfigured'
                    await p.screenshot(path=f'{OUT}login-{name}-{scheme}{tag}.png')
                    if cfg == 'configured' and scheme == 'light':
                        await p.fill('#authEmail', 'demo@example.com'); await p.fill('#authPass', 'wrong-pass'); await p.click('#authSubmit'); await p.wait_for_timeout(900)
                        await p.locator('#authMsg').scroll_into_view_if_needed()
                        await p.screenshot(path=f'{OUT}login-{name}-{scheme}-error.png')
                        await p.click('#magicBtn'); await p.wait_for_timeout(1000)
                        await p.screenshot(path=f'{OUT}login-{name}-{scheme}-sent.png')
                        await p.click('#sentBack'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
                        await p.wait_for_function("GPCloud.status() === 'synced'", timeout=8000); await p.wait_for_timeout(3200)
                        await p.screenshot(path=f'{OUT}app-{name}-{scheme}-signed-in.png')
                        await p.click('#syncPill'); await p.wait_for_timeout(700)
                        await p.screenshot(path=f'{OUT}account-{name}-{scheme}.png')
                    await ctx.close()
        await b.close()
    print('page errors:', errs)
asyncio.run(main())
