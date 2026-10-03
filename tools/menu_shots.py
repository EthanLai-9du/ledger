"""手机顶栏 + 设置面板截图：zh 浅色、en 深色"""
import asyncio
from playwright.async_api import async_playwright
URL = 'http://127.0.0.1:8765/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--lang=zh-CN'])
        for lang, scheme, tag in (('zh-CN', 'light', 'zh-light'), ('en-US', 'dark', 'en-dark')):
            ctx = await b.new_context(locale=lang, color_scheme=scheme, viewport={'width': 390, 'height': 844}, device_scale_factor=2, reduced_motion='reduce', service_workers='block')
            p = await ctx.new_page(); await p.goto(URL)
            await p.evaluate('localStorage.clear()'); await p.reload(); await p.wait_for_timeout(500)
            await p.click('#landingCta'); await p.wait_for_timeout(200); await p.click('#gateLocal'); await p.wait_for_timeout(900)
            await p.screenshot(path=f'shots/menu-{tag}-bar.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 380})
            await p.focus('#prefsBtn'); await p.keyboard.press('Enter'); await p.wait_for_timeout(400)
            await p.screenshot(path=f'shots/menu-{tag}-open.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 540})   # v9：面板里多了「每天提醒」
            await ctx.close()
        await b.close()
asyncio.run(main())
