"""入门模板 & 老用户数据保护测试（Playwright + 模拟 Supabase，无需真实 key）
运行前：在 growth-plan-app 目录 `python3 -m http.server 8765`
"""
import asyncio, json, re
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
from gp_cloud_test import Mock, new_page, wait_status, BASE

CODES = ['ITE3006', 'ITP3915', 'ITP3902', 'LAN3107', 'SDD4005', 'ITP4250', 'ITP4456', 'ITP3901', 'HK$']
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra if not cond else '')

def seed_text(d):
    parts = [h['name'] for h in d['habits']] + [g['title'] + g['note'] + ''.join(t['text'] for t in g['tasks']) for g in d['goals']] + [a['name'] for a in d['areas']] + [d['motto']]
    return ''.join(parts)

OLD_SEED = {'version': 1, 'motto': '慢慢来，比较快。', 'areas': [{'id': 'a-study', 'name': '学业', 'color': 'indigo'}],
            'habits': [{'id': 'h1', 'name': '课前预习 / 课后复习 30 分钟', 'seal': '习', 'area': 'a-study', 'days': [0,1,2,3,4,5,6], 'created': '2026-04-01'}],
            'goals': [{'id': 'g1', 'title': 'ITP4250 期末项目拿到 A', 'area': 'a-study', 'due': '', 'note': '', 'tasks': []}],
            'log': {'2026-09-30': ['h1']}}

async def main():
    mock = Mock()
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        # 1. 全新用户（本机模式）→ 通用模板
        ctx, p, errs = await new_page(b, mock)
        await p.goto(BASE); await p.wait_for_timeout(600)
        await p.click('#landingCta'); await p.click('#gateLocal'); await p.wait_for_timeout(300)
        d = await p.evaluate('GP.get()')
        ok('fresh user: 7 habits / 5 goals', len(d['habits']) == 7 and len(d['goals']) == 5)
        ok('fresh user: no fake check-in history', d['log'] == {})
        ok('fresh user: all 5 areas covered', set(h['area'] for h in d['habits']) == {'a-study', 'a-health', 'a-skill', 'a-habit', 'a-life'})
        txt = seed_text(d); body = await p.locator('body').inner_text(); html = await p.content()
        ok('fresh user: no course codes in data', not any(c in txt for c in CODES))
        ok('fresh user: no course codes on page / placeholders', not any(c in body or c in html for c in CODES))
        ok('template text never uses 日', '日' not in txt)
        ok('GP.isSample recognises template', await p.evaluate('GP.isSample(GP.get())'))
        ok('no console errors (fresh)', not errs, errs)
        await ctx.close()

        # 2. 未登录的旧本机缓存（旧示例）→ 原样保留
        ctx, p, errs = await new_page(b, mock)
        await p.goto(BASE)
        await p.evaluate("([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('growth-plan:mode', 'local'); }", ['growth-plan:v1', json.dumps(OLD_SEED, ensure_ascii=False)])
        await p.reload(); await p.wait_for_timeout(500)
        d = await p.evaluate('GP.get()')
        ok('old local cache kept as-is (not replaced by template)', d['goals'][0]['title'] == 'ITP4250 期末项目拿到 A' and d['log'] == OLD_SEED['log'])
        await ctx.close()

        # 3. 老用户：云端已有数据，在新设备上登录 → 用云端，绝不被模板覆盖
        mock.users['old@test.dev'] = {'id': 'u-old', 'email': 'old@test.dev', 'password': 'secret123', 'confirmed': True}
        cloud = json.loads(json.dumps(OLD_SEED)); cloud['habits'][0]['name'] = '我的老习惯'
        mock.rows['u-old'] = {'user_id': 'u-old', 'data': cloud, 'rev': 9, 'updated_at': '2026-09-30T10:00:00.000Z', 'device': 'Android · Chrome'}
        ctx, p, errs = await new_page(b, mock)
        await p.goto(BASE); await p.wait_for_timeout(600)
        n0 = len(mock.calls)
        await p.click('#landingCta')
        await p.fill('#authEmail', 'old@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('existing user login → synced', await wait_status(p, 'synced'))
        await p.wait_for_timeout(1500)
        writes = [c for c in mock.calls[n0:] if c[0] in ('POST', 'PATCH') and c[1] == '/rest/v1/user_state']
        ok('existing cloud row not written (no POST/PATCH)', not writes, writes)
        ok('existing cloud row unchanged', mock.rows['u-old']['rev'] == 9 and mock.rows['u-old']['data']['habits'][0]['name'] == '我的老习惯')
        ok('device shows cloud data, not template', (await p.evaluate('GP.get().habits.map(h => h.name)')) == ['我的老习惯'])
        # 4. 已登录用户刷新：本机缓存不被模板覆盖
        await p.reload(); ok('reload keeps session', await wait_status(p, 'synced')); await p.wait_for_timeout(800)
        ok('logged-in local cache survives reload', (await p.evaluate('GP.get().habits.map(h => h.name)')) == ['我的老习惯'] and mock.rows['u-old']['rev'] == 9)
        ok('no console errors (existing user)', not errs, errs)
        await ctx.close()

        # 5. 全新注册、云端无行 → 插入通用模板
        ctx, p, errs = await new_page(b, mock)
        await p.goto(BASE); await p.wait_for_timeout(600)
        await p.click('#landingCta'); await p.click('#tabUp'); await p.fill('#authEmail', 'new@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('new signup → synced', await wait_status(p, 'synced'))
        nid = mock.users['new@test.dev']['id']; r = mock.rows.get(nid)
        ok('new user row = generic template', r and len(r['data']['habits']) == 7 and not any(c in seed_text(r['data']) for c in CODES))
        ok('old user row still untouched', mock.rows['u-old']['rev'] == 9)
        await ctx.close(); await b.close()
    print('\n%d/%d passed' % (sum(r for _, r in results), len(results)))

asyncio.run(main())
