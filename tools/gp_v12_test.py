"""v12：新手指引（3 步）+ 空状态 + 设置底部标志修复
运行前：在 growth-plan-app 目录 `python3 -m http.server 8765`"""
import asyncio, sys, re, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gp_cloud_test import Mock, new_page, wait_status, SB, FAKE_CFG
import gp_noonb; gp_noonb.disable()          # 这个套件要测指引本身
from playwright.async_api import async_playwright
BASE = 'http://127.0.0.1:8765/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra if not cond else '')

async def ctxp(b, mock, lang='zh', skin='farm', w=390, h=844, reduce=False, cute=False):
    ctx, p, errs = await new_page(b, mock, viewport={'width': w, 'height': h}, locale='zh-CN' if lang == 'zh' else 'en-US', reduced_motion='reduce' if reduce else 'no-preference')
    await ctx.add_init_script("try{localStorage.setItem('growth-plan:skin','%s');localStorage.setItem('growth-plan:lang','%s');%s}catch(e){}" % (skin, lang, "localStorage.setItem('growth-plan:cuties','1');" if cute else ''))
    return ctx, p, errs

async def enter(p, cute=False):
    await p.goto(BASE); await p.wait_for_timeout(900)
    await p.click('#landingCta'); await p.wait_for_timeout(250)
    await p.click('#gateLocal'); await p.wait_for_timeout(250)
    if cute:
        await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.prefs.cutiesUnlocked=true;s.prefs.theme='cuties';GP.replace(s);GP.setSkin('cuties')})()")

async def onb_open(p, timeout=4000):
    try: await p.wait_for_selector('#dlgOnb[open]', timeout=timeout); return True
    except Exception: return False

async def is_open(p): return await p.evaluate("document.getElementById('dlgOnb').open")
async def overflow(p): return await p.evaluate("document.documentElement.scrollWidth - innerWidth")
async def inside(p, sel):
    return await p.evaluate("s => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.left >= -0.5 && r.right <= innerWidth + 0.5; }", sel)
