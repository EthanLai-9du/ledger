"""v10：像素主题同步 + 频率 / 连续 / 这周完成率 / 每天一句笔记 / 年度热力图 / JSON+CSV 导出 / 旧数据迁移
运行前：在 growth-plan-app 目录 `python3 -m http.server 8765`
"""
import asyncio, json, sys, csv, io
from datetime import date, timedelta
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
from gp_cloud_test import Mock, new_page, wait_status, BASE
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra if not cond else '')
T = date.today(); MON = T - timedelta(days=T.weekday())
def k(d): return d.isoformat()
def mon(n): return MON - timedelta(days=7 * n)   # n 周前的周一
CREATED = k(MON - timedelta(days=70))

def v1_row():
    """v9 及以前的数据：习惯只有 days，没有 freq / target / notes / prefs"""
    log = {}
    def add(d, hid): log.setdefault(k(d), []).append(hid)
    for w in (1, 2):                       # 周一至周五的习惯：前两周的周一到周五都做了
        for i in range(5): add(mon(w) + timedelta(days=i), 'wk')
    for i in range(5):                     # 这周：周一到周五（不超过今天）
        d = MON + timedelta(days=i)
        if d < T: add(d, 'wk')
    for d in range(1, 4): add(T - timedelta(days=d), 'dy')   # 每天：昨天往前连续 3 天
    for d in range(10, 16): add(T - timedelta(days=d), 'dy') # 更早有一段 6 天
    add(mon(1) + timedelta(days=6), 'sun'); add(mon(2) + timedelta(days=6), 'sun')
    return {'version': 1, 'motto': '慢慢来，比较快。',
            'areas': [{'id': 'a1', 'name': '学业', 'color': 'pine'}],
            'habits': [{'id': 'wk', 'name': '阅读', 'area': 'a1', 'days': [0, 1, 2, 3, 4], 'created': CREATED},
                       {'id': 'dy', 'name': '散步', 'area': 'a1', 'days': [0, 1, 2, 3, 4, 5, 6], 'created': CREATED},
                       {'id': 'sun', 'name': '复盘', 'area': 'a1', 'days': [6], 'created': CREATED}],
            'goals': [{'id': 'g1', 'title': '读完一本书', 'area': 'a1', 'due': '', 'done': False, 'steps': []}],
            'log': log}

