"""中英双语 & 字体测试（Playwright + 模拟 Supabase，无需真实 key）
运行前：在 growth-plan-app 目录 `python3 -m http.server 8765`
覆盖：默认语言检测、首页 / 登录页 / 应用内的「中文 / EN」切换、刷新后保持、<html lang>、标题、
     英文模式下界面无中文（扫描全部文本节点 + aria-label / placeholder / title）、中文模式下不出现「日」、
     新用户英文入门模板、用户数据不被翻译、字体自托管与按需加载、SW 预缓存。
"""
import asyncio, os, re
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
from gp_cloud_test import Mock, new_page, wait_status, BASE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra if not cond else '')

# 扫描页面里的中文：所有文本节点（含读屏专用文字）+ 可访问属性 + 标题；语言开关里的「中文」本身除外
SCAN = r"""(opts) => {
  const RX = new RegExp(opts.rx);
  const out = [];
  // 用户数据（习惯名、目标、步骤、领域、一句话）不算界面文案：比较前先剔除
  const user = opts.userData ? (() => { const d = GP.get(); return [].concat(d.habits.map(h => h.name), d.habits.map(h => h.seal), d.goals.map(g => g.title), d.goals.map(g => g.note).filter(Boolean),
    ...d.goals.map(g => g.tasks.map(t => t.text)), d.areas.map(a => a.name), [d.motto]).sort((a, b) => b.length - a.length); })() : [];
  const strip = s => user.reduce((acc, u) => u ? acc.split(u).join('') : acc, s);
  const skip = '[data-lang-switch], script, style' + (opts.skip ? ', ' + opts.skip : '');
  const visible = el => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden'; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement; if (!p || p.closest(skip)) continue;
    if (RX.test(strip(n.nodeValue)) && (!opts.visibleOnly || visible(p))) out.push(n.nodeValue.trim().slice(0, 60));
  }
  document.querySelectorAll('[aria-label],[placeholder],[title],[alt],[aria-description]').forEach(el => {
    if (el.closest(skip)) return;
    ['aria-label', 'placeholder', 'title', 'alt'].forEach(a => { const v = el.getAttribute(a); if (v && RX.test(strip(v))) out.push('@' + a + ': ' + v.slice(0, 60)); });
  });
  if (RX.test(document.title)) out.push('<title>: ' + document.title);
  const md = document.querySelector('meta[name=description]'); if (md && RX.test(md.content)) out.push('<meta description>');
  return out;
}"""
CJK = r'[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]'
async def cjk(p, **kw): return await p.evaluate(SCAN, {'rx': CJK, **kw})
async def ri(p): return await p.evaluate(SCAN, {'rx': '日'})
async def lang(p): return await p.evaluate('[document.documentElement.lang, document.documentElement.dataset.lang, I18N.lang, localStorage.getItem("growth-plan:lang")]')
async def switch(p, scope, to):
    if scope == '.topbar':
        if not await p.locator('.topbar .lang-switch--bar').is_visible():   # 手机：语言在「设置」面板里（桌面的设置按钮只放「每天提醒」）
            await p.evaluate("GP.goTab('me', true)"); await p.locator(f'#prefsMenu [data-set-lang="{to}"]').click(); await p.wait_for_timeout(250)
            await p.keyboard.press('Escape'); return
        scope = '.topbar .lang-switch--bar'
    await p.locator(f'{scope} [data-set-lang="{to}"]').click(); await p.wait_for_timeout(250)