GET = "JSON.parse(localStorage.getItem('growth-plan:v1'))"

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome')
        mock = Mock()
        # ---------- A. 全新游客：完整走完 ----------
        ctx, p, errs = await ctxp(b, mock)
        await enter(p)
        ok('A fresh guest: step 1 opens after the gate closes', await onb_open(p))
        ok('A step label + title', (await p.locator('#onbStep').inner_text()) == '第 1 步，共 3 步' and (await p.locator('#onbTitle').inner_text()) == '选第一个习惯')
        ok('A chips: 阅读 早睡 运动 记账 自己写', [x.strip() for x in await p.locator('.onb__chips .onb-chip').all_inner_texts()] == ['阅读', '早睡', '运动', '记账', '自己写'])
        ok('A focus on first chip', await p.evaluate("document.activeElement.dataset.tpl") == 'read')
        ok('A flag not set yet', await p.evaluate("localStorage.getItem('growth-plan:onboarded')") is None)
        await p.click('[data-tpl="read"]'); await p.wait_for_timeout(700)
        st = await p.evaluate(GET)
        ok('A brand-new: only that 1 habit (no sample habits / goals)', len(st['habits']) == 1 and st['habits'][0]['name'] == '阅读 20 分钟' and st['habits'][0]['seal'] == '读' and st['goals'] == [], [h['name'] for h in st['habits']])
        ok('A step 2: coach + ring shown', await p.locator('#coach').is_visible() and await p.evaluate("!document.getElementById('coachRing').hidden"))
        ok('A step 2 hint 做完就点一下', (await p.locator('#coachT').inner_text()) == '做完就点一下' and '第 2 步' in await p.locator('#coach .onb__step').inner_text())
        ok('A seal focused + described by hint', await p.evaluate("document.activeElement.classList.contains('seal') && document.activeElement.getAttribute('aria-describedby') === 'coachT coachD'"))
        rr = await p.evaluate("(()=>{const a=document.querySelector('#habitList .seal').getBoundingClientRect(),b=document.getElementById('coachRing').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom})()")
        ok('A ring surrounds the checkbox', rr)
        ok('A coach inside viewport', await inside(p, '#coach'))
        stage0 = await p.evaluate("document.querySelector('#habitList .plot').className")
        await p.click('#habitList .seal'); await p.wait_for_timeout(250)
        ok('A tap → done', await p.evaluate("document.querySelector('#habitList .seal').getAttribute('aria-checked')") == 'true')
        ok('A immediate feedback text', (await p.locator('#coachT').inner_text()) == '漂亮！小花长大了一点。')
        stage1 = await p.evaluate("document.querySelector('#habitList .plot').className")
        ok('A flower grew (plot stage changed)', stage0 != stage1 and 'plot--0' in stage0, (stage0, stage1))
        ok('A celebration: burst animating + pixel fx', await p.evaluate("getComputedStyle(document.querySelector('#coachBurst i')).animationName") == 'onb-burst' and await p.evaluate("document.querySelectorAll('.fx').length") >= 1)
        ok('A step 3 opens', await onb_open(p, 3000))
        ok('A step 3 content', (await p.locator('#onbStep').inner_text()) == '第 3 步，共 3 步' and '热力图' in await p.locator('#onbLede3').inner_text() and (await p.locator('#onbSyncT').inner_text()) == '登录后换手机也不丢')
        ok('A step 3: login + 开始吧 buttons', await p.locator('#onbLogin').is_visible() and (await p.locator('#onbStart').inner_text()).strip() == '开始吧')
        ok('A coach hidden at step 3', not await p.locator('#coach').is_visible())
        ok('A dialog labelled by step-3 title', await p.get_attribute('#dlgOnb', 'aria-labelledby') == 'onbTitle3')
        await p.click('#onbStart'); await p.wait_for_timeout(300)
        ok('A done: closed + prefs.onboarded + local flag', not await is_open(p) and (await p.evaluate(GET))['prefs'].get('onboarded') is True and await p.evaluate("localStorage.getItem('growth-plan:onboarded')") == '1')
        await p.reload(); await p.wait_for_timeout(1800)
        ok('A reload: no onboarding again', not await is_open(p))
        ok('A no console errors', not errs, errs)
        await ctx.close()

        # ---------- B. 第 1 步跳过 → 空状态 ----------
        ctx, p, errs = await ctxp(b, mock)
        await enter(p); await onb_open(p)
        await p.click('#onbSkip'); await p.wait_for_timeout(300)
        st = await p.evaluate(GET)
        ok('B skip at step 1: closed, flag set, no habits', not await is_open(p) and st['prefs'].get('onboarded') is True and st['habits'] == [])
        ok('B empty state visible', await p.locator('#habitEmpty').is_visible() and (await p.locator('#habitEmpty .empty__t').inner_text()) == '还没有习惯')
        ok('B empty state points to 新习惯', '新习惯' in await p.locator('#habitEmpty .empty__d').inner_text() and '新习惯' in await p.locator('#habitEmpty .empty__go').inner_text())
        await p.click('#habitEmpty .empty__go'); await p.wait_for_timeout(300)
        ok('B empty-state button opens the new-habit dialog', await p.evaluate("document.getElementById('dlgHabit').open"))
        await p.keyboard.press('Escape'); await p.wait_for_timeout(200)
        ok('B no console errors', not errs, errs)
        await ctx.close()

        # ---------- C. 自己写 + Esc 跳过第 2 步 ----------
        ctx, p, errs = await ctxp(b, mock)
        await enter(p); await onb_open(p)
        await p.click('[data-tpl="own"]'); await p.wait_for_timeout(150)
        ok('C own: form expands, input focused', await p.locator('#onbOwn').is_visible() and await p.evaluate("document.activeElement.id") == 'onbName' and await p.get_attribute('[data-tpl="own"]', 'aria-expanded') == 'true')
        await p.click('#onbOwn button[type=submit]'); await p.wait_for_timeout(100)
        ok('C empty name → error', (await p.locator('#onbNameErr').inner_text()) == '写一个习惯的名字吧。' and await p.get_attribute('#onbName', 'aria-invalid') == 'true')
        await p.fill('#onbName', '喝 8 杯水'); await p.press('#onbName', 'Enter'); await p.wait_for_timeout(600)
        st = await p.evaluate(GET)
        ok('C own habit created', [h['name'] for h in st['habits']] == ['喝 8 杯水'] and st['habits'][0]['seal'] == '喝')
        ok('C coach shown', await p.locator('#coach').is_visible())
        await p.click('#coachSkip'); await p.wait_for_timeout(300)
        ok('C skip at step 2: guide ends, habit kept, flag set', not await p.locator('#coach').is_visible() and not await is_open(p) and len((await p.evaluate(GET))['habits']) == 1 and await p.evaluate("localStorage.getItem('growth-plan:onboarded')") == '1')
        ok('C ring removed', await p.evaluate("document.getElementById('coachRing').hidden"))
        await ctx.close()

        ctx, p, errs = await ctxp(b, mock)
        await enter(p); await onb_open(p)
        await p.keyboard.press('Escape'); await p.wait_for_timeout(300)
        ok('D Esc at step 1 = skip (flag set)', not await is_open(p) and await p.evaluate("localStorage.getItem('growth-plan:onboarded')") == '1')
        await ctx.close()

        # ---------- E. 老用户：有数据 / 已有云端标记 → 不弹 ----------
        ctx, p, errs = await ctxp(b, mock)
        await ctx.add_init_script("""if(!sessionStorage.getItem('x')){sessionStorage.setItem('x',1);localStorage.setItem('growth-plan:v1', JSON.stringify({version:2,areas:[{id:'a1',name:'学业',color:'indigo'}],habits:[{id:'q1',name:'背单词',seal:'词',area:'a1',freq:'daily',days:[0,1,2,3,4,5,6],created:'2026-09-01'}],goals:[],log:{'2026-09-02':['q1']},notes:{},prefs:{theme:'farm'}}));localStorage.setItem('growth-plan:meta', JSON.stringify({updatedAt:'2026-09-02T10:00:00Z'}));}""")
        await enter(p); await p.wait_for_timeout(1500)
        ok('E existing user with data: no onboarding', not await is_open(p) and (await p.evaluate(GET))['habits'][0]['name'] == '背单词')
        ok('E existing user: local flag set, data untouched', await p.evaluate("localStorage.getItem('growth-plan:onboarded')") == '1' and 'onboarded' not in (await p.evaluate(GET))['prefs'])
        # 重新看新手指引（设置）：加进去，不清掉原数据
        await p.evaluate("GP.goTab('me', true)"); await p.wait_for_timeout(200)
        ok('E settings: 重新看新手指引 button', (await p.locator('#prefsGuide').inner_text()).strip() == '重新看新手指引')
        await p.click('#prefsGuide'); await p.wait_for_timeout(300)
        ok('E replay opens step 1, back on 今天', await is_open(p) and await p.evaluate("GP.tab()") == 'today')
        await p.click('[data-tpl="sleep"]'); await p.wait_for_timeout(600)
        st = await p.evaluate(GET)
        ok('E replay: habit added, old data kept', [h['name'] for h in st['habits']] == ['背单词', '12 点前睡觉'] and st['log'].get('2026-09-02') == ['q1'])
        await p.click('#habitList .habit[data-id^="h-"] .seal'); await p.wait_for_timeout(100)
        ok('E replay: step 3 after tap', await onb_open(p, 3000))
        await p.click('#onbStart'); await p.wait_for_timeout(200)
        ok('E replay done: prefs.onboarded true', (await p.evaluate(GET))['prefs'].get('onboarded') is True)
        await ctx.close()

        ctx, p, errs = await ctxp(b, mock)
        await ctx.add_init_script("""if(!sessionStorage.getItem('x')){sessionStorage.setItem('x',1);localStorage.setItem('growth-plan:v1', JSON.stringify({version:2,areas:[{id:'a1',name:'学业',color:'indigo'}],habits:[],goals:[],log:{},notes:{},prefs:{theme:'farm',onboarded:true}}));}""")
        await enter(p); await p.wait_for_timeout(1500)
        ok('F prefs.onboarded (synced flag) without local flag: no onboarding', not await is_open(p))
        await ctx.close()

        # ---------- G. 英文 ----------
        ctx, p, errs = await ctxp(b, mock, lang='en')
        await enter(p); await onb_open(p)
        ok('G EN step 1', (await p.locator('#onbStep').inner_text()) == 'Step 1 of 3' and (await p.locator('#onbTitle').inner_text()) == 'Pick your first habit')
        ok('G EN chips', [x.strip() for x in await p.locator('.onb__chips .onb-chip').all_inner_texts()] == ['Reading', 'Sleep early', 'Exercise', 'Track spending', 'Write my own'])
        ok('G EN skip', (await p.locator('#onbSkip').inner_text()).strip() == 'Skip')
        await p.click('[data-tpl="money"]'); await p.wait_for_timeout(600)
        ok('G EN habit name', [h['name'] for h in (await p.evaluate(GET))['habits']] == ['Note today\u2019s spending'])
        ok('G EN hint', (await p.locator('#coachT').inner_text()) == 'Done it? Tap once.')
        await p.click('#habitList .seal'); await p.wait_for_timeout(200)
        ok('G EN feedback', (await p.locator('#coachT').inner_text()) == 'Nice! Your flower grew a little.')
        await onb_open(p, 3000)
        ok('G EN step 3', (await p.locator('#onbStep').inner_text()) == 'Step 3 of 3' and (await p.locator('#onbSyncT').inner_text()) == 'Log in and your data follows you to a new phone.' and (await p.locator('#onbLogin').inner_text()).strip() == 'Log in' and (await p.locator('#onbStart').inner_text()).strip() == 'Let’s go')
        han = await p.evaluate("(()=>{const out=[];const w=document.createTreeWalker(document.getElementById('dlgOnb'),NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())if(/[\\u4e00-\\u9fff]/.test(n.nodeValue))out.push(n.nodeValue.trim());return out})()")
        ok('G EN: no Chinese in the guide', not han, han)
        await p.click('#onbLogin'); await p.wait_for_timeout(400)
        ok('G login button: guide done + sign-in opens', not await is_open(p) and await p.evaluate("localStorage.getItem('growth-plan:onboarded')") == '1' and await p.locator('#authEmail').is_visible())
        await p.evaluate("GP.goTab('me', true)") if not await p.locator('#authEmail').is_visible() else None
        await ctx.close()

        # ---------- H. 减少动态效果 ----------
        ctx, p, errs = await ctxp(b, mock, reduce=True)
        await enter(p); await onb_open(p)
        await p.click('[data-tpl="move"]'); await p.wait_for_timeout(400)
        await p.click('#habitList .seal'); await p.wait_for_timeout(150)
        ok('H reduced motion: no burst / pop animation', await p.evaluate("getComputedStyle(document.querySelector('#coachBurst i')).animationName") == 'none' and await p.evaluate("getComputedStyle(document.getElementById('coachT')).animationName") == 'none')
        ok('H reduced motion: no ring transition', all(float(x.strip().rstrip('s') or 0) < 0.01 for x in (await p.evaluate("getComputedStyle(document.getElementById('coachRing')).transitionDuration")).split(',')))
        ok('H reduced motion: step 3 still arrives', await onb_open(p, 2500))
        await ctx.close()

        # ---------- I. 360 px：每一步都不出界（中/英 × 所有主题，含隐藏主题） ----------
        for lang in ('zh', 'en'):
            for skin in ('farm', 'arcade', 'night', 'minimal', 'cuties'):
                cute = skin == 'cuties'
                ctx, p, errs = await ctxp(b, mock, lang=lang, skin=skin, w=360, h=740, cute=cute)
                await enter(p, cute=cute)
                good = await onb_open(p)
                if cute: ok('I cuties applied', await p.evaluate("document.documentElement.dataset.skin") == 'cuties')
                s1 = good and await overflow(p) == 0 and await inside(p, '#dlgOnb')
                await p.click('[data-tpl="own"]'); await p.wait_for_timeout(100)
                s1 = s1 and await inside(p, '#onbName') and await overflow(p) == 0
                await p.click('[data-tpl="read"]'); await p.wait_for_timeout(700)
                s2 = await p.locator('#coach').is_visible() and await inside(p, '#coach') and await overflow(p) == 0
                await p.click('#habitList .seal'); await onb_open(p, 3000)
                s3 = await inside(p, '#dlgOnb') and await overflow(p) == 0 and await p.evaluate("(()=>{const d=document.getElementById('dlgOnb');return d.scrollWidth<=d.clientWidth+1})()")
                await p.click('#onbStart'); await p.wait_for_timeout(200)
                await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.habits=[];s.log={};GP.replace(s)})()"); await p.wait_for_timeout(200)
                se = await p.locator('#habitEmpty').is_visible() and await overflow(p) == 0 and await inside(p, '#habitEmpty .empty__go')
                ok('I 360px %s %s: step1 %s step2 %s step3 %s empty %s' % (lang, skin, s1, s2, s3, se), s1 and s2 and s3 and se)
                ok('I %s %s no console errors' % (lang, skin), not errs, errs)
                await ctx.close()

        # ---------- J. 设置底部：标志可见，整行 ≥ 44px，点版本号 5 下解锁 ----------
        for skin in ('farm', 'arcade', 'night', 'minimal'):
            ctx, p, errs = await ctxp(b, mock, skin=skin)
            await ctx.add_init_script("localStorage.setItem('growth-plan:onboarded','1')")
            await enter(p); await p.wait_for_timeout(300)
            await p.evaluate("GP.goTab('me', true)"); await p.wait_for_timeout(250)
            await p.locator('#prefsFoot').scroll_into_view_if_needed()
            lb = await p.locator('#prefsLogo svg').bounding_box(); fb = await p.locator('#prefsFoot').bounding_box()
            ok('J %s: logo visible (non-zero, has pixels)' % skin, lb and lb['width'] >= 16 and lb['height'] >= 16 and await p.evaluate("document.querySelectorAll('#prefsLogo svg rect').length") > 5, lb)
            ok('J %s: footer hit area >= 44px tall' % skin, fb and fb['height'] >= 44, fb)
            if skin == 'farm':
                await p.evaluate("document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
                for i in range(5): await p.click('#prefsVer'); await p.wait_for_timeout(120)
                tt = await p.locator('#toasts .toast').all_inner_texts()
                ok('J tapping the version text 5× unlocks', await p.evaluate("GP.get().prefs.cutiesUnlocked === true") and any('解锁了隐藏主题' in x for x in tt), tt)
                ok('J footer stays unannounced (aria-hidden)', await p.get_attribute('#prefsFoot', 'aria-hidden') == 'true')
                await p.click('.skins--menu [data-set-skin="cuties"]'); await p.wait_for_timeout(300)
                await p.locator('#prefsFoot').scroll_into_view_if_needed()
                lb = await p.locator('#prefsLogo svg').bounding_box()
                ok('J cuties: logo visible', lb and lb['width'] >= 16 and lb['height'] >= 16, lb)
            await ctx.close()
        html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
        sw = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
        ok('K logo is in the HTML itself (no JS needed)', re.search(r'id="prefsLogo"><svg', html) is not None)
        ok('K app code URLs are versioned (old SW cannot serve stale JS/CSS)', all(('%s?v=12' % f) in html for f in ('style.css', 'pixel.css', 'cuties.css', 'i18n.js', 'skin.js', 'crew.js', 'app.js', 'cloud.js')))
        ok('K SW: app code network-first, v12, precaches versioned URLs', "VERSION = 'gp-shell-v12-ledger'" in sw and "/\\.(js|css)$/.test(url.pathname)) { e.respondWith(networkFirst(req))" in sw and "'./app.js?v=12'" in sw)
        ok('K version text v12', 'Ledger · v12' in html)

        # ---------- L. 云端：新注册 → 指引；标记随云同步；第二台设备不再弹 ----------
        ctx, p, errs = await ctxp(b, mock)
        await p.goto(BASE); await p.wait_for_timeout(900)
        await p.click('#landingCta'); await p.wait_for_timeout(200)
        await p.click('#tabUp'); await p.fill('#authEmail', 'new12@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('L signup → synced', await wait_status(p, 'synced'))
        ok('L new account: onboarding opens after sync', await onb_open(p, 5000))
        await p.click('[data-tpl="read"]'); await p.wait_for_timeout(500)
        await p.click('#habitList .seal'); await onb_open(p, 3000)
        ok('L logged in: step 3 says already synced, no login button', (await p.locator('#onbSyncT').inner_text()) == '已登录，换手机也不丢' and not await p.locator('#onbLogin').is_visible())
        await p.click('#onbStart'); await p.wait_for_timeout(300)
        await wait_status(p, 'synced'); await p.wait_for_timeout(1500)
        uid = next(u['id'] for u in mock.users.values() if u['email'] == 'new12@test.dev')
        row = mock.rows.get(uid, {})
        data = row.get('data', {}) if isinstance(row, dict) else {}
        ok('L cloud row: 1 habit + prefs.onboarded', data.get('prefs', {}).get('onboarded') is True and [h['name'] for h in data.get('habits', [])] == ['阅读 20 分钟'], json.dumps(data)[:200])
        ok('L no console errors', not errs, errs)
        await ctx.close()
        ctx, p, errs = await ctxp(b, mock)
        await p.goto(BASE); await p.wait_for_timeout(900)
        await p.click('#landingCta'); await p.wait_for_timeout(200)
        await p.fill('#authEmail', 'new12@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('L device 2 login → synced', await wait_status(p, 'synced'))
        await p.wait_for_timeout(1800)
        ok('L device 2: no onboarding (flag from cloud)', not await is_open(p) and await p.evaluate("localStorage.getItem('growth-plan:onboarded')") == '1')
        await ctx.close()
        # 有云端数据但从没看过指引的老账号（v11 时代注册）：换设备登录 → 不弹
        ctx, p, errs = await ctxp(b, mock)
        await p.goto(BASE); await p.wait_for_timeout(900)
        await p.click('#landingCta'); await p.wait_for_timeout(200)
        await p.click('#tabUp'); await p.fill('#authEmail', 'old11@test.dev'); await p.fill('#authPass', 'secret123')
        await ctx.add_init_script("localStorage.setItem('growth-plan:onboarded','1')")
        await p.evaluate("localStorage.setItem('growth-plan:onboarded','1')")
        await p.click('#authSubmit'); await wait_status(p, 'synced')
        await p.evaluate("(()=>{const s=JSON.parse(JSON.stringify(GP.get()));s.habits.push({id:'z1',name:'旧习惯',seal:'旧',area:s.areas[0].id,freq:'daily',days:[0,1,2,3,4,5,6],created:'2026-09-01'});s.log={'2026-09-03':['z1']};delete s.prefs.onboarded;GP.replace(s);document.dispatchEvent(new CustomEvent('gp:change'))})()")
        await p.wait_for_timeout(2500)
        await ctx.close()
        ctx, p, errs = await ctxp(b, mock)
        await p.goto(BASE); await p.wait_for_timeout(900)
        await p.click('#landingCta'); await p.wait_for_timeout(200)
        await p.fill('#authEmail', 'old11@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('L old account login → synced', await wait_status(p, 'synced'))
        await p.wait_for_timeout(1800)
        st = await p.evaluate(GET)
        ok('L old account with data, no flag: no onboarding', not await is_open(p) and any(h['name'] == '旧习惯' for h in st['habits']), [h['name'] for h in st['habits']])
        await ctx.close()
        await b.close()
    # 日 不出现在任何界面文案里
    bad = [f for f in ('index.html', 'app.js', 'i18n.js', 'skin.js', 'crew.js', 'style.css', 'pixel.css', 'cuties.css', 'sw.js', 'cloud.js') if '\u65e5' in open(os.path.join(ROOT, f), encoding='utf-8').read()]
    ok('no 日 in source files', not bad, bad)
    n = sum(1 for _, c in results if c)
    print(f'\n{n}/{len(results)} passed')
    sys.exit(0 if n == len(results) else 1)
asyncio.run(main())
