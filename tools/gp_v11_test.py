"""v11：一个需要解锁的主题（连点设置里的 Ledger 标志 5 下）+ 游客模式提示条
运行前：在 growth-plan-app 目录 `python3 -m http.server 8765`"""
import asyncio, sys, re, base64, hashlib
sys.path.insert(0, '/workspace/growth-plan-app/tools')
from gp_cloud_test import Mock, new_page, wait_status, SB, FAKE_CFG
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
BASE = 'http://127.0.0.1:8765/'
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra if not cond else '')

async def enter_local(p):
    await p.goto(BASE); await p.wait_for_timeout(900)
    await p.click('#landingCta'); await p.wait_for_timeout(300)
    await p.click('#gateLocal'); await p.wait_for_timeout(400)

async def skins(p, sel):
    return await p.evaluate("s => [...document.querySelectorAll(s + ' [data-set-skin]')].map(b => b.dataset.setSkin)", sel)

async def taps(p, n, gap=120):
    for i in range(n):
        await p.click('#prefsLogo'); await p.wait_for_timeout(gap)

async def crew_hash(p):
    d = await p.evaluate("document.getElementById('crew').toDataURL()")
    return hashlib.md5(d.encode()).hexdigest()

async def overflow(p):
    return await p.evaluate("document.documentElement.scrollWidth - innerWidth")

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome')
        mock = Mock()
        # ---------- 1. 解锁前：完全看不到 ----------
        ctx, p, errs = await new_page(b, mock, viewport={'width': 390, 'height': 844})
        await p.goto(BASE); await p.wait_for_timeout(900)
        land = await p.evaluate("document.getElementById('landing') ? document.getElementById('landing').innerText : document.body.innerText")
        ok('landing: no mention of the hidden theme', '小可爱' not in land and 'Cuties' not in land and '吉伊' not in land)
        await p.click('#landingCta'); await p.wait_for_timeout(300); await p.click('#gateLocal'); await p.wait_for_timeout(400)
        ok('before unlock: no skins bar in the top bar (v12: themes live in 我的)', await p.locator('.skins--bar').count() == 0)
        ok('before unlock: no 小可爱 anywhere in the page text', '小可爱' not in await p.evaluate("document.body.innerText"))
        ok('crew canvas hidden', await p.evaluate("document.getElementById('crew').hidden"))
        ok('GP.setSkin(cuties) refused before unlock', (await p.evaluate("GP.setSkin('cuties'), document.documentElement.dataset.skin")) != 'cuties')
        r = await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs.theme='cuties';delete s.prefs.cutiesUnlocked;GP.replace(s);return [GP.get().prefs.theme, document.documentElement.dataset.skin]})()")
        ok('validate: cuties theme without unlock falls back to farm', r == ['farm', 'farm'], r)
        # ---------- 2. 解锁手势 ----------
        await p.evaluate("GP.goTab('me', true)"); await p.wait_for_timeout(300)
        ok('menu: 4 skins before unlock', await skins(p, '.skins--menu') == ['farm', 'arcade', 'night', 'minimal'])
        ok('menu footer shows logo + version', await p.locator('#prefsLogo svg').count() == 1 and 'Ledger · v1' in await p.locator('.prefs__ver').inner_text())
        await p.evaluate("document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
        await taps(p, 4)
        ok('4 taps: still locked', not await p.evaluate("!!GP.get().prefs.cutiesUnlocked") and await p.locator('#toasts .toast').count() == 0)
        await p.wait_for_timeout(3200)
        await taps(p, 2)
        ok('slow taps (gap > 3s) do not add up', not await p.evaluate("!!GP.get().prefs.cutiesUnlocked"))
        await p.wait_for_timeout(3200)
        await taps(p, 4, 300); await taps(p, 1, 300)
        ok('5 taps in ~1.5s: unlocked (state)', await p.evaluate("GP.get().prefs.cutiesUnlocked === true"))
        ok('local mirror set', await p.evaluate("localStorage.getItem('growth-plan:cuties')") == '1')
        tt = await p.locator('#toasts .toast').all_inner_texts()
        ok('toast: 解锁了隐藏主题：小可爱～', any('解锁了隐藏主题：小可爱～' in x for x in tt), tt)
        ok('option appears in 我的 (before minimal)', await skins(p, '.skins--menu') == ['farm', 'arcade', 'night', 'cuties', 'minimal'])
        await p.evaluate("document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
        await taps(p, 5, 100)
        tt = await p.locator('#toasts .toast').all_inner_texts()
        ok('5 more taps: 已经解锁啦～', any('已经解锁啦～' in x for x in tt), tt)
        # ---------- 3. 切到这个主题 ----------
        await p.click('.skins--menu [data-set-skin="cuties"]'); await p.wait_for_timeout(500)
        ok('theme applied + saved', await p.evaluate("document.documentElement.dataset.skin") == 'cuties' and await p.evaluate("GP.get().prefs.theme") == 'cuties')
        ok('name 小可爱 on the option', '小可爱' in await p.locator('.skins--menu [data-set-skin="cuties"]').inner_text())
        await p.keyboard.press('Escape'); await p.wait_for_timeout(300)
        ok('crew canvas shown + running', await p.evaluate("!document.getElementById('crew').hidden && Crew.running()"))
        box = await p.locator('#crew').bounding_box()
        ok('crew sits at the top card, inside viewport', box and box['width'] > 100 and box['x'] >= 0 and box['x'] + box['width'] <= 390, box)
        ok('theme-color pink', await p.evaluate("document.querySelector('meta[name=theme-color]').content") == '#fff5f7')
        ok('reset keeps the unlock', await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs={theme:'cuties',cutiesUnlocked:true};GP.replace(s);return GP.get().prefs.cutiesUnlocked})()"))
        # check-in → hop
        h0 = await crew_hash(p)
        await p.locator('#habitList .seal').first.click(); await p.wait_for_timeout(250)
        h1 = await crew_hash(p)
        ok('check-in: crew animates (frame changed)', h0 != h1)
        await p.reload(); await p.wait_for_timeout(1200)
        ok('after reload: still cuties (head script honours the mirror)', await p.evaluate("document.documentElement.dataset.skin") == 'cuties')
        ok('no console errors (1)', not errs, errs)
        # 360 px 无横向滚动（中文 + 英文，含提示条）
        for lang in ('zh', 'en'):
            await p.set_viewport_size({'width': 360, 'height': 740})
            await p.evaluate("l => { localStorage.setItem('growth-plan:lang', l); sessionStorage.removeItem('growth-plan:guest-hide'); }", lang)
            await p.reload(); await p.wait_for_timeout(1200)
            gv = await p.evaluate("!document.getElementById('guest').hidden")
            ok('360px %s cuties: banner visible + no overflow' % lang, gv and await overflow(p) == 0, (gv, await overflow(p)))
            for sk in ('farm', 'arcade', 'night', 'minimal'):
                await p.evaluate("s => GP.setSkin(s)", sk); await p.wait_for_timeout(300)
                ok('360px %s %s: no overflow' % (lang, sk), await overflow(p) == 0, await overflow(p))
            await p.evaluate("GP.goTab('me', true)"); await p.wait_for_timeout(300)
            ok('360px %s menu open: no overflow' % lang, await overflow(p) == 0)
            await p.keyboard.press('Escape'); await p.wait_for_timeout(200)
            await p.evaluate("GP.setSkin('cuties')")
        await p.evaluate("localStorage.setItem('growth-plan:lang', 'zh')")
        await ctx.close()

        # ---------- 4. 减少动态效果：静止，不跑动画 ----------
        ctx, p, errs = await new_page(b, mock, viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        await ctx.add_init_script("localStorage.setItem('growth-plan:cuties','1');localStorage.setItem('growth-plan:skin','cuties')")
        await enter_local(p)
        await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs.cutiesUnlocked=true;s.prefs.theme='cuties';GP.replace(s);GP.setSkin('cuties')})()")
        await p.wait_for_timeout(400)
        a = await crew_hash(p); await p.wait_for_timeout(1500); c = await crew_hash(p)
        ok('reduced motion: static frame, no RAF loop', a == c and not await p.evaluate("Crew.running()"))
        await p.locator('#habitList .seal').first.click(); await p.wait_for_timeout(400)
        ok('reduced motion: check-in does not animate', await crew_hash(p) == a and not await p.evaluate("Crew.running()"))
        ok('reduced motion: canvas drawn (not blank)', await p.evaluate("(()=>{const c=document.getElementById('crew'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i])return true;return false})()"))
        ok('no console errors (2)', not errs, errs)
        await ctx.close()

        # ---------- 5. 游客模式提示条 ----------
        ctx, p, errs = await new_page(b, mock, viewport={'width': 390, 'height': 844})
        await enter_local(p)
        g = p.locator('#guest')
        ok('guest banner visible in local mode', await g.is_visible())
        ok('zh text', await p.locator('#guestT').inner_text() == '游客模式：数据只存在本机，登录后才会同步到云端')
        ok('zh button 登录 / 注册', (await p.locator('#guestGo').inner_text()).strip() == '登录 / 注册')
        gb = await g.bounding_box(); tb = await p.locator('.topbar').bounding_box()
        ok('banner sits right under the top bar', gb and tb and abs(gb['y'] - (tb['y'] + tb['height'])) < 2, (gb, tb))
        for sk in ('farm', 'arcade', 'night', 'minimal'):
            await p.evaluate("s => GP.setSkin(s)", sk); await p.wait_for_timeout(200)
            st = await p.evaluate("(()=>{const g=getComputedStyle(document.getElementById('guest'));return g.backgroundColor+'|'+g.backgroundImage})()")
            ok('%s: banner styled (has background)' % sk, st != 'rgba(0, 0, 0, 0)|none', st)
        await p.evaluate("GP.setSkin('farm')")
        await p.click('#guestGo'); await p.wait_for_timeout(400)
        ok('登录 / 注册 opens the sign-in gate', await p.evaluate("GPCloud.view() !== null") or await p.locator('#authEmail').is_visible())
        await p.keyboard.press('Escape'); await p.wait_for_timeout(300)
        if await p.locator('#authEmail').is_visible(): await p.click('#gateLocal'); await p.wait_for_timeout(300)
        await p.click('#guestX'); await p.wait_for_timeout(200)
        ok('× hides it', not await g.is_visible())
        ok('focus moved somewhere sensible', await p.evaluate("document.activeElement !== document.body"))
        await p.reload(); await p.wait_for_timeout(1200)
        ok('stays hidden for this session (reload)', not await g.is_visible())
        p2 = await ctx.new_page()
        await p2.goto(BASE); await p2.wait_for_timeout(1200)
        ok('new tab/session: shown again', await p2.locator('#guest').is_visible())
        await p2.close()
        # EN
        await p.evaluate("localStorage.setItem('growth-plan:lang','en'); sessionStorage.clear()")
        await p.reload(); await p.wait_for_timeout(1200)
        ok('EN text', await p.locator('#guestT').inner_text() == 'Guest mode: data is saved on this device only. Log in to sync.')
        ok('EN button Log in', (await p.locator('#guestGo').inner_text()).strip() == 'Log in')
        ok('EN × label', await p.get_attribute('#guestX', 'aria-label') == 'Hide for this session')
        await p.evaluate("localStorage.setItem('growth-plan:lang','zh')")
        await p.reload(); await p.wait_for_timeout(1200)
        # 登录 → 消失；解锁标志随云同步
        await p.evaluate("GP.goTab('me', true)"); await p.wait_for_timeout(300)
        await taps(p, 5, 100)
        await p.keyboard.press('Escape'); await p.wait_for_timeout(200)
        await p.click('#guestGo'); await p.wait_for_timeout(300)
        await p.click('#tabUp'); await p.fill('#authEmail', 'cute@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('signup → synced', await wait_status(p, 'synced'))
        await p.wait_for_timeout(400)
        ok('logged in: banner gone', not await g.is_visible())
        await p.wait_for_timeout(1500)
        row = next(iter(mock.rows.values()), {}) if mock.rows else {}
        import json as _j
        ok('cloud row carries prefs.cutiesUnlocked', 'cutiesUnlocked' in _j.dumps(mock.rows.get(next((u['id'] for u in mock.users.values() if u['email'] == 'cute@test.dev'), ''), {})))
        ok('no console errors (3)', not errs, errs)
        await ctx.close()
        # 第二台设备
        ctx, p, errs = await new_page(b, mock, viewport={'width': 390, 'height': 844})
        await p.goto(BASE); await p.wait_for_timeout(900)
        ok('device 2 (signed out): no option', 'cuties' not in await skins(p, '.skins--menu'))
        await p.click('#landingCta'); await p.wait_for_timeout(200)
        await p.fill('#authEmail', 'cute@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('device 2 login → synced', await wait_status(p, 'synced'))
        await p.wait_for_timeout(500)
        ok('device 2 sees the option after sync', 'cuties' in await skins(p, '.skins--menu') and await p.evaluate("localStorage.getItem('growth-plan:cuties')") == '1')
        ok('device 2: no guest banner', not await p.locator('#guest').is_visible())
        ok('no console errors (4)', not errs, errs)
        await ctx.close()
        await b.close()
    n = sum(1 for _, c in results if c)
    print(f'\n{n}/{len(results)} passed')
    sys.exit(0 if n == len(results) else 1)
asyncio.run(main())