async def main():
    mock = Mock()
    mock.users['en@test.dev'] = {'id': 'u-en', 'email': 'en@test.dev', 'password': 'secret123', 'confirmed': True}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        # ---------- 1. 默认语言跟随浏览器 ----------
        for loc, want in (('en-US', 'en'), ('zh-CN', 'zh'), ('zh-TW', 'zh'), ('fr-FR', 'en')):
            ctx, p, errs = await new_page(b, mock, locale=loc)
            await p.goto(BASE); await p.wait_for_timeout(400)
            l = await lang(p)
            ok(f'default language: {loc} → {want}', l[2] == want and l[0] == ('en' if want == 'en' else 'zh-CN') and l[3] is None, l)
            await ctx.close()

        # ---------- 2. 英文首页 ----------
        # v10：衬线字体只属于「简约」主题；像素主题的字体检查见下面的 2b 和 gp_font_test.py
        ctx, p, errs = await new_page(b, mock, locale='en-US', viewport={'width': 1280, 'height': 900})
        await ctx.add_init_script("localStorage.setItem('growth-plan:skin', 'minimal')")
        await p.goto(BASE); await p.wait_for_timeout(700)
        ok('EN landing: <html lang="en">', (await lang(p))[0] == 'en')
        ok('EN landing: headline copy', (await p.locator('#landingTitle .landing__line').all_inner_texts()) == ['Small progress,', 'quietly kept.'])
        ok('EN landing: document title in English', await p.title() == 'Ledger · A quiet ledger for steady progress')
        ok('EN landing: CTA in English', (await p.locator('#landingCta').inner_text()).replace('→', '').strip() == 'Sign in / Sign up')
        bad = await cjk(p); ok('EN landing: no Chinese anywhere (text + aria + title)', not bad, bad)
        sw = p.locator('#landing [data-lang-switch]')
        ok('landing: language switch visible (top right)', await sw.is_visible() and (await sw.bounding_box())['x'] > 900)
        ok('landing: switch is a labelled group with pressed state', await sw.get_attribute('role') == 'group' and await sw.get_attribute('aria-label') == 'Language'
           and await p.locator('#landing [data-set-lang="en"]').get_attribute('aria-pressed') == 'true' and await p.locator('#landing [data-set-lang="zh"]').get_attribute('aria-pressed') == 'false')
        # 字体：英文模式只用拉丁字体，不下载中文字体子集
        await p.evaluate('document.fonts.ready'); await p.wait_for_timeout(300)
        fam = await p.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, ''))")
        ok('EN: Ledger Serif + Ledger Sans loaded (self-hosted)', 'Ledger Serif' in fam and 'Ledger Sans' in fam, fam)
        got = await p.evaluate("performance.getEntriesByType('resource').map(e => e.name.split('/').pop()).filter(n => n.endsWith('.woff2'))")
        ok('EN: Chinese serif subset not requested (only Latin fonts fetched)', 'ledger-serif-sc.woff2' not in got and 'ledger-serif.woff2' in got, got)
        ok('EN: headline uses Ledger Serif', 'Ledger Serif' in await p.evaluate("getComputedStyle(document.querySelector('.landing__title')).fontFamily"))
        # 切换到中文
        await switch(p, '#landing', 'zh')
        l = await lang(p)
        ok('landing toggle → 中文: html lang zh-CN + stored', l[:3] == ['zh-CN', 'zh', 'zh'] and l[3] == 'zh', l)
        ok('landing toggle → 中文: headline', '把小小的进步' in await p.locator('#landingTitle').inner_text())
        ok('landing toggle → 中文: title', await p.title() == 'Ledger · 安静的进度账本')
        ok('landing toggle: focus stays on the switch', await p.evaluate("document.activeElement && document.activeElement.dataset.setLang") == 'zh')
        await p.evaluate('document.fonts.ready'); await p.wait_for_timeout(300)
        ok('中文: serif SC subset has headline glyphs', await p.evaluate("document.fonts.check('600 40px \"Ledger Serif SC\"', '把小小的进步，安静地记下来。')"))
        ok('中文: headline font stack = Newsreader → 思源宋体子集 → 系统宋体', re.search(r'Ledger Serif.*Ledger Serif SC.*Songti SC', await p.evaluate("getComputedStyle(document.querySelector('.landing__title')).fontFamily")) is not None)
        ok('中文 landing: never uses 日', not await ri(p), await ri(p))
        await p.reload(); await p.wait_for_timeout(500)
        ok('choice persists across reload (zh, en browser)', (await lang(p))[:3] == ['zh-CN', 'zh', 'zh'] and '把小小的进步' in await p.locator('#landingTitle').inner_text())
        await switch(p, '#landing', 'en')
        await p.reload(); await p.wait_for_timeout(500)
        ok('choice persists across reload (en)', (await lang(p))[0] == 'en' and 'Small progress' in await p.locator('#landingTitle').inner_text())

        # ---------- 3. 登录页 ----------
        await p.click('#landingCta'); await p.wait_for_timeout(300)
        gsw = p.locator('.gate__inner [data-lang-switch]')
        ok('auth: language switch visible', await gsw.is_visible())
        bad = await cjk(p); ok('EN auth: no Chinese', not bad, bad)
        await p.click('#authSubmit'); await p.wait_for_timeout(200)
        ok('EN auth: validation message in English', await p.locator('#authEmailErr').inner_text() == 'Please enter your email.')
        await p.fill('#authEmail', 'bad@'); await p.click('#authSubmit'); await p.wait_for_timeout(100)
        ok('EN auth: bad email message', await p.locator('#authEmailErr').inner_text() == 'That email doesn’t look right.')
        await p.fill('#authEmail', 'en@test.dev'); await p.fill('#authPass', 'wrongpass'); await p.click('#authSubmit'); await p.wait_for_timeout(700)
        ok('EN auth: server error translated', 'incorrect' in await p.locator('#authMsg').inner_text(), await p.locator('#authMsg').inner_text())
        await p.click('#tabUp'); await p.wait_for_timeout(100)
        ok('EN auth: sign-up button label', await p.locator('#authSubmit .btn__label').inner_text() == 'Create account')
        await switch(p, '.gate__inner', 'zh')
        ok('auth toggle → 中文: labels + html lang', await p.locator('#authSubmit .btn__label').inner_text() == '注册并登录' and await p.locator('#tabIn').inner_text() == '登录' and (await lang(p))[0] == 'zh-CN')
        ok('中文 auth: never uses 日', not await ri(p), await ri(p))
        await switch(p, '.gate__inner', 'en')
        await p.click('#tabIn')
        ok('auth toggle → EN: labels back', await p.locator('#authSubmit .btn__label').inner_text() == 'Sign in' and await p.locator('label[for=authPass]').inner_text() == 'Password')
        await p.click('#pwToggle'); ok('EN: password toggle aria-label', await p.get_attribute('#pwToggle', 'aria-label') == 'Hide password'); await p.click('#pwToggle')
        # 免密链接 → 已寄出
        await p.fill('#authEmail', 'en@test.dev'); await p.click('#magicBtn'); await p.wait_for_timeout(700)
        ok('EN: magic-link sent view', await p.locator('#sentTitle').inner_text() == 'Sign-in link sent' and 'en@test.dev' in await p.locator('#sentText').inner_text())
        ok('EN: resend countdown label', re.match(r'Resend \(\d+s\)', await p.locator('#sentResend').inner_text()) is not None, await p.locator('#sentResend').inner_text())
        bad = await cjk(p); ok('EN sent view: no Chinese', not bad, bad)
        await switch(p, '.gate__inner', 'zh')
        ok('sent view re-renders in 中文', await p.locator('#sentTitle').inner_text() == '登录链接已寄出' and '重新发送' in await p.locator('#sentResend').inner_text())
        await switch(p, '.gate__inner', 'en')
        await p.click('#sentBack')
        # 登录 → 应用 + 账号面板
        await p.fill('#authEmail', 'en@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('EN sign-in → synced', await wait_status(p, 'synced'))
        await p.wait_for_timeout(400)
        ok('EN: sync pill label', await p.locator('#syncText').inner_text() == 'Synced')
        ok('EN: new cloud user gets the English starter template', mock.rows.get('u-en') and mock.rows['u-en']['data']['habits'][1]['name'] == 'Read for 20 minutes')
        await p.click('#syncPill'); await p.wait_for_timeout(300)
        ok('EN account dialog title', await p.locator('#dlgAccountTitle').inner_text() == 'Account & sync')
        ok('EN account dialog text', await p.locator('#acctStatus').inner_text() == 'Synced: this device matches the cloud' and '7 habits' in await p.locator('#acctLocal').inner_text())
        bad = await cjk(p); ok('EN signed-in app + account dialog: no Chinese', not bad, bad)
        await p.keyboard.press('Escape')
        ok('no console errors (EN auth flow)', not errs, errs)
        await ctx.close()

        # ---------- 4. 英文新用户（本机模式）：模板、对话框、提示 ----------
        ctx, p, errs = await new_page(b, mock, locale='en-GB', viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        await p.goto(BASE); await p.wait_for_timeout(500)
        await p.click('#landingCta'); await p.click('#gateLocal'); await p.wait_for_timeout(400)
        d = await p.evaluate('GP.get()')
        ok('EN fresh user: English starter template (7 habits / 5 goals / 5 areas)', len(d['habits']) == 7 and len(d['goals']) == 5 and [a['name'] for a in d['areas']] == ['Study', 'Health', 'Skills', 'Routine', 'Life'])
        ok('EN template recognised as sample', await p.evaluate('GP.isSample(GP.get())'))
        ok('EN template: English motto', await p.locator('#motto').inner_text() == 'Slow is smooth, and smooth is fast.')
        ok('EN template: no Chinese in data', not re.search(CJK, str(d)))
        await p.reload(); await p.wait_for_timeout(400)
        ok('EN motto survives reload intact (not truncated)', await p.locator('#motto').inner_text() == 'Slow is smooth, and smooth is fast.')
        for w in (360, 390):
            await p.set_viewport_size({'width': w, 'height': 844}); await p.wait_for_timeout(200)
            sw = await p.evaluate('document.documentElement.scrollWidth')
            tb = await p.evaluate("[...document.querySelectorAll('.topbar__inner > *')].every(e => e.getBoundingClientRect().right <= innerWidth + 0.5)")
            ok(f'EN top bar fits @{w} (pill + 中文/EN + theme)', sw <= w and tb, sw)
        await p.set_viewport_size({'width': 390, 'height': 844})
        bad = await cjk(p); ok('EN app (phone): no Chinese anywhere', not bad, bad)
        ok('EN app: weekday header', (await p.locator('#weekTable thead th').nth(1).inner_text()).startswith('Mon'))
        ok('EN app: hero weekday + week', re.match(r'(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$', await p.locator('#heroDay').inner_text()) and (await p.locator('#heroWeek').inner_text()).startswith('Week '))
        ok('app (phone): language switch lives in 我的', not await p.locator('.topbar .lang-switch--bar').is_visible() and await p.locator('#prefsMenu [data-set-lang]').count() == 2)
        # 未改动的模板：切到中文时跟着换成中文模板
        await switch(p, '.topbar', 'zh')
        d2 = await p.evaluate('GP.get()')
        ok('untouched template follows language (→ 中文模板)', d2['habits'][1]['name'] == '阅读 20 分钟' and d2['areas'][0]['name'] == '学业' and (await lang(p))[0] == 'zh-CN')
        ok('中文 app: never uses 日 (text, aria, title)', not await ri(p), await ri(p))
        ok('中文 app: weekday header 周一 … 周天', (await p.locator('#weekTable thead th').nth(7).inner_text()).startswith('周天'))
        await switch(p, '.topbar', 'en')
        ok('… and back to English template', (await p.evaluate('GP.get().habits[1].name')) == 'Read for 20 minutes')
        # 打卡（改动数据）→ 之后切语言不再动用户数据
        await p.locator('#habitList .seal').first.click(); await p.wait_for_timeout(300)
        await p.locator('[data-action="add-habit"]').first.click(); await p.wait_for_timeout(300)
        bad = await cjk(p); ok('EN new-habit dialog: no Chinese', not bad, bad)
        ok('EN habit dialog: day chips', (await p.locator('#hDays .day span').all_inner_texts()) == ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
        await p.fill('#hName', 'Stretch'); await p.click('#formHabit button[type=submit]'); await p.wait_for_timeout(300)
        ok('EN toast after adding habit', await p.locator('.toast', has_text='Added “Stretch”').count() == 1)
        await p.locator('[data-action="add-goal"]').click(); await p.wait_for_timeout(300)
        bad = await cjk(p); ok('EN new-goal dialog: no Chinese', not bad, bad)
        ok('EN goal dialog: label "Goal"', await p.locator('label[for=gTitle]').inner_text() == 'Goal')
        await p.keyboard.press('Escape'); await p.wait_for_timeout(200)
        await p.locator('[data-action="edit-areas"]').click(); await p.wait_for_timeout(300)
        bad = await cjk(p); ok('EN areas dialog: no Chinese', not bad, bad)
        ok('EN areas dialog: colour names', 'Indigo' in await p.locator('#ac-0').inner_text())
        await p.keyboard.press('Escape'); await p.wait_for_timeout(200)
        await p.locator('.goal [data-act="del-goal"]').first.click(); await p.wait_for_timeout(300)
        ok('EN confirm dialog', await p.locator('#dlgConfirmTitle').inner_text() == 'Delete goal' and 'will be deleted' in await p.locator('#dlgConfirmText').inner_text())
        bad = await cjk(p); ok('EN confirm dialog: no Chinese', not bad, bad)
        await p.click('#dlgConfirmOk'); await p.wait_for_timeout(300)
        ok('EN toast with Undo', await p.locator('.toast', has_text='Goal deleted').locator('button', has_text='Undo').count() == 1)
        await p.click('#editMotto'); await p.wait_for_timeout(200)
        bad = await cjk(p); ok('EN motto dialog: no Chinese', not bad, bad)
        await p.keyboard.press('Escape')
        await p.click('#weekPrev'); await p.wait_for_timeout(200)
        ok('EN week nav label', re.match(r'[A-Z][a-z]{2} \d+', await p.locator('#weekLabel').inner_text()) is not None, await p.locator('#weekLabel').inner_text())
        bad = await cjk(p); ok('EN app after interactions: no Chinese', not bad, bad)
        # 用户改过的数据：切语言不变
        before = await p.evaluate('JSON.stringify(GP.get())')
        await switch(p, '.topbar', 'zh')
        ok('user-edited data untouched by language switch', await p.evaluate('JSON.stringify(GP.get())') == before)
        ok('中文: section titles', await p.locator('#todayTitle').inner_text() == '今天' and await p.locator('#goalsTitle').inner_text() == '目标')
        ok('中文: user data shown as-is (English habit names stay)', await p.locator('.habit__name', has_text='Stretch').count() == 1)
        ok('中文 (after interactions): never uses 日', not await ri(p), await ri(p))
        await p.reload(); await p.wait_for_timeout(500)
        ok('app: language persists across reload', (await lang(p))[0] == 'zh-CN' and await p.locator('#todayTitle').inner_text() == '今天')
        ok('I18N: no missing translations recorded', not await p.evaluate('I18N.missing'), await p.evaluate('I18N.missing'))
        ok('no console errors (EN local flow)', not errs, errs)
        await ctx.close()

        # ---------- 5. 中文老用户切到英文：界面英文，数据原样 ----------
        ctx, p, errs = await new_page(b, mock, locale='zh-CN', viewport={'width': 1280, 'height': 900})
        await p.goto(BASE); await p.wait_for_timeout(400)
        await p.click('#landingCta'); await p.click('#gateLocal'); await p.wait_for_timeout(300)
        await p.locator('#habitList .seal').first.click(); await p.wait_for_timeout(200)
        zh_before = await p.evaluate('JSON.stringify(GP.get())')
        ok('中文 fresh user: Chinese template', '阅读 20 分钟' in zh_before)
        await switch(p, '.topbar', 'en')
        ok('zh data kept when switching to EN', await p.evaluate('JSON.stringify(GP.get())') == zh_before)
        bad = await cjk(p, userData=True)
        ok('EN chrome around Chinese user data: no Chinese UI strings', not bad, bad)
        ok('EN: Chinese default motto shown in English', await p.locator('#motto').inner_text() == 'Slow is smooth, and smooth is fast.')
        _hid = await p.locator('#habitList .habit').first.get_attribute('data-id'); await p.locator(f'#mgrList .mgr__row[data-id="{_hid}"] [data-act="mgr-edit"]').click(); await p.wait_for_timeout(200)
        ok('EN: edit dialog title', await p.locator('#dlgHabitTitle').inner_text() == 'Edit habit')
        await p.keyboard.press('Escape')
        ok('no console errors (zh → EN)', not errs, errs)
        await ctx.close()

        # ---------- 2b. 像素主题（默认田园）：英文只用像素拉丁字体，中文只下载关键切片 ----------
        for loc in ('en-US', 'zh-CN'):
            ctx, p, errs = await new_page(b, mock, locale=loc, viewport={'width': 390, 'height': 844})
            await p.goto(BASE); await p.wait_for_timeout(600)
            await p.evaluate('document.fonts.ready'); await p.wait_for_timeout(300)
            fam = await p.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, ''))")
            got = await p.evaluate("performance.getEntriesByType('resource').map(e => e.name.split('/').pop()).filter(n => n.endsWith('.woff2'))")
            tf = await p.evaluate("getComputedStyle(document.querySelector('.landing__title')).fontFamily")
            if loc == 'en-US':
                ok('pixel EN: PixelLatin loaded, no Chinese pixel font, no serif', 'PixelLatin' in fam and 'FusionPx' not in fam and not any(g.startswith(('px-sc', 'ledger-serif')) for g in got), (fam, got))
                ok('pixel EN: headline font stack starts with PixelLatin', tf.replace('"', '').startswith('PixelLatin'), tf)
            else:
                ok('pixel 中文: only critical px-sc-ui chunk + no serif', 'px-sc-ui.woff2' in got and not any(re.match(r'px-sc-\d\d', g) or g.startswith('ledger-serif') for g in got), got)
                ok('pixel 中文: headline uses FusionPx', tf.replace('"', '').startswith('FusionPx'), tf)
            ok(f'pixel {loc}: no console errors', not errs, errs)
            await ctx.close()

        # ---------- 6. 静态检查：字体体积、SW 预缓存、许可 ----------
        fonts = [f for f in os.listdir(os.path.join(ROOT, 'fonts')) if f.endswith('.woff2')]
        total = sum(os.path.getsize(os.path.join(ROOT, 'fonts', f)) for f in fonts)
        # v9：中文衬线切片 —— 3 个拉丁字体 + 关键切片（首屏）+ 常用字切片（按需，见 gp_font_test.py）
        core = [f for f in fonts if not re.match(r'(ledger-serif|px)-sc-\d\d\.woff2$', f) and not f.startswith('px-')]
        pxcore = [f for f in fonts if f.startswith('px-') and not re.match(r'px-sc-\d\d', f)]
        core_total = sum(os.path.getsize(os.path.join(ROOT, 'fonts', f)) for f in core)
        ok(f'fonts: 4 first-load woff2 (3 Latin + SC critical), {core_total/1024:.0f} KB < 200 KB', sorted(core) == ['ledger-sans.woff2', 'ledger-serif-italic.woff2', 'ledger-serif-sc-ui.woff2', 'ledger-serif.woff2'] and core_total < 200 * 1024)
        swjs = open(os.path.join(ROOT, 'sw.js')).read()
        ok('sw.js: cache bumped to gp-shell-v12-ledger', "VERSION = 'gp-shell-v12-ledger'" in swjs)
        ok('sw.js: first-load fonts + i18n.js precached (chunks runtime-cached)', all(f'./fonts/{f}' in swjs for f in core + pxcore) and './i18n.js' in swjs and not re.search(r"'\./fonts/(ledger-serif|px)-sc-\d\d", swjs))
        pxtotal = sum(os.path.getsize(os.path.join(ROOT, 'fonts', f)) for f in pxcore)
        ok(f'pixel fonts: 4 first-load files (ui + latin + sym + arcade), {pxtotal/1024:.0f} KB < 50 KB', sorted(pxcore) == ['px-arcade.woff2', 'px-latin.woff2', 'px-sc-ui.woff2', 'px-sym.woff2'] and pxtotal < 50 * 1024, pxcore)
        ok('fonts: OFL license texts shipped', all(os.path.exists(os.path.join(ROOT, 'fonts', f)) for f in ('OFL-NotoSerifSC.txt', 'OFL-Newsreader.txt', 'OFL-Inter.txt', 'OFL-FusionPixel.txt', 'OFL-PixelifySans.txt', 'OFL-PressStart2P.txt', 'LICENSES.md')))
        css = open(os.path.join(ROOT, 'style.css')).read()
        ok('css: every @font-face uses font-display: swap', css.count('@font-face') == 4 and css.count('font-display: swap') == 4)
        ccss = open(os.path.join(ROOT, 'fonts', 'serif-sc.css')).read()
        ok('serif-sc.css: every chunk face uses font-display: swap', ccss.count('@font-face') >= 8 and ccss.count('@font-face') == ccss.count('font-display: swap'))
        ok('css/html: no Google Fonts CDN', 'fonts.googleapis' not in css + open(os.path.join(ROOT, 'index.html')).read())
        html = open(os.path.join(ROOT, 'index.html')).read()
        ok('html: headline fonts preloaded per skin (Latin + critical chunk only)', 'fonts/ledger-serif.woff2' in html and 'px-sc-ui.woff2' in html and not re.search(r'px-sc-\d\d', html) and 'ledger-serif-sc-ui.woff2' in html and not re.search(r'ledger-serif-sc-\d\d', html))
        await b.close()
    print('\n%d/%d passed' % (sum(r for _, r in results), len(results)))

asyncio.run(main())
