"""每天提醒：网页（开关 / 持久化 / 帮助文字 / 到点提醒 / 拒绝权限 / 不支持 Notification）+ 模拟安卓壳（Capacitor LocalNotifications）"""
import asyncio, json, sys
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra if not cond else '')

# 可控的假 Notification：权限由 window.__grant 决定，弹出的通知记录在 window.__notes
FAKE_NOTIFY = """
(() => {
  window.__notes = []; window.__grant = 'granted'; let perm = localStorage.getItem('__perm') || 'default';
  function N(title, opts) { window.__notes.push({ title, body: opts && opts.body, tag: opts && opts.tag }); this.close = () => {}; }
  Object.defineProperty(N, 'permission', { get: () => perm });
  N.requestPermission = () => { perm = window.__grant; localStorage.setItem('__perm', perm); window.__asked = (window.__asked || 0) + 1; return Promise.resolve(perm); };
  window.Notification = N;
})();"""
NO_NOTIFY = "delete window.Notification; window.Notification = undefined;"
# 模拟 Capacitor 安卓壳 + LocalNotifications 插件，记录调用
FAKE_NATIVE = """
(() => {
  window.__ln = []; let perm = 'prompt';
  const LN = {
    checkPermissions: () => Promise.resolve({ display: perm }),
    requestPermissions: () => { window.__ln.push(['request']); perm = window.__nativeGrant || 'granted'; return Promise.resolve({ display: perm }); },
    createChannel: (c) => { window.__ln.push(['channel', c.id, c.name]); return Promise.resolve(); },
    schedule: (o) => { window.__ln.push(['schedule', o.notifications[0]]); return Promise.resolve({ notifications: [{ id: o.notifications[0].id }] }); },
    cancel: (o) => { window.__ln.push(['cancel', o.notifications[0].id]); return Promise.resolve(); }
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { LocalNotifications: LN } };
})();"""

async def boot(b, init=None, lang='zh-CN', w=390, keep=False, ctx=None):
    ctx = ctx or await b.new_context(locale=lang, viewport={'width': w, 'height': 844}, reduced_motion='reduce', service_workers='block')
    if init: await ctx.add_init_script(init)
    p = await ctx.new_page(); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await p.goto(URL)
    if not keep:
        await p.evaluate('() => { localStorage.clear(); localStorage.setItem("growth-plan:local-only", "1"); }')
        await p.reload()
    await p.wait_for_timeout(400)
    if await p.locator('#gate').is_visible():
        await p.click('#landingCta'); await p.wait_for_timeout(150); await p.click('#gateLocal'); await p.wait_for_timeout(250)
    return ctx, p, errs
