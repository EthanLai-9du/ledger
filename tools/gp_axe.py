import asyncio, sys
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
URL = sys.argv[1] if len(sys.argv) > 1 else 'file:///workspace/growth-plan-app/index.html'
FAKE = "window.SUPABASE_URL='https://qgqfbouvhbenjgcrstyz.supabase.co';window.SUPABASE_KEY='sb_publishable_MOCK_0123456789abcdef';"
RUN = "axe.run(document,{runOnly:['wcag2a','wcag2aa','best-practice']}).then(r=>r.violations.map(v=>[v.id,v.impact,v.nodes.length,v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').slice(0,200))]))"
async def m():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        total = 0; runs = 0
        combos = [('farm', 'light'), ('arcade', 'dark'), ('night', 'dark'), ('minimal', 'light'), ('minimal', 'dark'), ('cuties', 'light')]
        if _o.environ.get('ONLY'): combos = [c for c in combos if c[0] == _o.environ['ONLY']]
        for lang in ('zh-CN', 'en-US'):
          for skin, scheme in combos:
            for state in ('landing', 'auth', 'app', 'today', 'stats', 'stats-desk', 'habits', 'habits-desk', 'me', 'me-desk', 'note', 'dialog', 'onb1', 'onb2', 'onb3', 'empty'):   # 四标签页v12：每个标签手机 + 桌面；note = 习惯条目打开的笔记框
                MOB = state in ('today', 'stats', 'habits', 'me', 'note', 'onb1', 'onb2', 'onb3', 'empty')
                ctx=await b.new_context(locale=lang, viewport={'width': 390 if MOB else 1280, 'height': 844 if MOB else 900}, color_scheme=scheme, reduced_motion='reduce', service_workers='block')
                await ctx.add_init_script("localStorage.setItem('growth-plan:skin', '%s')" % skin + (";localStorage.setItem('growth-plan:cuties','1')" if skin == 'cuties' else ''))
                ONB = state in ('onb1', 'onb2', 'onb3', 'empty')
                if ONB: await ctx.add_init_script("if(!sessionStorage.getItem('axe-onb')){sessionStorage.setItem('axe-onb','1');localStorage.removeItem('growth-plan:onboarded')}")
                p=await ctx.new_page()
                if URL.startswith('http'): await ctx.route('**/config.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE))
                await p.goto(URL); await p.wait_for_timeout(900)
                if state != 'landing': await p.click('#landingCta'); await p.wait_for_timeout(700)
                if state not in ('landing', 'auth'): await p.click('#gateLocal'); await p.wait_for_timeout(500)
                if skin == 'cuties' and state not in ('landing', 'auth'):
                    await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs.cutiesUnlocked=true;s.prefs.theme='cuties';GP.replace(s);GP.setSkin('cuties')})()"); await p.wait_for_timeout(300)
                    assert await p.evaluate("document.documentElement.dataset.skin") == 'cuties'
                if state == 'app': assert await p.evaluate("!document.getElementById('guest').hidden"), 'guest banner should be visible'
                tab = state.split('-')[0]
                if tab in ('stats', 'habits', 'me'): await p.click('.tabbar__a[data-tab="%s"]' % tab); await p.wait_for_timeout(400); assert await p.evaluate("GP.tab()") == tab
                if tab == 'habits':
                    await p.locator('#mgrList [data-act="mgr-arch"]').last.click(); await p.wait_for_timeout(300)
                    await p.evaluate("document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
                    await p.click('#mgrArchWrap summary'); await p.wait_for_timeout(200)
                if state == 'note': await p.locator('#habitList [data-act="note"]').first.click(); await p.wait_for_timeout(300); assert await p.evaluate("document.getElementById('dlgNote').open")
                if state == 'dialog': await p.click('[data-action="add-habit"]'); await p.check('input[name="freq"][value="days"]'); await p.wait_for_timeout(300)
                if ONB:
                    await p.wait_for_selector('#dlgOnb[open]', timeout=5000)
                    if state == 'empty': await p.click('#onbSkip'); await p.wait_for_timeout(300); assert await p.locator('#habitEmpty').is_visible()
                    if state in ('onb2', 'onb3'): await p.click('[data-tpl="read"]'); await p.wait_for_timeout(600); assert await p.locator('#coach').is_visible()
                    if state == 'onb3': await p.click('#habitList .seal'); await p.wait_for_selector('#dlgOnb[open]', timeout=4000); await p.wait_for_timeout(200)
                await p.add_script_tag(path='/tmp/axe/node_modules/axe-core/axe.min.js')
                r=await p.evaluate(RUN)
                print(lang, skin, scheme, state, 'violations:', len(r)); total += len(r); runs += 1
                for v in r: print(' ',v)
                await ctx.close()
        print('TOTAL', total, 'runs', runs)
        await b.close()
    sys.exit(1 if total else 0)
asyncio.run(m())