async def local(b, data=None, w=390, lang='zh-CN', skin=None):
    ctx = await b.new_context(locale=lang, viewport={'width': w, 'height': 844}, reduced_motion='reduce', service_workers='block', accept_downloads=True)
    init = "localStorage.setItem('growth-plan:local-only','1');"
    if skin: init += "localStorage.setItem('growth-plan:skin','%s');" % skin
    p = await ctx.new_page(); errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') and 'Service Worker' not in m.text else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    await p.goto(BASE)
    await p.evaluate("(a) => { localStorage.clear(); localStorage.setItem('growth-plan:local-only','1'); if (a[1]) localStorage.setItem('growth-plan:skin', a[1]); if (a[0]) localStorage.setItem('growth-plan:v1', a[0]); }", [json.dumps(data, ensure_ascii=False) if data else None, skin])
    await p.reload(); await p.wait_for_timeout(500)
    if await p.locator('#gate').is_visible():
        await p.click('#landingCta'); await p.wait_for_timeout(150); await p.click('#gateLocal'); await p.wait_for_timeout(300)
    return ctx, p, errs

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        # ---------- 1. 迁移：v1 数据 ----------
        row = v1_row()
        ctx, p, errs = await local(b, row)
        s = await p.evaluate('GP.get()')
        hs = {h['id']: h for h in s['habits']}
        ok('migrate: all habits kept', list(hs) == ['wk', 'dy', 'sun'], list(hs))
        ok('migrate: Mon–Fri → weekdays, 7 days → daily, [6] → days', hs['wk']['freq'] == 'weekdays' and hs['dy']['freq'] == 'daily' and hs['sun']['freq'] == 'days' and hs['sun']['days'] == [6], [h['freq'] for h in s['habits']])
        ok('migrate: log preserved exactly', s['log'] == row['log'])
        ok('migrate: goals / areas / motto preserved', s['goals'][0]['title'] == '读完一本书' and s['areas'][0]['name'] == '学业' and s['motto'] == row['motto'])
        ok('migrate: notes = {} and prefs.theme = farm', s['notes'] == {} and s['prefs']['theme'] == 'farm', (s.get('notes'), s.get('prefs')))
        ok('migrate: validate idempotent', await p.evaluate('JSON.stringify(GP.validate(GP.get())) === JSON.stringify(GP.get())'))
        ok('migrate: legacy row with no theme renders 田园', await p.evaluate("document.documentElement.dataset.skin") == 'farm')
        # 坏字段容错
        bad = dict(row, notes={'2026-01-01': 'ok', 'x': 'bad key', '2026-01-02': 123}, prefs={'theme': 'neon'},
                   habits=row['habits'] + [{'id': 'zz', 'name': '坏频率', 'area': 'a1', 'days': [1, 3], 'freq': 'weekly', 'target': 99, 'created': CREATED}])
        v = await p.evaluate('(d) => GP.validate(d)', bad)
        ok('validate: bad note keys / non-string notes dropped', v['notes'] == {'2026-01-01': 'ok'}, v['notes'])
        ok('validate: unknown theme → farm', v['prefs']['theme'] == 'farm')
        zz = [h for h in v['habits'] if h['id'] == 'zz'][0]
        ok('validate: weekly target clamped to default 3, all 7 days', zz['target'] == 3 and zz['days'] == [0, 1, 2, 3, 4, 5, 6], zz)

        # ---------- 2. 连续 / 最长 / 这周完成率 ----------
        st = await p.evaluate("GP.get().habits.map(h => [h.id, GP.calc.streak(h), GP.calc.bestStreak(h), GP.calc.weekProgress(h)])")
        st = {x[0]: x[1:] for x in st}
        this_week_wk = sum(1 for i in range(5) if MON + timedelta(days=i) < T)
        want_wk = 10 + this_week_wk   # 前两周 + 这周到昨天；周六周天不需要，不算断
        ok(f'streak: weekdays habit skips weekends ({want_wk})', st['wk'][0] == want_wk, st['wk'])
        ok('streak: daily habit = 3, longest = 6', st['dy'][0] == 3 and st['dy'][1] == 6, st['dy'])
        ok('streak: Sunday-only habit counts 2 Sundays', st['sun'][0] == (2 if T.weekday() != 6 else 2) and st['sun'][1] == 2, st['sun'])
        ok('week progress: weekdays target 5', st['wk'][2]['target'] == 5 and st['wk'][2]['done'] == this_week_wk, st['wk'][2])
        sat = k(MON + timedelta(days=5))
        ok('required: weekdays habit not required on Saturday', await p.evaluate("(k) => GP.calc.required(GP.get().habits[0], k)", sat) is False)
        # 每周 N 次
        wl = await p.evaluate("""(a) => { const d = JSON.parse(JSON.stringify(GP.get()));
          d.habits.push({ id: 'w3', name: '跑步', area: 'a1', freq: 'weekly', target: 3, days: [0,1,2,3,4,5,6], created: a.c });
          for (const x of a.done) (d.log[x] = d.log[x] || []).push('w3');
          GP.replace(d); const h = GP.get().habits.find(h => h.id === 'w3');
          return [GP.calc.streak(h), GP.calc.bestStreak(h), GP.calc.weekProgress(h), GP.calc.required(h, a.mon), GP.calc.required(h, a.sun)]; }""",
          {'c': CREATED, 'mon': k(mon(1)), 'sun': k(mon(1) + timedelta(days=6)),
           'done': [k(mon(1) + timedelta(days=i)) for i in (0, 2, 4)] + [k(mon(2) + timedelta(days=i)) for i in (1, 3, 5)] + [k(mon(3) + timedelta(days=1))]})
        ok('weekly 3×: streak = 2 weeks (this week still open), longest 2', wl[0] == 2 and wl[1] == 2, wl)
        ok('weekly 3×: done day required, later days after target not required', wl[3] is True and wl[4] is False, wl[3:])
        # 界面：这周 x/y、off-days 不需要、低调的统计表
        await p.reload(); await p.wait_for_timeout(400)
        row_txt = await p.locator('.habit', has_text='阅读').first.inner_text()
        ok('row shows 这周 x/5 + streak', f'这周 {this_week_wk}/5' in row_txt.replace('\n', ' ') or f'这周 {this_week_wk}/5' in row_txt, row_txt)
        rest = await p.locator('.week .cell.is-rest').count()
        ok('week view: off-days rendered as not required', rest >= 2, rest)
        ok('week view: rest cell aria says 不需要打卡', await p.locator('.week .cell.is-rest').first.evaluate("e => (e.getAttribute('aria-label') || e.textContent).includes('不需要打卡')"))
        ok('stats table lists every habit', await p.locator('#hstats tbody tr').count() == 4)

        # ---------- 3. 每天一句笔记 ----------
        await p.evaluate("GP.goTab('today', true)"); await p.locator('#habitList [data-act="note"]').first.click(); await p.wait_for_timeout(150); await p.fill('#noteIn', '读了两章，跑了三公里'); await p.press('#noteIn', 'Enter'); await p.wait_for_timeout(250)
        await p.evaluate("GP.goTab('stats', true)")
        ok('note saved for today', await p.evaluate("(k) => GP.get().notes[k]", k(T)) == '读了两章，跑了三公里')
        ok('note shows in history', '读了两章' in await p.locator('#notesList').inner_text())
        ok('heatmap cell marks note', await p.locator(f'#heatGrid [data-k="{k(T)}"].has-note').count() == 1)
        long = '很' * 120
        await p.evaluate("GP.goTab('today', true)"); await p.locator('#habitList [data-act="note"]').first.click(); await p.wait_for_timeout(150); await p.fill('#noteIn', long); ok('note input limited to 80 chars', len(await p.input_value('#noteIn')) == 80)
        await p.fill('#noteIn', ''); await p.press('#noteIn', 'Enter'); await p.wait_for_timeout(200)
        ok('clearing note removes it', await p.evaluate("(k) => GP.get().notes[k]", k(T)) is None)

        # ---------- 4. 年度热力图 ----------
        n = await p.locator('#heatGrid .hc').count()
        ok('year heatmap: 53 weeks of cells', 365 <= n <= 371, n)
        ok('year heatmap: roving tabindex (one tab stop)', await p.locator('#heatGrid .hc[tabindex="0"]').count() == 1)
        cell = p.locator(f'#heatGrid [data-k="{k(T - timedelta(days=2))}"]')
        await cell.click(); await p.wait_for_timeout(150)
        ok('click a day → day card shows it', await cell.get_attribute('aria-pressed') == 'true' and '散步' in await p.locator('#dayList').inner_text())
        await p.keyboard.press('ArrowUp'); await p.wait_for_timeout(100)
        ok('arrow keys move by day', await p.evaluate("document.activeElement.dataset.k") == k(T - timedelta(days=3)))
        await p.fill('#dayNoteIn', '补一条过去的笔记'); await p.press('#dayNoteIn', 'Enter'); await p.wait_for_timeout(200)
        ok('note for a past day from the day card', await p.evaluate("() => Object.values(GP.get().notes).includes('补一条过去的笔记')"))

        # ---------- 5. 导出 JSON + CSV ----------
        await p.evaluate("GP.goTab('me', true)"); await p.wait_for_timeout(120)
        async with p.expect_download() as dl: await p.click('#prefsJson')
        d = await dl.value; data = json.load(open(await d.path(), encoding='utf-8'))
        ok('export JSON: full state incl. notes + prefs + freq', d.suggested_filename == f'ledger-{k(T)}.json' and 'notes' in data and data['prefs']['theme'] == 'farm' and data['habits'][0]['freq'] == 'weekdays', d.suggested_filename)
        if not await p.locator('#prefsCsv').is_visible(): await p.evaluate("GP.goTab('me', true)"); await p.wait_for_timeout(120)
        async with p.expect_download() as dl: await p.click('#prefsCsv')
        d = await dl.value; raw = open(await d.path(), 'rb').read()
        ok('export CSV: UTF-8 BOM for Excel', raw.startswith(b'\xef\xbb\xbf') and d.suggested_filename == f'ledger-{k(T)}.csv')
        rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig'))))
        ok('export CSV: header 时间 / 星期 / 完成度 / habits / 笔记', rows[0][:3] == ['时间', '星期', '完成度'] and rows[0][-1] == '笔记' and '阅读' in rows[0], rows[0])
        ok('export CSV: one row per day since first record', len(rows) - 1 >= 70)
        ok('export CSV: no 日 anywhere', '日' not in raw.decode('utf-8-sig'))
        r2 = [r for r in rows if r[0] == k(T - timedelta(days=2))][0]
        ok('export CSV: done marks per habit', r2[rows[0].index('散步')] not in ('', '0'), r2)
        ok('export also on the data section', await p.locator('#csvBtn').count() == 1)
        ok('no console errors (local)', not errs, errs)
        await ctx.close()

        # ---------- 6. 频率表单 ----------
        ctx, p, errs = await local(b, row)
        await p.click('[data-action="add-habit"]'); await p.fill('#hName', '游泳')
        await p.check('#hFreq input[value="weekly"]') if await p.locator('#hFreq input[value="weekly"]').count() else await p.check('input[name="freq"][value="weekly"]')
        await p.fill('#hTarget', '9'); await p.click('#formHabit button[type=submit]'); await p.wait_for_timeout(250)
        ok('form: weekly target out of range rejected', await p.locator('#dlgHabit').is_visible() and not await p.evaluate("GP.get().habits.some(h => h.name === '游泳')"))
        await p.fill('#hTarget', '2'); await p.click('#formHabit button[type=submit]'); await p.wait_for_timeout(250)
        h = await p.evaluate("GP.get().habits.find(h => h.name === '游泳')")
        ok('form: weekly 2×/week saved', h and h['freq'] == 'weekly' and h['target'] == 2, h)
        flex_or_today = '游泳' in await p.locator('#habitFlexList').inner_text() if T.weekday() < 5 else '游泳' in await p.locator('#habitList').inner_text()
        ok('form: weekly habit grouped (flex early in week; must-do once days run out)', flex_or_today)
        ok('no console errors (form)', not errs, errs)
        await ctx.close()

        # ---------- 7. 云同步：主题 + 笔记跟着账号走，迁移不造成多余上传 ----------
        mock = Mock()
        uid = 'u-v10'; mock.users['v10@test.dev'] = {'id': uid, 'email': 'v10@test.dev', 'password': 'secret123', 'confirmed': True}
        mock.rows[uid] = {'user_id': uid, 'data': row, 'rev': 5, 'updated_at': '2026-10-01T00:00:00Z', 'device': 'old'}
        ctx, p, errs = await new_page(b, mock, viewport={'width': 390, 'height': 844})
        await p.goto(BASE); await p.wait_for_timeout(400)
        await p.click('#landingCta'); await p.fill('#authEmail', 'v10@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('cloud: legacy row signs in → synced', await wait_status(p, 'synced'))
        await p.wait_for_timeout(1200)
        ok('cloud: legacy row pulled, log intact', (await p.evaluate('GP.get().log')) == row['log'])
        ok('cloud: silent migration does not push (no spurious write)', not any(c[0] == 'PATCH' for c in mock.calls) and mock.rows[uid]['rev'] == 5, [c[0] for c in mock.calls])
        await p.evaluate("GP.setSkin('night')"); await p.wait_for_timeout(200)
        ok('cloud: changing skin pushes prefs.theme', await wait_status(p, 'synced') and await p.wait_for_function("true") and True)
        await p.wait_for_timeout(1500)
        ok('cloud: row now has prefs.theme = night', mock.rows[uid]['data'].get('prefs', {}).get('theme') == 'night', mock.rows[uid]['data'].get('prefs'))
        await ctx.close()
        # 另一台设备：没选过主题的本机，登录后跟随账号的主题
        ctx, p, e2 = await new_page(b, mock, viewport={'width': 1280, 'height': 900})
        await p.goto(BASE); await p.wait_for_timeout(400)
        await p.click('#landingCta'); await p.fill('#authEmail', 'v10@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        await wait_status(p, 'synced'); await p.wait_for_timeout(600)
        ok('cloud: second device adopts synced skin (星夜)', await p.evaluate("document.documentElement.dataset.skin") == 'night' and await p.evaluate("localStorage.getItem('growth-plan:skin')") == 'night')
        ok('no console errors (cloud)', not errs and not e2, errs + e2)
        await ctx.close()
        await b.close()
    n = sum(1 for _, c in results if c); print(f'\n{n}/{len(results)} passed'); sys.exit(0 if n == len(results) else 1)
asyncio.run(main())