async def rem(p): return await p.evaluate('JSON.parse(localStorage.getItem("growth-plan:reminder") || "null")')
async def open_prefs(p):
    if not await p.locator('#prefsMenu').is_visible(): await p.evaluate("GP.goTab('me', true)"); await p.wait_for_timeout(120)

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        # ---------- 网页 · 手机 · 中文 ----------
        ctx, p, errs = await boot(b, FAKE_NOTIFY)
        await open_prefs(p)
        ok('web: reminder group in settings panel', await p.locator('#remGrp').is_visible())
        ok('web: off by default, time 21:00', not await p.is_checked('#remOn') and await p.input_value('#remTime') == '21:00')
        ok('web: switch semantics (role=switch, labelled)', await p.get_attribute('#remOn', 'role') == 'switch' and '提醒我记一笔' in await p.locator('.rem__toggle').inner_text())
        ok('web: time input labelled', await p.get_attribute('#remTime', 'aria-label') == '提醒时间')
        help_zh = await p.locator('#remHelp').inner_text()
        ok('web: honest helper text (only while open) + Android link', '只在本页面' in help_zh and '安卓版' in help_zh and await p.locator('#remApk').is_visible() and await p.get_attribute('#remApk', 'href') == 'ledger.apk', help_zh)
        ok('web: never uses 日 in reminder UI', '日' not in await p.locator('#remGrp').inner_text() + (await p.get_attribute('#remTime', 'aria-label')))
        await p.click('.rem__toggle'); await p.wait_for_timeout(250)
        ok('web: turning on asks permission once', await p.evaluate('window.__asked') == 1)
        ok('web: on + persisted', await p.is_checked('#remOn') and await rem(p) == {'on': True, 'time': '21:00'})
        ok('web: confirmation toast', '每天 21:00 提醒你' in await p.locator('#toasts').inner_text())
        ok('web: timer armed', await p.evaluate('!!GP_REMINDER.state.timer'))
        await p.fill('#remTime', '07:30'); await p.dispatch_event('#remTime', 'change'); await p.wait_for_timeout(100)
        ok('web: time change persisted', await rem(p) == {'on': True, 'time': '07:30'})
        # 到点：上一拍在提醒时间之前、这一拍已过点 → 弹一条；同一天不重复
        fired = await p.evaluate("""() => {
          const n = new Date(), hh = String(n.getHours()).padStart(2, '0'), mm = String(n.getMinutes()).padStart(2, '0');
          localStorage.setItem('growth-plan:reminder', JSON.stringify({ on: true, time: hh + ':' + mm }));
          localStorage.removeItem('growth-plan:reminder-last');
          GP_REMINDER.state.prevTick = new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes()).getTime() - 1000;
          GP_REMINDER.tick(); GP_REMINDER.state.prevTick -= 120000; GP_REMINDER.tick();
          return new Promise(r => setTimeout(() => r(window.__notes), 50)); }""")
        ok('web: fires at chosen time (once per day)', len(fired) == 1 and fired[0]['body'] == '花一分钟，记下今天的进步。' and fired[0]['title'] == 'Ledger', fired)
        late = await p.evaluate("""() => { window.__notes = []; localStorage.removeItem('growth-plan:reminder-last');
          localStorage.setItem('growth-plan:reminder', JSON.stringify({ on: true, time: '00:00' }));
          const n = new Date(); if (n.getHours() < 2) return 'skip';
          GP_REMINDER.state.prevTick = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - 1000; GP_REMINDER.tick(); return new Promise(r => setTimeout(() => r(window.__notes.length), 50)); }""")
        ok('web: missed by > 1 h (sleep) → no late popup', late in (0, 'skip'), late)
        no_before = await p.evaluate("""() => { window.__notes = []; localStorage.removeItem('growth-plan:reminder-last');
          localStorage.setItem('growth-plan:reminder', JSON.stringify({ on: true, time: '23:59' }));
          GP_REMINDER.state.prevTick = Date.now() - 20000; GP_REMINDER.tick(); return new Promise(r => setTimeout(() => r(window.__notes.length), 50)); }""")
        ok('web: does not fire before the time', no_before == 0 or __import__('time').localtime().tm_hour == 23)
        await p.evaluate("localStorage.setItem('growth-plan:reminder', JSON.stringify({ on: true, time: '07:30' }))")
        await p.reload(); await p.wait_for_timeout(400); await open_prefs(p)
        ok('web: survives reload (on, 07:30)', await p.is_checked('#remOn') and await p.input_value('#remTime') == '07:30')
        await p.click('.rem__toggle'); await p.wait_for_timeout(150)
        ok('web: off → persisted, timer cleared', await rem(p) == {'on': False, 'time': '07:30'} and await p.evaluate('!GP_REMINDER.state.timer'))
        # 英文
        await p.locator('#prefsMenu [data-set-lang="en"]').click(); await p.wait_for_timeout(250)
        t_en = await p.locator('#remGrp').inner_text()
        ok('web EN: translated (Daily reminder / only fire while open)', 'Remind me to log' in t_en and 'only fire while' in t_en and 'Android app' in t_en and not any('\u4e00' <= c <= '\u9fff' for c in t_en), t_en)
        ok('web EN: time label translated', await p.get_attribute('#remTime', 'aria-label') == 'Reminder time')
        en_body = await p.evaluate("""() => { window.__notes = []; localStorage.removeItem('growth-plan:reminder-last');
          const n = new Date(); localStorage.setItem('growth-plan:reminder', JSON.stringify({ on: true, time: String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0') }));
          GP_REMINDER.state.prevTick = new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes()).getTime() - 1000; GP_REMINDER.tick(); return new Promise(r => setTimeout(() => r(window.__notes.map(x => x.body)), 50)); }""")
        ok('web EN: notification text in English', en_body == ['Take a minute to log today.'], en_body)
        ok('web: no page errors', not errs, errs)
        await ctx.close()

        # ---------- 网页 · 拒绝权限 ----------
        ctx, p, errs = await boot(b, FAKE_NOTIFY + "window.__grant = 'denied';")
        await p.evaluate("window.__grant = 'denied'")
        await open_prefs(p); await p.click('.rem__toggle'); await p.wait_for_timeout(250)
        h = await p.locator('#remHelp').inner_text()
        ok('web denied: switch reverts off, not persisted on', not await p.is_checked('#remOn') and (await rem(p) or {}).get('on') is False)
        ok('web denied: explains how to allow', '拦截了通知' in h, h)
        ok('web denied: no page errors', not errs, errs)
        await ctx.close()

        # ---------- 网页 · 不支持 Notification ----------
        for w in (390, 1280):
            ctx, p, errs = await boot(b, NO_NOTIFY, w=w)
            ok(f'unsupported ({w}px): reminder hidden, no errors', not await p.locator('#remGrp').is_visible() and not errs and await p.evaluate("!document.documentElement.classList.contains('has-reminder')"), errs)
            if w == 390:
                await open_prefs(p)
                ok('unsupported phone: settings panel still has skins + language + export', await p.locator('#prefsMenu [data-set-skin="farm"]').is_visible() and await p.locator('#prefsMenu [data-set-lang="en"]').is_visible() and await p.locator('#prefsCsv').is_visible() and not await p.locator('#remGrp').is_visible())
            else:
                ok('unsupported desktop: 我的 still reachable (skins + export live there)', await p.locator('.tabbar__a[data-tab="me"]').is_visible())
            await ctx.close()

        # ---------- 网页 · 桌面 ----------
        ctx, p, errs = await boot(b, FAKE_NOTIFY, w=1280)
        ok('desktop: 我的 reachable for reminder', await p.locator('.tabbar__a[data-tab="me"]').is_visible())
        await open_prefs(p)
        ok('desktop: 我的 shows reminder + one language group', await p.locator('#remGrp').is_visible() and await p.locator('#prefsMenu [data-set-lang="en"]').count() == 1)
        fits = await p.evaluate("(() => { const r = document.querySelector('#prefsMenu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()")
        ok('desktop: panel within viewport', fits)
        await ctx.close()

        # ---------- 模拟安卓壳（Capacitor LocalNotifications） ----------
        ctx, p, errs = await boot(b, FAKE_NATIVE)
        await open_prefs(p)
        h = await p.locator('#remHelp').inner_text()
        ok('native: no web caveat, no APK link', '只在本页面' not in h and not await p.locator('#remApk').is_visible(), h)
        await p.click('.rem__toggle'); await p.wait_for_timeout(300)
        calls = await p.evaluate('window.__ln')
        sch = [c[1] for c in calls if c[0] == 'schedule']
        ok('native: requests POST_NOTIFICATIONS permission', ['request'] in calls, calls)
        ok('native: schedules daily repeat at 21:00', len(sch) == 1 and sch[0]['schedule']['on'] == {'hour': 21, 'minute': 0} and sch[0]['id'] == 2100, sch)
        ok('native: zh notification text + channel', sch and sch[0]['body'] == '花一分钟，记下今天的进步。' and sch[0]['title'] == 'Ledger' and sch[0]['channelId'] == 'ledger-reminder' and any(c[0] == 'channel' and c[2] == '每天提醒' for c in calls))
        ok('native: cancels before rescheduling (no duplicates)', calls.index(next(c for c in calls if c[0] == 'cancel')) < calls.index(next(c for c in calls if c[0] == 'schedule')))
        ok('native: helper confirms time', '每天 21:00' in await p.locator('#remHelp').inner_text())
        await p.evaluate('window.__ln = []')
        await p.fill('#remTime', '08:15'); await p.wait_for_timeout(200)   # fill 会触发 change
        sch = [c[1] for c in await p.evaluate('window.__ln') if c[0] == 'schedule']
        ok('native: time change → rescheduled 08:15', len(sch) == 1 and sch[0]['schedule']['on'] == {'hour': 8, 'minute': 15}, sch)
        await p.evaluate('window.__ln = []')
        await p.locator('#prefsMenu [data-set-lang="en"]').click(); await p.wait_for_timeout(300)
        sch = [c[1] for c in await p.evaluate('window.__ln') if c[0] == 'schedule']
        ok('native: language change → English text rescheduled', len(sch) == 1 and sch[0]['body'] == 'Take a minute to log today.', sch)
        await p.evaluate('window.__ln = []')
        await p.click('.rem__toggle'); await p.wait_for_timeout(200)
        calls = await p.evaluate('window.__ln')
        ok('native: off → cancel, no schedule', ['cancel', 2100] in calls and not any(c[0] == 'schedule' for c in calls), calls)
        ok('native: no page errors', not errs, errs)
        await ctx.close()

        # 安卓：启动时已开启且已授权 → 重新排；权限被系统设置关掉 → 显示提示、不排
        ctx, p, errs = await boot(b, FAKE_NATIVE.replace("let perm = 'prompt'", "let perm = window.__startPerm || 'granted'"))
        await p.evaluate("localStorage.setItem('growth-plan:reminder', JSON.stringify({ on: true, time: '21:30' }))")
        await p.reload(); await p.wait_for_timeout(500)
        sch = [c[1] for c in await p.evaluate('window.__ln') if c[0] == 'schedule']
        ok('native start: reschedules saved reminder (21:30)', len(sch) == 1 and sch[0]['schedule']['on'] == {'hour': 21, 'minute': 30}, sch)
        await ctx.close()
        ctx, p, errs = await boot(b, "window.__startPerm = 'denied';" + FAKE_NATIVE.replace("let perm = 'prompt'", "let perm = window.__startPerm || 'granted'"))
        await p.evaluate("localStorage.setItem('growth-plan:reminder', JSON.stringify({ on: true, time: '21:30' }))")
        await p.reload(); await p.wait_for_timeout(500); await open_prefs(p)
        ok('native start: permission revoked → warns, no schedule', '系统设置' in await p.locator('#remHelp').inner_text() and not any(c[0] == 'schedule' for c in await p.evaluate('window.__ln')))
        ok('native start: no page errors', not errs, errs)
        await ctx.close()
        await b.close()
    n = sum(1 for _, c in results if c); print(f'\n{n}/{len(results)} passed'); sys.exit(0 if n == len(results) else 1)
asyncio.run(main())
