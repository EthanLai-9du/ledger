"""v11 截图：python3 tools/v11_shots.py [only]
- v11-guest-farm-zh / v11-guest-*-360：游客模式提示条
- v11-cuties-header / v11-cuties-hop：解锁后的主题（390×844 @3x）"""
import sys, asyncio
sys.path.insert(0, '/workspace/growth-plan-app/tools')
from v10_shots import app_page, enter_app, OUT
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
ONLY = sys.argv[1] if len(sys.argv) > 1 else ''
UNLOCK = "try{localStorage.setItem('growth-plan:cuties','1')}catch(e){}"

async def shot_guest(b, skin, lang, w, h, dpr, name):
    ctx, p, errs = await app_page(b, skin, w, h, dpr, lang)
    if skin == 'cuties': await ctx.add_init_script(UNLOCK)
    await enter_app(p, lang)
    if skin == 'cuties':
        await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs.cutiesUnlocked=true;s.prefs.theme='cuties';GP.replace(s);GP.setSkin('cuties')})()")
        await p.wait_for_timeout(300)
        await p.evaluate("Crew.draw({chii:['doze',500],hachi:['think',800],usagi:['open',0]},10000)")
    await p.wait_for_timeout(300)
    vis = await p.evaluate("!document.getElementById('guest').hidden")
    ov = await p.evaluate("document.documentElement.scrollWidth - innerWidth")
    await p.screenshot(path=OUT + name + '.png', clip={'x': 0, 'y': 0, 'width': w, 'height': min(h, 560)})
    print(name, 'visible', vis, 'overflow', ov, 'errs', errs[:3])
    await ctx.close()

async def shot_cuties(b):
    ctx, p, errs = await app_page(b, 'cuties', 390, 844, 3, 'zh')
    await ctx.add_init_script(UNLOCK)
    await enter_app(p, 'zh')
    await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs.cutiesUnlocked=true;s.prefs.theme='cuties';GP.replace(s);GP.setSkin('cuties')})()")
    await p.evaluate("sessionStorage.setItem('growth-plan:guest-hide','1');GP.paintGuest()")
    await p.wait_for_timeout(500)
    await p.evaluate("Crew.draw({chii:['doze',500],hachi:['think',800],usagi:['open',0]},10000)")
    await p.wait_for_timeout(100)
    await p.screenshot(path=OUT + 'v11-cuties-header.png')
    await p.evaluate("Crew.draw('hop',10000,400)")
    await p.wait_for_timeout(100)
    await p.screenshot(path=OUT + 'v11-cuties-hop.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 520})
    print('cuties errs', errs[:3])
    await ctx.close()

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--font-render-hinting=none'])
        if ONLY in ('', 'guest'):
            await shot_guest(b, 'farm', 'zh', 390, 844, 3, 'v11-guest-farm-zh')
            await shot_guest(b, 'farm', 'en', 390, 844, 3, 'v11-guest-farm-en')
            for sk in ('minimal', 'arcade', 'night', 'cuties'):
                await shot_guest(b, sk, 'zh', 360, 740, 2, 'v11-guest-%s-360' % sk)
            await shot_guest(b, 'minimal', 'en', 360, 740, 2, 'v11-guest-minimal-en-360')
        if ONLY in ('', 'cuties'):
            await shot_cuties(b)
        await b.close()
asyncio.run(main())
