import sys, asyncio
from playwright.async_api import async_playwright
tag = sys.argv[1] if len(sys.argv) > 1 else 'r1'
URL = 'file:///workspace/growth-plan-app/index.html'
OUT = '/workspace/growth-plan-app/shots/app-'
VIEWS = [('desktop',1440,900),('tablet',768,1024),('mobile',390,844)]
async def settle(p):
    h = await p.evaluate('document.body.scrollHeight')
    for y in range(0, h, 400):
        await p.evaluate(f'window.scrollTo(0,{y})'); await p.wait_for_timeout(60)
    await p.evaluate('window.scrollTo(0,0)'); await p.wait_for_timeout(1400)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errors = []
        for scheme in ['light','dark']:
            for name,w,h in VIEWS:
                ctx = await b.new_context(locale='zh-CN', viewport={'width':w,'height':h}, color_scheme=scheme, device_scale_factor=1 if w>800 else 2)
                await ctx.add_init_script("localStorage.getItem('growth-plan:mode') || localStorage.setItem('growth-plan:mode','local')")
                p = await ctx.new_page()
                p.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
                p.on('pageerror', lambda e: errors.append(str(e)))
                await p.goto(URL); await settle(p)
                await p.screenshot(path=f'{OUT}{tag}-{name}-{scheme}-fold.png')
                await p.screenshot(path=f'{OUT}{tag}-{name}-{scheme}-full.png', full_page=True)
                if scheme=='light' and name in ('desktop','mobile'):
                    seals = p.locator('#habitList .seal')
                    n = await seals.count()
                    for i in range(min(3,n)):
                        await seals.nth(i).click(); await p.wait_for_timeout(250)
                    await p.locator('.task input').nth(2).check()
                    await p.wait_for_timeout(900)
                    await p.locator('#today').scroll_into_view_if_needed(); await p.wait_for_timeout(300)
                    await p.screenshot(path=f'{OUT}{tag}-{name}-checked.png')
                    await p.evaluate('window.scrollTo(0,0)'); await p.wait_for_timeout(900)
                    await p.screenshot(path=f'{OUT}{tag}-{name}-checked-full.png', full_page=True)
                    await p.locator('#today').scroll_into_view_if_needed()
                    for i in range(3, n):
                        await seals.nth(i).click(); await p.wait_for_timeout(120)
                    await p.wait_for_timeout(380)
                    await p.screenshot(path=f'{OUT}{tag}-{name}-celebrate.png')
                    await p.wait_for_timeout(2200)
                    await p.click('[data-action="add-goal"]'); await p.wait_for_timeout(600)
                    await p.screenshot(path=f'{OUT}{tag}-{name}-dialog.png')
                await ctx.close()
        await b.close()
        print('console errors:', errors)
asyncio.run(main())

async def focus_shot():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        p = await b.new_page(viewport={'width':1440,'height':900})
        await p.add_init_script("localStorage.setItem('growth-plan:mode','local')")
        await p.goto(URL); await settle(p)
        await p.locator('#habitList .seal').nth(1).focus()
        await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab')
        await p.locator('#habitList .habit').nth(1).scroll_into_view_if_needed(); await p.wait_for_timeout(400)
        await p.screenshot(path=f'{OUT}{tag}-desktop-focus.png', clip={'x':250,'y':0,'width':1000,'height':500})
        await b.close()
asyncio.run(focus_shot())
