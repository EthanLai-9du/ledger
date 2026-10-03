"""v12 起，全新用户进 App 会先看到新手指引。旧的测试套件（v1–v11）测的是没有指引时的行为，
import 这个模块后，每个新建的浏览器上下文都会先标记「指引已看过」（只在本机没有这个标记时写入）。
gp_v12_test 用 gp_noonb.disable() 关掉。"""
from playwright.async_api._generated import Browser
SCRIPT = "try{if(!localStorage.getItem('growth-plan:onboarded'))localStorage.setItem('growth-plan:onboarded','1')}catch(e){}"
_orig = getattr(Browser, '_gp_orig_new_context', None) or Browser.new_context
Browser._gp_orig_new_context = _orig
ON = [True]
async def _new_context(self, *a, **k):
    ctx = await _orig(self, *a, **k)
    if ON[0]: await ctx.add_init_script(SCRIPT)
    return ctx
Browser.new_context = _new_context
def disable(): ON[0] = False
def enable(): ON[0] = True

# ---------- v12 四个标签页：旧套件的兼容层 ----------
# 旧套件是在「一页长滚动 + 右上角设置面板」上写的。现在内容分在 今天 / 统计 / 习惯 / 我的 四个标签里，
# 设置面板变成了「我的」页。这里在每次操作前：如果目标元素在隐藏的标签里，先切到那个标签（就像用户点底部导航）；
# 点 #prefsBtn（已删除）= 去「我的」，再点一次 = 回「今天」。gp_tabs_test 不用这个兼容层（disable_tabs()）。
from playwright.async_api._generated import Page, Locator
TABS_ON = [True]
_REVEAL = """(sel) => { try {
  if (!window.GP || !GP.goTab) return 0;
  if (sel === '#prefsBtn') { GP.goTab(GP.tab() === 'me' ? 'today' : 'me', true); return 2; }
  let el = null; try { el = document.querySelector(sel); } catch (e) { return 0; }
  const tab = el && el.closest('.tab[hidden]');
  if (tab) { GP.goTab(tab.dataset.tab, true); return 1; }
  return 0; } catch (e) { return 0; } }"""
async def _reveal(page, sel):
    if not TABS_ON[0] or not isinstance(sel, str): return 0
    try: return await page.evaluate(_REVEAL, sel)
    except Exception: return 0
def _wrap_page(name):
    orig = getattr(Page, '_gp_' + name, None) or getattr(Page, name)
    setattr(Page, '_gp_' + name, orig)
    async def f(self, selector, *a, **k):
        r = await _reveal(self, selector)
        if r == 2 and name == 'click': return None
        return await orig(self, selector, *a, **k)
    setattr(Page, name, f)
for _n in ('click', 'fill', 'check', 'uncheck', 'press', 'select_option', 'set_input_files', 'dblclick', 'tap', 'type', 'hover', 'focus', 'set_checked', 'wait_for_selector', 'dispatch_event'):
    _wrap_page(_n)
def _wrap_loc(name):
    orig = getattr(Locator, '_gp_' + name, None) or getattr(Locator, name)
    setattr(Locator, '_gp_' + name, orig)
    async def f(self, *a, **k):
        sel = getattr(getattr(self, '_impl_obj', None), '_selector', None)
        if isinstance(sel, str):
            sel = sel.split(' >> ')[0]
            if not sel.startswith(('internal:', 'text=', 'xpath=')): await _reveal(self.page, sel)
        return await orig(self, *a, **k)
    setattr(Locator, name, f)
for _n in ('click', 'fill', 'check', 'uncheck', 'press', 'select_option', 'set_input_files', 'tap', 'hover', 'focus', 'scroll_into_view_if_needed', 'set_checked', 'wait_for', 'bounding_box', 'screenshot'):
    _wrap_loc(_n)
def disable_tabs(): TABS_ON[0] = False
