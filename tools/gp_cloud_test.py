"""云同步端到端测试：用 Playwright 路由模拟 Supabase Auth + PostgREST（不需要真实 key）
运行前：在 growth-plan-app 目录 `python3 -m http.server 8765`
"""
import asyncio, json, base64, time, uuid, re, sys
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import gp_noonb  # v12：旧套件不测新手指引

BASE = 'http://127.0.0.1:8765/'
SB = 'https://qgqfbouvhbenjgcrstyz.supabase.co'
FAKE_CFG = f"window.SUPABASE_URL='{SB}';window.SUPABASE_KEY='sb_publishable_MOCK_0123456789abcdef';"
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra if not cond or extra else '')

class Mock:
    def __init__(self):
        self.users = {}     # email -> {id, password, confirmed}
        self.rows = {}      # uid -> row
        self.confirm_required = False
        self.calls = []
    def b64(self, o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
    def jwt(self, u):
        now = int(time.time())
        return self.b64({'alg': 'HS256', 'typ': 'JWT'}) + '.' + self.b64({'sub': u['id'], 'email': u['email'], 'role': 'authenticated', 'aud': 'authenticated', 'exp': now + 3600, 'iat': now, 'session_id': 's'}) + '.sig'
    def user_obj(self, u):
        return {'id': u['id'], 'aud': 'authenticated', 'role': 'authenticated', 'email': u['email'], 'email_confirmed_at': '2026-10-03T00:00:00Z' if u['confirmed'] else None,
                'identities': [{'id': u['id'], 'provider': 'email'}], 'app_metadata': {'provider': 'email'}, 'user_metadata': {}, 'created_at': '2026-10-03T00:00:00Z'}
    def session(self, u):
        return {'access_token': self.jwt(u), 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'refresh_token': 'r-' + u['id'], 'user': self.user_obj(u)}
    def uid_from(self, req):
        a = req.headers.get('authorization', '')
        try:
            payload = a.split(' ')[1].split('.')[1]; payload += '=' * (-len(payload) % 4)
            return json.loads(base64.urlsafe_b64decode(payload))['sub']
        except Exception: return None
    async def handle(self, route):
        req = route.request; u = urlparse(req.url); q = parse_qs(u.query); path = u.path; m = req.method
        H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', 'content-type': 'application/json'}
        def send(st, body=None, extra=None):
            h = dict(H); h.update(extra or {})
            return route.fulfill(status=st, headers=h, body='' if body is None else json.dumps(body))
        if m == 'OPTIONS': return await send(204)
        body = {}
        try: body = json.loads(req.post_data or '{}')
        except Exception: pass
        self.calls.append((m, path, dict((k, v[0]) for k, v in q.items())))
        if path == '/auth/v1/token' and q.get('grant_type') == ['password']:
            usr = self.users.get(body.get('email'))
            if not usr or usr['password'] != body.get('password'):
                return await send(400, {'code': 400, 'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
            if not usr['confirmed']:
                return await send(400, {'code': 400, 'error_code': 'email_not_confirmed', 'msg': 'Email not confirmed'})
            return await send(200, self.session(usr))
        if path == '/auth/v1/token' and q.get('grant_type') == ['refresh_token']:
            uid = body.get('refresh_token', '')[2:]
            usr = next((x for x in self.users.values() if x['id'] == uid), None)
            return await send(200, self.session(usr)) if usr else await send(400, {'error_code': 'refresh_token_not_found', 'msg': 'Invalid Refresh Token'})
        if path == '/auth/v1/signup':
            e = body.get('email')
            if len(body.get('password', '')) < 6: return await send(422, {'code': 422, 'error_code': 'weak_password', 'msg': 'Password should be at least 6 characters'})
            if e in self.users:
                usr = self.users[e]; o = self.user_obj(usr); o['identities'] = []
                return await send(200, o)
            usr = {'id': str(uuid.uuid4()), 'email': e, 'password': body.get('password'), 'confirmed': not self.confirm_required}
            self.users[e] = usr
            return await send(200, self.user_obj(usr) if self.confirm_required else self.session(usr))
        if path == '/auth/v1/otp': return await send(200, {})
        if path == '/auth/v1/recover': return await send(200, {})
        if path == '/auth/v1/logout': return await send(204)
        if path == '/auth/v1/user':
            uid = self.uid_from(req); usr = next((x for x in self.users.values() if x['id'] == uid), None)
            return await send(200, self.user_obj(usr)) if usr else await send(401, {'msg': 'invalid'})
        if path == '/rest/v1/user_state':
            uid = self.uid_from(req)
            if not uid: return await send(401, {'message': 'JWT required'})
            def flt(k):
                v = q.get(k, [None])[0]; return v[3:] if v and v.startswith('eq.') else None
            if m == 'GET':
                r = self.rows.get(uid)
                if flt('user_id') != uid or not r: return await send(200, [])
                return await send(200, [r])
            if m == 'POST':
                if body.get('user_id') != uid: return await send(403, {'code': '42501', 'message': 'new row violates row-level security policy for table "user_state"'})
                if uid in self.rows: return await send(409, {'code': '23505', 'message': 'duplicate key value violates unique constraint "user_state_pkey"'})
                r = {'user_id': uid, 'data': body['data'], 'rev': 1, 'updated_at': body.get('updated_at'), 'device': body.get('device')}
                self.rows[uid] = r; return await send(201, [{'rev': 1, 'updated_at': r['updated_at']}])
            if m == 'PATCH':
                r = self.rows.get(uid); rev = flt('rev')
                if flt('user_id') != uid or not r or (rev is not None and str(r['rev']) != rev): return await send(200, [])
                r.update({'data': body['data'], 'updated_at': body.get('updated_at'), 'device': body.get('device'), 'rev': r['rev'] + 1})
                return await send(200, [{'rev': r['rev'], 'updated_at': r['updated_at']}])
        return await send(404, {'message': 'not mocked: ' + path})

async def new_page(b, mock, **kw):
    kw.setdefault('locale', 'zh-CN')
    ctx = await b.new_context(service_workers='block', **kw)
    p = await ctx.new_page(); errs = []
    def on_console(msg):
        t = msg.text
        if msg.type in ('error', 'warning') and 'Service Worker registration blocked' not in t and 'Failed to load resource' not in t: errs.append(t)
    p.on('console', on_console); p.on('pageerror', lambda e: errs.append(str(e)))
    await ctx.route('**/config.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE_CFG))
    await ctx.route(SB + '/**', mock.handle)
    return ctx, p, errs

async def wait_status(p, want, timeout=8000):
    try:
        await p.wait_for_function('s => window.GPCloud && GPCloud.status() === s', arg=want, timeout=timeout); return True
    except Exception: return False

async def main():
    mock = Mock()
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx, p, errs = await new_page(b, mock, viewport={'width': 1280, 'height': 900})
        await p.goto(BASE); await p.wait_for_timeout(800)
        ok('landing shown first (configured, logged out)', await p.locator('#landing').is_visible() and await p.evaluate('GPCloud.view()') == 'landing')
        await p.click('#landingCta'); await p.wait_for_timeout(200)
        ok('gate shown (configured)', await p.locator('#gate').is_visible() and await p.locator('#authView').is_visible() and not await p.locator('#authNotice').is_visible())
        ok('vendored supabase-js loaded', await p.evaluate('typeof window.supabase?.createClient') == 'function')
        # 表单校验
        await p.click('#authSubmit'); await p.wait_for_timeout(200)
        ok('empty email → 中文提示', (await p.locator('#authEmailErr').inner_text()) == '请填写邮箱。')
        await p.fill('#authEmail', 'bad@'); await p.click('#authSubmit')
        ok('bad email → 邮箱格式不正确', '格式' in await p.locator('#authEmailErr').inner_text())
        await p.fill('#authEmail', 'a@test.dev'); await p.fill('#authPass', '123'); await p.click('#authSubmit')
        ok('short pw → 至少 6 位', '6' in await p.locator('#authPassErr').inner_text())
        await p.fill('#authPass', 'wrongpass'); await p.click('#authSubmit'); await p.wait_for_timeout(600)
        ok('wrong creds → 邮箱或密码不正确', '邮箱或密码不正确' in await p.locator('#authMsg').inner_text(), await p.locator('#authMsg').inner_text())
        # 注册（需邮件确认）
        mock.confirm_required = True
        await p.click('#tabUp'); await p.wait_for_timeout(100)
        ok('tab 注册 selected', await p.get_attribute('#tabUp', 'aria-selected') == 'true' and (await p.locator('#authSubmit .btn__label').inner_text()) == '注册并登录')
        ok('signup uses new-password autocomplete', await p.get_attribute('#authPass', 'autocomplete') == 'new-password')
        await p.fill('#authEmail', 'confirm@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit'); await p.wait_for_timeout(700)
        ok('signup w/ confirm → 已寄出面板', await p.locator('#authSent').is_visible() and '确认邮件' in await p.locator('#sentTitle').inner_text())
        await p.click('#sentBack')
        await p.click('#tabIn'); await p.fill('#authEmail', 'confirm@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit'); await p.wait_for_timeout(600)
        ok('unconfirmed login → 邮箱尚未验证', '尚未验证' in await p.locator('#authMsg').inner_text())
        # magic link
        await p.click('#magicBtn'); await p.wait_for_timeout(600)
        ok('magic link → 登录链接已寄出', await p.locator('#authSent').is_visible() and '登录链接' in await p.locator('#sentTitle').inner_text())
        ok('resend has cooldown', await p.locator('#sentResend').is_disabled())
        await p.click('#sentBack')
        # 先本机使用，产生本机数据
        await p.click('#gateLocal'); await p.wait_for_timeout(300)
        seal = p.locator('#habitList .seal').first; hid = await p.locator('#habitList .habit').first.get_attribute('data-id')
        await seal.click(); await p.wait_for_timeout(200)
        ok('local edit marks meta dirty', await p.evaluate("JSON.parse(localStorage.getItem('growth-plan:meta')).dirty === true"))
        # 注册（无需确认）→ 云端为空 → 上传本机
        mock.confirm_required = False
        await p.click('#syncPill'); await p.wait_for_timeout(300)
        await p.click('#tabUp'); await p.fill('#authEmail', 'li@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        ok('signup → synced', await wait_status(p, 'synced'))
        ok('gate closed after login', not await p.locator('#gate').is_visible())
        uid = mock.users['li@test.dev']['id']; row = mock.rows.get(uid)
        ok('cloud empty → local uploaded', row and len(row['data']['habits']) == 7 and hid in row['data']['log'].get(next(iter(sorted(row['data']['log'], reverse=True))), []))
        ok('pill shows 已同步 + email', (await p.locator('#syncText').inner_text()) == '已同步' and (await p.locator('#syncWho').inner_text()) == 'li@test.dev')
        ok('data lede mentions login', 'li@test.dev' in await p.locator('#dataLede').inner_text())
        # 去抖保存
        rev0 = row['rev']
        await p.click('[data-action="add-goal"]'); await p.fill('#gTitle', '云端目标 A'); await p.click('#formGoal button[type=submit]')
        await p.wait_for_timeout(300)
        ok('status 同步中 during debounce', await p.evaluate('GPCloud.status()') == 'syncing')
        ok('debounced push → synced', await wait_status(p, 'synced'))
        row = mock.rows[uid]
        ok('cloud has new goal & rev bumped', any(g['title'] == '云端目标 A' for g in row['data']['goals']) and row['rev'] == rev0 + 1, row['rev'])
        # 快速多次修改只推一次
        n0 = len([c for c in mock.calls if c[0] == 'PATCH'])
        for i in range(4): await p.locator('#habitList .seal').nth(1).click(); await p.wait_for_timeout(80)
        await wait_status(p, 'synced'); await p.wait_for_timeout(300)
        n1 = len([c for c in mock.calls if c[0] == 'PATCH'])
        ok('4 rapid edits → 1 PATCH (debounced)', n1 - n0 == 1, n1 - n0)
        # 离线 → 本地照写 → 恢复后补传
        await ctx.set_offline(True); await p.wait_for_timeout(200)
        ok('offline → 离线', await wait_status(p, 'offline', 3000))
        ok('pill text 离线', (await p.locator('#syncText').inner_text()) == '离线')
        await p.click('[data-action="add-goal"]'); await p.fill('#gTitle', '离线目标 B'); await p.click('#formGoal button[type=submit]'); await p.wait_for_timeout(1600)
        ok('offline edit saved locally', '离线目标 B' in await p.evaluate("localStorage.getItem('growth-plan:v1')"))
        ok('offline edit not pushed yet', not any(g['title'] == '离线目标 B' for g in mock.rows[uid]['data']['goals']))
        await ctx.set_offline(False)
        ok('reconnect → synced', await wait_status(p, 'synced'))
        ok('offline edit pushed on reconnect', any(g['title'] == '离线目标 B' for g in mock.rows[uid]['data']['goals']))
        # 账号面板
        await p.click('#syncPill'); await p.wait_for_timeout(300)
        ok('account dialog shows email', (await p.locator('#acctEmail').inner_text()) == 'li@test.dev' and await p.locator('#dlgAccount').is_visible())
        await p.screenshot(path='/workspace/growth-plan-app/shots/account-desktop-light.png')
        await p.keyboard.press('Escape')

        # 第二台设备：全新浏览器 → 登录 → 载入云端
        ctx2, p2, errs2 = await new_page(b, mock, viewport={'width': 390, 'height': 844}, color_scheme='dark', device_scale_factor=2)
        await p2.goto(BASE); await p2.wait_for_timeout(600)
        ok('device 2: landing first', await p2.locator('#landing').is_visible())
        await p2.click('#landingCta'); await p2.wait_for_timeout(200)
        await p2.fill('#authEmail', 'li@test.dev'); await p2.fill('#authPass', 'secret123'); await p2.click('#authSubmit')
        ok('device 2 login → synced', await wait_status(p2, 'synced'))
        ok('device 2 got cloud data', await p2.locator('.goal', has_text='离线目标 B').count() == 1)
        await p2.screenshot(path='/workspace/growth-plan-app/shots/app-mobile-dark-synced.png')
        # 设备 2 改动（大改：删习惯）
        await p2.locator('#today').scroll_into_view_if_needed()
        _hid = await p2.locator('#habitList .habit').first.get_attribute('data-id'); await p2.locator(f'#mgrList .mgr__row[data-id="{_hid}"] [data-act="mgr-edit"]').click(); await p2.click('#hDelete'); await p2.click('#dlgConfirmOk')
        ok('device 2 push', await wait_status(p2, 'synced'))
        for _ in range(40):   # 推送是去抖的：轮询最多 4 秒，避免偶发的时序抖动
            if len(mock.rows[uid]['data']['habits']) == 6: break
            await p2.wait_for_timeout(100)
        ok('cloud now 6 habits', len(mock.rows[uid]['data']['habits']) == 6)
        # 设备 1 在旧 rev 上修改 → 冲突（习惯数不同 → 明显冲突 → 弹窗）
        await p.click('[data-action="add-goal"]'); await p.fill('#gTitle', '设备一的新目标'); await p.click('#formGoal button[type=submit]')
        await p.wait_for_selector('#dlgSync[open]', timeout=8000)
        ok('notable conflict → prompt', await p.locator('#dlgSync').is_visible())
        ok('prompt recommends newer (本机)', 'local' == await p.locator('.pick__opt.is-rec').get_attribute('value'))
        ok('prompt shows both summaries', await p.locator('.pick__sum').count() == 2)
        await p.screenshot(path='/workspace/growth-plan-app/shots/conflict-desktop-light.png')
        await p.locator('.pick__opt[value="cloud"]').click()
        ok('chose cloud → synced', await wait_status(p, 'synced'))
        ok('device 1 now has cloud data (6 habits)', await p.evaluate('GP.get().habits.length') == 6 and await p.locator('.goal', has_text='设备一的新目标').count() == 0)
        # 小冲突（同样数量，仅座右铭不同）→ 自动取较新 + toast
        r = mock.rows[uid]; r['data'] = json.loads(json.dumps(r['data'])); r['data']['motto'] = '云端旧座右铭'; r['rev'] += 1; r['updated_at'] = '2026-01-01T00:00:00.000Z'
        await p.click('#editMotto'); await p.fill('#mText', '本机新座右铭'); await p.click('#formMotto button[value=ok]')
        ok('minor conflict auto-resolves', await wait_status(p, 'synced'))
        ok('minor conflict kept newer local', mock.rows[uid]['data']['motto'] == '本机新座右铭' and not await p.locator('#dlgSync').is_visible())
        ok('minor conflict toast w/ 改用另一份', await p.locator('.toast', has_text='较新的本机版本').count() >= 1)
        # 设备 2 回到前台 → 拉取最新
        await p2.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await p2.wait_for_timeout(200)
        await p2.evaluate('GPCloud.syncNow()'); await wait_status(p2, 'synced')
        ok('device 2 pulls latest', (await p2.locator('#motto').inner_text()) == '本机新座右铭')
        # 刷新后会话保持
        await p.reload(); await p.wait_for_timeout(300)
        ok('session persists after reload', await wait_status(p, 'synced') and not await p.locator('#gate').is_visible())
        ok('logged-in reload skips landing', not await p.locator('#landing').is_visible() and await p.evaluate('GPCloud.view()') is None)
        # 退出
        await p.click('#syncPill'); await p.click('#acctSignOut'); await p.wait_for_timeout(200)
        ok('sign-out dialog', await p.locator('#dlgSignOut').is_visible())
        await p.click('#dlgSignOut button[value=keep]'); await p.wait_for_timeout(800)
        ok('signed out → gate + local', await p.locator('#gate').is_visible() and await p.evaluate('GPCloud.status()') == 'local')
        ok('signed out → landing first', await p.locator('#landing').is_visible())
        await p.click('#landingCta'); await p.wait_for_timeout(200)
        ok('local copy kept', await p.evaluate('GP.get().habits.length') == 6)
        # 另一个账号在这台设备登录，云端为空 → 询问是否带入
        await p.click('#tabUp'); await p.fill('#authEmail', 'other@test.dev'); await p.fill('#authPass', 'secret123'); await p.click('#authSubmit')
        await p.wait_for_selector('#dlgSync[open]', timeout=8000)
        ok('foreign local data → ask', '另一个账号' in await p.locator('#dlgSyncText').inner_text())
        await p.locator('.pick__opt[value="blank"]').click()
        ok('blank start → synced', await wait_status(p, 'synced'))
        oid = mock.users['other@test.dev']['id']
        ok('other account starts blank', len(mock.rows[oid]['data']['habits']) == 0 and len(mock.rows[uid]['data']['habits']) == 6)
        await p.click('#syncPill'); await p.click('#acctSignOut'); await p.click('#dlgSignOut button[value=clear]'); await p.wait_for_timeout(800)
        ok('sign-out + clear wipes local', await p.evaluate("localStorage.getItem('growth-plan:meta')") is None and await p.evaluate('GP.get().goals.length') == 0)
        # 邮件链接（免密 / 确认）回到站点：会话在 URL hash 里 → 直接进入应用，不显示首页
        ctx3, p3, errs3 = await new_page(b, mock, viewport={'width': 390, 'height': 844})
        lu = mock.users['li@test.dev']; ss = mock.session(lu)
        h = f"#access_token={ss['access_token']}&expires_at={ss['expires_at']}&expires_in=3600&refresh_token={ss['refresh_token']}&token_type=bearer&type=magiclink"
        seen = []
        await p3.expose_function('seenView', lambda v: seen.append(v))
        await p3.add_init_script("setInterval(function(){ if (window.GPCloud) window.seenView(GPCloud.view()); }, 50)")
        await p3.goto(BASE + h)
        ok('magic link → straight into app (synced)', await wait_status(p3, 'synced'))
        await p3.wait_for_timeout(1700)
        ok('magic link: landing never shown', 'landing' not in seen and not await p3.locator('#gate').is_visible(), seen[:5])
        ok('magic link: token removed from URL', 'access_token' not in p3.url)
        ok('no console errors (magic link)', not errs3, errs3)
        await ctx3.close()
        ok('no console errors (device 1)', not errs, errs)
        ok('no console errors (device 2)', not errs2, errs2)
        await ctx.close(); await ctx2.close(); await b.close()
    print('\n%d/%d passed' % (sum(r for _, r in results), len(results)))
if __name__ == "__main__":
    asyncio.run(main())
