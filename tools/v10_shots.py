"""v10 像素主题截图：python3 tools/v10_shots.py [only]   （需本地服务器 127.0.0.1:8765）
- v10-farm-mobile / v10-arcade-mobile / v10-night-mobile：390×844 @3x，主界面（今天）
- v10-farm-heatmap-mobile：这一年 + 每个习惯的数据
- v10-farm-landing-mobile：首页
- v10-arcade-desktop：1440×900
示例数据：通用模板 + 一段确定性的打卡历史和几条笔记（不含任何个人信息）。"""
import sys, asyncio
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引
BASE = 'http://127.0.0.1:8765/'
OUT = '/workspace/growth-plan-app/shots/'
ONLY = sys.argv[1] if len(sys.argv) > 1 else ''
FAKE = "window.SUPABASE_URL='https://qgqfbouvhbenjgcrstyz.supabase.co';window.SUPABASE_KEY='sb_publishable_MOCK_0123456789abcdef';"
SEED = r"""(() => {
  const s = JSON.parse(JSON.stringify(GP.get()));
  const pad = n => String(n).padStart(2, '0'), key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const T = new Date(); T.setHours(0, 0, 0, 0);
  let seed = 7; const R = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const start = new Date(T); start.setDate(start.getDate() - 330);
  s.habits.forEach(h => h.created = key(start));
  s.log = {}; s.notes = {};
  const dow = d => (d.getDay() + 6) % 7;
  for (let d = new Date(start); d < T; d.setDate(d.getDate() + 1)) {
    const age = (T - d) / 864e5, p = 0.5 + 0.38 * (1 - age / 330);
    const ids = [];
    s.habits.forEach(h => {
      if (h.freq === 'weekly') { if (R() < 0.45) ids.push(h.id); return; }
      if (h.days.indexOf(dow(d)) >= 0 && R() < p) ids.push(h.id);
    });
    if (ids.length) s.log[key(d)] = ids;
  }
  // 这周：前几天做得不错，今天做了 2 项
  const ws = new Date(T); ws.setDate(ws.getDate() - dow(T));
  for (let d = new Date(ws); d < T; d.setDate(d.getDate() + 1)) {
    s.log[key(d)] = s.habits.filter((h, i) => (h.freq === 'weekly' ? i % 2 === 0 && dow(d) % 2 === 0 : h.days.indexOf(dow(d)) >= 0 && (i + dow(d)) % 4 !== 0)).map(h => h.id);
  }
  s.log[key(T)] = [s.habits[1].id, s.habits[4].id];
  const notes = __NOTES__;
  notes.forEach((t, i) => { const d = new Date(T); d.setDate(d.getDate() - [1, 3, 6, 9, 14, 23][i]); s.notes[key(d)] = t; });
  GP.replace(s);
})()"""
NOTES_ZH = "['读完了第三章，顺手做了笔记', '晚上跑了 5 公里，状态不错', '早睡成功，明天继续', '复习了一整个单元', '整理了这周的计划', '练习了四十分钟']"
NOTES_EN = "['Finished chapter three and took notes', 'Ran 5 km in the evening', 'In bed early, keep it up', 'Reviewed a whole unit', 'Planned the week', 'Practised for forty minutes']"

async def app_page(b, skin, w, h, dpr, lang='zh', reduce=False):
    ctx = await b.new_context(locale='zh-CN' if lang == 'zh' else 'en-US', viewport={'width': w, 'height': h}, device_scale_factor=dpr, service_workers='block', reduced_motion='reduce' if reduce else 'no-preference')
    await ctx.route('**/config.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE))
    await ctx.add_init_script(f"try{{localStorage.setItem('growth-plan:skin','{skin}');localStorage.setItem('growth-plan:lang','{lang}')}}catch(e){{}}")
    p = await ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    return ctx, p, errs

async def enter_app(p, lang='zh'):
    await p.goto(BASE); await p.wait_for_timeout(1600)
    await p.click('#landingCta'); await p.wait_for_timeout(500)
    await p.click('#gateLocal'); await p.wait_for_timeout(500)
    await p.evaluate(SEED.replace('__NOTES__', NOTES_ZH if lang == 'zh' else NOTES_EN))
    await p.wait_for_timeout(300)
    await p.evaluate("document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")

async def main():
    allerr = {}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for skin in ('farm', 'arcade', 'night'):
            if ONLY and ONLY not in skin and ONLY not in ('mobile',): continue
            ctx, p, errs = await app_page(b, skin, 390, 844, 3)
            await enter_app(p)
            await p.evaluate("document.querySelectorAll('.js .section').forEach(s=>s.classList.add('is-in'))")
            await p.evaluate('window.scrollTo(0,0)'); await p.wait_for_timeout(900)
            await p.screenshot(path=f'{OUT}v10-{skin}-mobile.png')
            if skin == 'farm':
                await p.evaluate("document.documentElement.style.scrollBehavior='auto'; const y = document.querySelector('#year').getBoundingClientRect().top + scrollY - 64; window.scrollTo(0, y)"); await p.wait_for_timeout(500)
                await p.screenshot(path=f'{OUT}v10-farm-heatmap-mobile.png')
            await p.screenshot(path=f'{OUT}_dbg-{skin}-full.png', full_page=True)
            allerr[skin] = errs
            await ctx.close()
        if not ONLY or ONLY in ('landing', 'farm'):
            ctx, p, errs = await app_page(b, 'farm', 390, 844, 3)
            await p.goto(BASE); await p.wait_for_timeout(1800)
            await p.screenshot(path=f'{OUT}v10-farm-landing-mobile.png')
            allerr['landing'] = errs
            await ctx.close()
        if not ONLY or ONLY in ('desktop', 'arcade'):
            ctx, p, errs = await app_page(b, 'arcade', 1440, 900, 1)
            await enter_app(p)
            await p.evaluate("document.querySelectorAll('.js .section').forEach(s=>s.classList.add('is-in'))")
            await p.evaluate('window.scrollTo(0,0)'); await p.wait_for_timeout(900)
            await p.screenshot(path=f'{OUT}v10-arcade-desktop.png')
            await p.screenshot(path=f'{OUT}_dbg-arcade-desktop-full.png', full_page=True)
            allerr['desktop'] = errs
            await ctx.close()
        await b.close()
    for k, v in allerr.items(): print(k, 'errors:', v[:6])
if __name__ == '__main__':
    asyncio.run(main())
