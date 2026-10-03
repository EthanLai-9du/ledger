"""截图：手机 · 中文 · 浅色 ·「设置」面板里的每天提醒（已开启）→ shots/reminder-zh.png"""
import asyncio, os
from playwright.async_api import async_playwright
URL = 'http://127.0.0.1:8765/'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots')
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--lang=zh-CN'], env={**os.environ, 'LANG': 'zh_CN.UTF-8', 'LANGUAGE': 'zh_CN:zh', 'LC_ALL': 'zh_CN.UTF-8'})
        ctx = await b.new_context(locale='zh-CN', viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light', reduced_motion='reduce', service_workers='block')
        await ctx.grant_permissions(['notifications'], origin=URL.rstrip('/'))
        p = await ctx.new_page(); await p.goto(URL)
        await p.evaluate('() => { localStorage.clear(); localStorage.setItem("growth-plan:local-only", "1"); localStorage.setItem("growth-plan:theme", "light"); }')
        await p.reload(); await p.wait_for_timeout(500)
        if await p.locator('#gate').is_visible():
            await p.click('#landingCta'); await p.wait_for_timeout(150); await p.click('#gateLocal'); await p.wait_for_timeout(300)
        await p.click('#prefsBtn'); await p.wait_for_timeout(150)
        await p.click('.rem__toggle'); await p.wait_for_timeout(3600)   # 等确认提示收起
        await p.evaluate('document.activeElement && document.activeElement.blur()')
        await p.evaluate('document.fonts.ready'); await p.wait_for_timeout(300)
        await p.screenshot(path=os.path.join(OUT, 'reminder-zh.png'))
        await b.close()
asyncio.run(main())
