"""v12 截图：新手指引每一步 + 空状态（390×844 @3x，中文，田园）
python3 tools/v12_shots.py [skin] [lang]   → shots/v12-onb-1.png / -2.png / -2-yay.png / -3.png / v12-empty.png"""
import sys, asyncio
sys.path.insert(0, '/workspace/growth-plan-app/tools')
from v10_shots import app_page, OUT, BASE
import gp_noonb; gp_noonb.disable()
from playwright.async_api import async_playwright
SKIN = sys.argv[1] if len(sys.argv) > 1 else 'farm'
LANG = sys.argv[2] if len(sys.argv) > 2 else 'zh'
SUF = '' if (SKIN, LANG) == ('farm', 'zh') else '-%s-%s' % (SKIN, LANG)

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--font-render-hinting=none'])
        ctx, p, errs = await app_page(b, SKIN, 390, 844, 3, LANG)
        if SKIN == 'cuties': await ctx.add_init_script("localStorage.setItem('growth-plan:cuties','1')")
        await p.goto(BASE); await p.wait_for_timeout(1500)
        await p.click('#landingCta'); await p.wait_for_timeout(400)
        await p.click('#gateLocal'); await p.wait_for_timeout(900)
        if SKIN == 'cuties':
            await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs.cutiesUnlocked=true;s.prefs.theme='cuties';GP.replace(s);GP.setSkin('cuties')})()")
        await p.evaluate("sessionStorage.setItem('growth-plan:guest-hide','1');GP.paintGuest()")
        await p.wait_for_selector('#dlgOnb[open]', timeout=5000)
        await p.wait_for_timeout(500)
        await p.screenshot(path=OUT + 'v12-onb-1%s.png' % SUF)
        await p.click('[data-tpl="read"]'); await p.wait_for_timeout(900)
        await p.screenshot(path=OUT + 'v12-onb-2%s.png' % SUF)
        await p.click('#habitList .seal'); await p.wait_for_timeout(800)   # 等数字滚完（700ms），截到最终值
        await p.screenshot(path=OUT + 'v12-onb-2-yay%s.png' % SUF)
        await p.wait_for_selector('#dlgOnb[open]', timeout=5000); await p.wait_for_timeout(500)
        await p.screenshot(path=OUT + 'v12-onb-3%s.png' % SUF)
        await p.click('#onbStart'); await p.wait_for_timeout(300)
        # 空状态：删掉所有习惯
        await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.habits=[];s.log={};GP.replace(s)})()")
        await p.evaluate("document.querySelectorAll('#toasts .toast').forEach(t=>t.remove())")
        await p.evaluate("document.getElementById('today').scrollIntoView()"); await p.wait_for_timeout(1500)
        await p.screenshot(path=OUT + 'v12-empty%s.png' % SUF)
        print('ov', await p.evaluate("document.documentElement.scrollWidth-innerWidth"), 'errs', [e for e in errs if 'Service Worker' not in e])
        await ctx.close(); await b.close()
asyncio.run(main())
