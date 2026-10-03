"""v12 四个标签页截图：python3 tools/tabs_shots.py   （需 python3 -m http.server 8765 在 growth-plan-app 里）
shots/tabs-today.png / tabs-stats.png / tabs-habits.png / tabs-me.png（390×844 @3x，田园，中文）
shots/tabs-cuties-today.png（小可爱主题）  shots/tabs-desktop-stats.png（1440×900）"""
import sys, asyncio
sys.path.insert(0, '/workspace/growth-plan-app/tools')
import v10_shots as V
from playwright.async_api import async_playwright
BASE = 'http://127.0.0.1:8765/'
OUT = '/workspace/growth-plan-app/shots/'

async def enter(p, lang='zh'):
    await p.goto(BASE); await p.wait_for_timeout(1500)
    await p.click('#landingCta'); await p.wait_for_timeout(400)
    await p.click('#gateLocal'); await p.wait_for_timeout(500)
    await p.evaluate(V.SEED.replace('__NOTES__', V.NOTES_ZH if lang == 'zh' else V.NOTES_EN))
    await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.archive=[{id:'ar1',name:'每天背 20 个单词',seal:'词',area:'a-study',freq:'daily',days:[0,1,2,3,4,5,6],created:'2026-08-01'}];GP.replace(s)})()")
    await p.evaluate("sessionStorage.setItem('growth-plan:guest-hide','1');GP.paintGuest();document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
    await p.wait_for_timeout(300)

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--font-render-hinting=none'])
        errs_all = []
        ctx, p, errs = await V.app_page(b, 'farm', 390, 844, 3, 'zh')
        await enter(p)
        for tab in ('today', 'stats', 'habits', 'me'):
            await p.evaluate("t => { location.hash = '#/' + t }", tab); await p.wait_for_timeout(700)
            await p.evaluate("document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
            await p.screenshot(path=OUT + 'tabs-%s.png' % tab)
            print(tab, 'overflow', await p.evaluate("document.documentElement.scrollWidth - innerWidth"))
        errs_all += errs; await ctx.close()
        ctx, p, errs = await V.app_page(b, 'cuties', 390, 844, 3, 'zh')
        await ctx.add_init_script("localStorage.setItem('growth-plan:cuties','1')")
        await enter(p)
        await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs.cutiesUnlocked=true;s.prefs.theme='cuties';GP.replace(s);GP.setSkin('cuties')})()")
        await p.wait_for_timeout(600)
        await p.evaluate("Crew.draw({chii:['doze',500],hachi:['think',800],usagi:['open',0]},10000)")
        await p.screenshot(path=OUT + 'tabs-cuties-today.png')
        errs_all += errs; await ctx.close()
        ctx, p, errs = await V.app_page(b, 'farm', 1440, 900, 2, 'zh')
        await enter(p)
        await p.evaluate("location.hash = '#/stats'"); await p.wait_for_timeout(800)
        await p.screenshot(path=OUT + 'tabs-desktop-stats.png')
        errs_all += errs; await ctx.close()
        await b.close()
        print('errors', [e for e in errs_all if 'Service Worker' not in e])
asyncio.run(main())
