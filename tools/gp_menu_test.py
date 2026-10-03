"""「我的」页里的设置（v12 起取代右上角面板） + 分语言的一句话（motto）"""
import asyncio, json, sys
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra)
async def boot(b, data=None, lang='zh-CN', w=390):
    ctx = await b.new_context(locale=lang, viewport={'width': w, 'height': 844}, reduced_motion='reduce', service_workers='block')
    p = await ctx.new_page(); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    await p.goto(URL)
    await p.evaluate('(d) => { localStorage.clear(); localStorage.setItem("growth-plan:local-only", "1"); if (d) localStorage.setItem("growth-plan:v1", d); }', json.dumps(data, ensure_ascii=False) if data else None)
    await p.reload(); await p.wait_for_timeout(400)
    if await p.locator('#gate').is_visible():
        await p.click('#landingCta'); await p.wait_for_timeout(150); await p.click('#gateLocal'); await p.wait_for_timeout(250)
    return ctx, p, errs
async def lang_to(p, l):
    back = await p.evaluate("GP.tab()"); await p.evaluate("GP.goTab('me', true)"); await p.locator(f'#prefsMenu [data-set-lang="{l}"]').click(); await p.wait_for_timeout(250); await p.evaluate("t => GP.goTab(t, true)", back)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx, p, errs = await boot(b)
        # ---------- 设置 = 「我的」页（v12 起取代右上角的设置面板）----------
        ok('top bar: no theme / settings button, no bar language switch', await p.locator('#themeBtn').count() == 0 and await p.locator('#prefsBtn').count() == 0 and not await p.locator('.topbar .lang-switch--bar').is_visible())
        ok('settings hidden on 今天', not await p.locator('#prefsMenu').is_visible())
        await p.focus('.tabbar__a[data-tab="me"]'); await p.keyboard.press('Enter'); await p.wait_for_timeout(200)
        ok('Enter on 我的 opens settings page', await p.locator('#prefsMenu').is_visible() and await p.get_attribute('.tabbar__a[data-tab="me"]', 'aria-current') == 'page')
        ok('page: 4 skins, light/dark hidden for pixel skins', await p.locator('#prefsMenu [data-set-skin]').count() == 4 and not await p.locator('#prefsMenu [data-set-theme="dark"]').is_visible())
        await p.focus('#prefsMenu [data-set-skin="farm"]')
        await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); await p.wait_for_timeout(150)
        ok('arrow keys + Enter pick 电玩', await p.evaluate('document.documentElement.dataset.skin') == 'arcade' and await p.get_attribute('#prefsMenu [data-set-skin="arcade"]', 'aria-pressed') == 'true')
        ok('focus stays on the chosen skin', await p.evaluate('document.activeElement.dataset.setSkin') == 'arcade')
        await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); await p.wait_for_timeout(150)
        ok('简约 reveals 明暗 (system/light/dark)', await p.evaluate('document.documentElement.dataset.skin') == 'minimal' and await p.locator('#prefsMenu [data-set-theme="dark"]').is_visible())
        await p.focus('#prefsMenu [data-set-theme="system"]'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); await p.wait_for_timeout(100)
        ok('arrow keys + Enter pick 深色', await p.evaluate('document.documentElement.dataset.theme') == 'dark' and await p.get_attribute('#prefsMenu [data-set-theme="dark"]', 'aria-pressed') == 'true')
        ok('page stays after choosing', await p.locator('#prefsMenu').is_visible())
        await p.keyboard.press('Escape'); await p.wait_for_timeout(100)
        ok('Escape does not hide the page', await p.locator('#prefsMenu').is_visible())
        await p.locator('#prefsMenu [data-set-theme="light"]').click()
        ok('theme: 浅色 set + persisted', await p.evaluate('document.documentElement.dataset.theme + localStorage.getItem("growth-plan:theme")') == 'lightlight')
        await p.locator('#prefsMenu [data-set-lang="en"]').click(); await p.wait_for_timeout(250)
        ok('language EN from 我的', await p.evaluate('document.documentElement.lang') == 'en' and (await p.locator('.tabbar__a[data-tab="me"]').inner_text()).strip() == 'Me')
        ok('page translated', '主题' not in await p.locator('#prefsMenu').inner_text() and 'Light' in await p.locator('#prefsMenu').inner_text() and 'Farm' in await p.locator('#prefsMenu').inner_text())
        tb = await p.evaluate("[...document.querySelectorAll('.topbar__inner > *')].every(e => e.getBoundingClientRect().right <= innerWidth + 0.5)")
        ok('phone top bar fits', tb)
        await p.set_viewport_size({'width': 1280, 'height': 900}); await p.wait_for_timeout(150)
        ok('desktop: sidebar nav shown, 我的 has skins + language + reminder + export', await p.locator('#tabbar').is_visible() and await p.locator('#prefsMenu [data-set-skin]').first.is_visible() and await p.locator('#prefsMenu [data-set-lang="en"]').is_visible() and await p.locator('#prefsJson').is_visible() and await p.locator('#prefsCsv').is_visible())
        await p.click('#prefsMenu [data-set-skin="night"]'); await p.wait_for_timeout(150)
        ok('desktop: 星夜 picked, light/dark hides', await p.evaluate('document.documentElement.dataset.skin') == 'night' and not await p.locator('#prefsMenu [data-set-theme="dark"]').is_visible())
        tb = await p.evaluate("[...document.querySelectorAll('.topbar__inner > *')].every(e => e.getBoundingClientRect().right <= innerWidth + 0.5)")
        ok('desktop top bar fits (pixel)', tb)
        ok('landing toggle untouched (still 中文 / EN)', await p.locator('#landing [data-lang-switch] [data-set-lang]').count() == 2)
        await p.set_viewport_size({'width': 390, 'height': 844}); await lang_to(p, 'zh'); await p.evaluate("GP.goTab('today', true)")
        # ---------- 分语言的一句话 ----------
        ok('zh default motto', await p.locator('#motto').inner_text() == '慢慢来，比较快。')
        await p.click('#editMotto'); await p.fill('#mText', '一步一步来。'); await p.click('#formMotto .btn--primary'); await p.wait_for_timeout(150)
        await lang_to(p, 'en')
        ok('EN shows default English motto (zh edit stays zh)', await p.locator('#motto').inner_text() == 'Slow is smooth, and smooth is fast.')
        await p.click('#editMotto'); ok('EN dialog prefilled with EN motto', await p.input_value('#mText') == 'Slow is smooth, and smooth is fast.')
        await p.fill('#mText', 'Small steps, every week.'); await p.click('#formMotto .btn--primary'); await p.wait_for_timeout(150)
        ok('EN motto saved', await p.locator('#motto').inner_text() == 'Small steps, every week.')
        await lang_to(p, 'zh')
        ok('zh motto kept separately', await p.locator('#motto').inner_text() == '一步一步来。')
        d = await p.evaluate('GP.get()')
        ok('stored mottos {zh,en} + legacy motto mirrors last edit', d['mottos'] == {'zh': '一步一步来。', 'en': 'Small steps, every week.'} and d['motto'] == 'Small steps, every week.', d.get('mottos'))
        await p.reload(); await p.wait_for_timeout(300)
        ok('persists after reload', await p.locator('#motto').inner_text() == '一步一步来。')
        # 旧版客户端只改了 motto：按文字归到对应语言
        old = await p.evaluate('(() => { const d = JSON.parse(JSON.stringify(GP.get())); d.motto = "已经改过的旧中文"; return d; })()')
        await p.evaluate('(d) => GP.replace(d)', old); await p.wait_for_timeout(100)
        ok('old-client zh edit → zh slot, en kept', await p.evaluate('JSON.stringify(GP.get().mottos)') == json.dumps({'zh': '已经改过的旧中文', 'en': 'Small steps, every week.'}, ensure_ascii=False, separators=(',', ':')))
        ok('validate idempotent', await p.evaluate('JSON.stringify(GP.validate(GP.get())) === JSON.stringify(GP.get())'))
        await ctx.close()
        # 迁移：旧数据只有一句 motto
        base = {'version': 1, 'areas': [{'id': 'a', 'name': 'x', 'color': 'pine'}], 'habits': [], 'goals': [], 'log': {}}
        ctx, p, e2 = await boot(b, dict(base, motto='Keep going.'))
        ok('migrate English motto → en slot (zh shows zh default)', await p.locator('#motto').inner_text() == '慢慢来，比较快。' and await p.evaluate('GP.get().mottos.en') == 'Keep going.')
        await lang_to(p, 'en'); ok('… EN shows it', await p.locator('#motto').inner_text() == 'Keep going.')
        await ctx.close()
        ctx, p, e3 = await boot(b, dict(base, motto='继续向前走。'), lang='en-US')
        ok('migrate Chinese motto → zh slot (EN shows EN default)', await p.locator('#motto').inner_text() == 'Slow is smooth, and smooth is fast.' and await p.evaluate('GP.get().mottos.zh') == '继续向前走。')
        await ctx.close()
        ctx, p, e4 = await boot(b, dict(base, motto='慢慢来，比较快。', mottos='garbage'))
        ok('bad mottos field tolerated', await p.evaluate('JSON.stringify(GP.get().mottos)') == '{"zh":"","en":""}')
        await ctx.close()
        ok('no page errors', not (errs + e2 + e3 + e4), errs + e2 + e3 + e4)
        await b.close()
    print('\n%d/%d passed' % (sum(r for _, r in results), len(results)))
    sys.exit(0 if all(r for _, r in results) else 1)
asyncio.run(main())
