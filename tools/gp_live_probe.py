"""真实 Supabase 联通测试（不注册、不发邮件）：配置识别 + 错误密码登录返回中文提示 + 无控制台报错"""
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(locale='zh-CN', viewport={'width': 1280, 'height': 900}, service_workers='block'); p = await ctx.new_page(); errs = []
        p.on('console', lambda m: errs.append(m.text) if m.type in ('error','warning') and 'Failed to load resource' not in m.text and 'Service Worker' not in m.text else None)
        p.on('pageerror', lambda e: errs.append(str(e)))
        await p.goto('http://127.0.0.1:8765/'); await p.wait_for_timeout(1200)
        print('configured:', await p.evaluate('GPCloud.configured'), '| notice hidden:', not await p.locator('#authNotice').is_visible())
        await p.fill('#authEmail', 'nobody-gp-probe@example.com'); await p.fill('#authPass', 'definitely-wrong-123'); await p.click('#authSubmit')
        await p.wait_for_function("document.querySelector('#authMsg').textContent.length > 0", timeout=15000)
        print('live wrong-cred message:', await p.locator('#authMsg').inner_text())
        print('console errors:', errs)
        await b.close()
asyncio.run(main())
