/* Ledger · 云同步（Supabase Auth + user_state 表）
 * - 离线优先：所有修改先写 localStorage（app.js），这里去抖后推送到云端
 * - 乐观锁：update ... where rev = 已知版本；版本不符说明别的设备写过 → 重新拉取并合并决策
 * - 没有 publishable key 时只提供本机模式
 */
(function () {
  'use strict';

  var SB_URL = String(window.SUPABASE_URL || '').trim();
  var SB_KEY = String(window.SUPABASE_KEY || '').trim();
  var CONFIGURED = /^https:\/\/[^/]+$/.test(SB_URL.replace(/\/$/, '')) && SB_KEY.length > 20 && !/PASTE_/.test(SB_KEY);
  var MODE_KEY = 'growth-plan:mode';        // 'local' | 'cloud'
  var META_KEY = 'growth-plan:meta';        // { updatedAt, dirty, uid, rev, syncedAt }
  var AUTH_KEY = 'growth-plan:auth';        // supabase-js 会话存储键
  var TABLE = 'user_state';
  var PUSH_DELAY = 1200;

  var sb = null, user = null, status = 'local', statusMsg = '';
  var pushTimer = 0, retryTimer = 0, retryDelay = 2000;
  var inflight = false, again = false, changeSeq = 0, reconciling = false, syncedUid = null;
  var readyResolve, sbReady = new Promise(function (r) { readyResolve = r; });
  var lastErrKind = '';

  function $(s, r) { return (r || document).querySelector(s); }
  var t = window.I18N.t;
  function now() { return new Date().toISOString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, s, a) { if (window.GP) GP.toast(m, s, a); }
  function getMode() { try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; } }
  function setMode(m) { try { if (m) localStorage.setItem(MODE_KEY, m); else localStorage.removeItem(MODE_KEY); } catch (e) {} }
  function meta() { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } }
  function setMeta(patch) {
    var m = meta(); Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete m[k]; else m[k] = patch[k]; });
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
    return m;
  }
  /* 稳定序列化：jsonb 不保留对象键顺序，比较前先排序 */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function sameData(a, b) { try { return canon(GP.validate(a)) === canon(GP.validate(b)); } catch (e) { return false; } }
  function meaningful(o) { return !!o && ((o.habits && o.habits.length) || (o.goals && o.goals.length) || (o.log && Object.keys(o.log).length)); }
  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d)) return '—';
    var diff = (Date.now() - d) / 1000;
    if (diff < 45) return t('刚刚');
    if (diff < 3600) return t('{n} 分钟前', { n: Math.round(diff / 60) });
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var hm = p(d.getHours()) + ':' + p(d.getMinutes());
    var td = new Date(); td.setHours(0, 0, 0, 0);
    if (d >= td) return window.I18N.t('今天 {t}', { t: hm });
    if (d >= new Date(td - 86400000)) return window.I18N.t('昨天 {t}', { t: hm });
    return (d.getFullYear() !== td.getFullYear() ? d.getFullYear() + (window.I18N.lang === 'en' ? ', ' : '/') : '') + window.I18N.fmt.md(d) + ' ' + hm;
  }
  function device() {
    var ua = navigator.userAgent, os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : t('设备');
    var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : t('浏览器');
    return os + ' · ' + br;
  }
  function redirectUrl() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : undefined; }

  /* ---------- 中文错误信息 ---------- */
  function zhError(err) { var m = zhErrorRaw(err); return m.k ? t(m.k, m.v) : t(m); }
  function zhErrorRaw(err) {
    if (!err) return '出了点问题，请稍后再试。';
    var code = err.code || err.error_code || '', msg = String(err.message || err.msg || err.error_description || err), st = err.status;
    var map = {
      invalid_credentials: '邮箱或密码不正确。',
      email_not_confirmed: '邮箱尚未验证：请先点击确认邮件中的链接，再回来登录。',
      user_already_exists: '这个邮箱已经注册过了，请直接登录。',
      email_exists: '这个邮箱已经注册过了，请直接登录。',
      weak_password: '密码太弱：至少 6 位，建议混合字母与数字。',
      over_email_send_rate_limit: '邮件发送太频繁，请稍等一分钟再试。',
      over_request_rate_limit: '操作太频繁，请稍后再试。',
      signup_disabled: '当前暂未开放注册。',
      email_provider_disabled: '邮箱登录未启用，请在 Supabase 后台开启 Email 登录方式。',
      email_address_invalid: '邮箱地址无效，请检查拼写。',
      email_address_not_authorized: '该邮箱不允许接收邮件（Supabase 内置邮件服务只发给项目成员，请配置自定义 SMTP）。',
      otp_expired: '链接已失效或已被使用，请重新发送。',
      otp_disabled: '免密登录链接未启用。',
      same_password: '新密码不能与旧密码相同。',
      session_not_found: '登录状态已失效，请重新登录。',
      user_not_found: '找不到这个账号。',
      validation_failed: '输入格式不正确，请检查邮箱和密码。'
    };
    if (map[code]) return map[code];
    if (/Invalid login credentials/i.test(msg)) return map.invalid_credentials;
    if (/Email not confirmed/i.test(msg)) return map.email_not_confirmed;
    if (/already registered|already been registered/i.test(msg)) return map.user_already_exists;
    if (/Password should be at least|weak password/i.test(msg)) return '密码至少需要 6 位。';
    if (/rate limit|too many/i.test(msg) || st === 429) return map.over_request_rate_limit;
    if (/Signups not allowed/i.test(msg)) return map.signup_disabled;
    if (/invalid format|Unable to validate email/i.test(msg)) return '邮箱格式不正确。';
    if (/Invalid API key|No API key|apikey/i.test(msg) || st === 401 && /key/i.test(msg)) return 'Supabase key 无效：请检查 config.js 里的 Publishable key。';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg) || !navigator.onLine) return '网络连接失败，请检查网络后重试。';
    if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(msg)) return '云端还没有建表：请先在 Supabase SQL Editor 运行 schema.sql。';
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return '没有权限写入云端：请确认 schema.sql 中的 RLS 策略已创建。';
    if (/JWT|token/i.test(msg) && st === 401) return '登录状态已过期，请重新登录。';
    return { k: '出了点问题：{m}', v: { m: msg.slice(0, 80) } };
  }
  function errKind(err) {
    var msg = String((err && err.message) || err || '');
    if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed|timeout/i.test(msg)) return 'offline';
    if (err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table/i.test(msg))) return 'schema';
    if (err && (err.status === 401 || /JWT/i.test(msg))) return 'auth';
    return 'error';
  }

  /* ---------- 状态指示 ---------- */
  var pill = $('#syncPill');
  var LABEL_ZH = { local: '登录同步', synced: '已同步', syncing: '同步中', offline: '离线', error: '同步失败' };
  var LONG_ZH = {
    local: '本机模式：数据仅存于这台设备',
    synced: '已同步：本机与云端一致',
    syncing: '同步中…',
    offline: '离线：修改已保存在本机，联网后自动上传',
    error: '同步失败，稍后自动重试'
  };
  var LABEL = {}, LONG = {};
  function i18nLabels() { Object.keys(LABEL_ZH).forEach(function (k) { LABEL[k] = t(LABEL_ZH[k]); LONG[k] = t(LONG_ZH[k]); }); }
  i18nLabels();
  function setStatus(s, msg) {
    status = s; statusMsg = msg || '';
    paint();
  }
  function paint() {
    if (!pill) return;
    var s = user ? status : 'local';
    pill.dataset.state = s;
    $('#syncText').textContent = LABEL[s];
    var who = $('#syncWho');
    if (user) { who.hidden = false; who.textContent = user.email || ''; } else { who.hidden = true; }
    pill.setAttribute('aria-label', user ? t('同步状态：{s}，账号 {email}。打开账号面板', { s: LABEL[s], email: user.email || '' }) : t('本机模式，点击登录以开启云同步'));
    pill.title = user ? (LONG[s] + (statusMsg ? '\n' + statusMsg : '')) : LONG.local;
    var lede = $('#dataLede'), foot = $('#footerMeta');
    if (user) {
      lede.textContent = t('已登录 {email}。每次修改都会先存在本机，再自动同步到云端；导出备份依旧可用。', { email: user.email || '' });
      foot.textContent = t('离线可用 · 云端同步已开启');
    } else {
      lede.textContent = t('所有内容只保存在这台设备的浏览器里（localStorage）。定期导出，换设备时导入即可；也可以登录开启云同步。');
      foot.textContent = t('离线可用 · 数据仅存于本机');
    }
    if ($('#dlgAccount').open) paintAccount();
  }
  // 屏幕阅读器播报（仅重要变化）
  var live = document.createElement('p'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); document.body.appendChild(live);
  var lastSpoken = '';
  function announce(t) { if (t !== lastSpoken) { lastSpoken = t; live.textContent = t; } }

  /* ---------- 同步核心 ---------- */
  document.addEventListener('gp:change', function () {
    changeSeq++;
    setMeta({ updatedAt: now(), dirty: true });
    if (user) { setStatus(navigator.onLine ? 'syncing' : 'offline'); schedulePush(PUSH_DELAY); }
  });
  function schedulePush(ms) { clearTimeout(pushTimer); pushTimer = setTimeout(push, ms); }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(syncNow, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }
  function onSyncError(err) {
    var k = errKind(err);
    if (k === 'offline') { setStatus('offline'); announce(t('离线，修改已保存在本机')); return; }  // 等 online 事件
    var m = zhError(err);
    setStatus('error', m);
    if (k !== lastErrKind) { toast(m, '!'); lastErrKind = k; }
    console.warn('[sync]', err);
    scheduleRetry();
  }
  function markSynced(row, extra) {
    var p = { uid: user.id, rev: row.rev, syncedAt: now() };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    setMeta(p); syncedUid = user.id; retryDelay = 2000; lastErrKind = '';
    setStatus('synced'); announce(t('已同步'));
  }

  function push() {
    clearTimeout(pushTimer);
    if (!user || !sb || reconciling) return Promise.resolve();
    if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(); }
    if (inflight) { again = true; return Promise.resolve(); }
    var m = meta();
    if (m.uid !== user.id || syncedUid !== user.id) return pull();   // 先对齐云端再推
    inflight = true; setStatus('syncing');
    var seq = changeSeq, body = { data: GP.get(), updated_at: m.updatedAt || now(), device: device() };
    var q = m.rev
      ? sb.from(TABLE).update(body).eq('user_id', user.id).eq('rev', m.rev).select('rev,updated_at')
      : sb.from(TABLE).insert(Object.assign({ user_id: user.id }, body)).select('rev,updated_at');
    return q.then(function (res) {
      inflight = false;
      if (res.error) {
        if (res.error.code === '23505') return pull();     // 别的设备抢先建了行
        throw res.error;
      }
      if (!res.data || !res.data.length) return pull();    // rev 不符 → 云端有更新的版本
      markSynced(res.data[0], { dirty: seq !== changeSeq });
      if (seq !== changeSeq || again) { again = false; schedulePush(300); setStatus('syncing'); }
    }).catch(function (err) { inflight = false; onSyncError(err); });
  }

  function pull() {
    if (!user || !sb) return Promise.resolve();
    if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(); }
    if (reconciling) return Promise.resolve();
    setStatus('syncing');
    var uid = user.id;
    return sb.from(TABLE).select('data,rev,updated_at,device').eq('user_id', uid).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      if (!user || user.id !== uid) return;
      return reconcile(res.data);
    }).catch(onSyncError);
  }

  function syncNow() {
    if (!user) return Promise.resolve();
    var m = meta();
    if (m.dirty && m.uid === user.id && syncedUid === user.id) return push();
    return pull();
  }

  function applyCloud(row) {
    try { GP.replace(row.data); }
    catch (e) { setStatus('error', t('云端数据格式异常')); toast(t('云端数据格式异常，已保留本机数据'), '!'); return; }
    changeSeq++;   // 使进行中的 push 结果失效
    markSynced(row, { dirty: false, updatedAt: row.updated_at });
  }
  /* 把某份数据作为「本机的新修改」采用并推送 */
  function adopt(data) {
    try { GP.replace(data); } catch (e) { return; }
    changeSeq++; setMeta({ updatedAt: now(), dirty: true });
    if (user) { setStatus('syncing'); schedulePush(200); }
  }
  function uploadLocal(row) {
    // row 存在时以它的 rev 为基准覆盖；不存在时插入
    syncedUid = user.id;
    setMeta({ uid: user.id, rev: row ? row.rev : undefined, dirty: true, updatedAt: meta().updatedAt || now() });
    return push();
  }

  function reconcile(row) {
    var m = meta(), local = GP.get();
    var touched = !!m.updatedAt;                       // 用户在本机改过（未改过 = 首次打开的示例数据）
    var localHas = touched && meaningful(local);
    var foreign = !!m.uid && m.uid !== user.id;         // 本机数据属于另一个账号

    if (!row) {                                          // 云端为空
      if (foreign && localHas) {
        return ask({ kind: 'foreign', local: local, localAt: m.updatedAt }).then(function (c) {
          if (c === 'blank') { GP.reset(); setMeta({ updatedAt: now() }); }
          return uploadLocal(null);
        });
      }
      if (localHas) toast(t('已把本机数据上传到云端'), '传');
      return uploadLocal(null);
    }
    var cloudHas = meaningful(row.data);
    if (sameData(row.data, local)) { markSynced(row, { dirty: false, updatedAt: row.updated_at }); return; }
    if (!localHas) { applyCloud(row); if (cloudHas) toast(t('已载入云端数据'), '云'); return; }
    if (!cloudHas) { return uploadLocal(row); }
    if (!foreign && m.uid === user.id) {
      if (!m.dirty) { applyCloud(row); return; }               // 只有云端变了
      if (m.rev === row.rev) { return uploadLocal(row); }       // 只有本机变了
    }
    // 两边都有内容且都变过
    var localNewer = Date.parse(m.updatedAt || 0) > Date.parse(row.updated_at || 0);
    var a = GP.summary(local), b = GP.summary(row.data);
    var notable = foreign || !m.uid || a.habits !== b.habits || a.goals !== b.goals || Math.abs(a.checks - b.checks) > 2;
    if (!notable) {
      // 差异很小：直接采用较新的一份，并给一个「改用另一份」的后悔药
      var other = JSON.parse(JSON.stringify(localNewer ? row.data : local));
      var done = localNewer ? uploadLocal(row) : (applyCloud(row), Promise.resolve());
      toast(t(localNewer ? '两端都有修改，已保留较新的本机版本' : '两端都有修改，已采用较新的云端版本'), '合', {
        label: t('改用另一份'), fn: function () { adopt(other); }
      });
      return done;
    }
    return ask({ kind: 'conflict', local: local, localAt: m.updatedAt, cloud: row.data, cloudAt: row.updated_at, device: row.device, localNewer: localNewer, foreign: foreign })
      .then(function (c) { return c === 'cloud' ? applyCloud(row) : uploadLocal(row); });
  }

  /* ---------- 冲突选择对话框 ---------- */
  function ask(o) {
    reconciling = true;
    return new Promise(function (resolve) {
      var d = $('#dlgSync'), pick = $('#syncPick');
      function card(val, k, title, sum, at, extra, rec) {
        return '<button class="pick__opt' + (rec ? ' is-rec' : '') + '" type="submit" value="' + val + '"' + '>' +
          '<span class="pick__k">' + k + (rec ? '<span class="pick__badge">' + t('较新 · 推荐') + '</span>' : '') + '</span>' +
          '<span class="pick__t">' + esc(title) + '</span>' +
          (sum ? '<span class="pick__sum">' + sumHtml(sum) + '</span>' : '') +
          '<span class="pick__at">' + esc(at) + '</span>' + (extra ? '<span class="pick__dev">' + esc(extra) + '</span>' : '') + '</button>';
      }
      if (o.kind === 'foreign') {
        $('#dlgSyncTitle').textContent = t('带入本机数据吗？');
        $('#dlgSyncText').textContent = t('这台设备上的数据来自另一个账号。你的云端还是空的，要把它们带进当前账号，还是从空白开始？');
        pick.innerHTML = card('local', t('本机'), t('带入本机数据'), GP.summary(o.local), t('修改于 {t}', { t: fmtTime(o.localAt) }), '', true) +
          card('blank', t('空白'), t('从空白开始'), null, t('保留默认领域，其余清空'), '', false);
      } else {
        $('#dlgSyncTitle').textContent = t('本机与云端不一致');
        $('#dlgSyncText').textContent = t(o.foreign ? '这台设备上的数据来自另一个账号，' : !meta().uid ? '本机有未登录时记下的内容，' : '本机和云端都有修改，') + t('请选择保留哪一份，另一份会被替换。');
        pick.innerHTML = card('local', t('本机'), t('保留本机版本'), GP.summary(o.local), t('修改于 {t}', { t: fmtTime(o.localAt) }), device(), o.localNewer) +
          card('cloud', t('云端'), t('使用云端版本'), GP.summary(o.cloud), t('修改于 {t}', { t: fmtTime(o.cloudAt) }), o.device ? t('来自 {d}', { d: o.device }) : '', !o.localNewer);
      }
      d.returnValue = '';
      function onCancel(e) { e.preventDefault(); }
      d.addEventListener('cancel', onCancel);
      d.addEventListener('close', function h() {
        d.removeEventListener('close', h); d.removeEventListener('cancel', onCancel);
        reconciling = false;
        var v = d.returnValue || (o.kind === 'foreign' ? 'local' : (o.localNewer ? 'local' : 'cloud'));
        resolve(v);
      });
      if (!d.open) d.showModal();
      var rec = $('.pick__opt.is-rec', pick); if (rec) rec.focus();
    });
  }
  function sumHtml(sum) {
    return '<span class="nw">' + esc(t('{h} 个习惯', { h: sum.habits })) + '</span> · <span class="nw">' + esc(t('{g} 个目标', { g: sum.goals })) + '</span> · <span class="nw">' + esc(t('{c} 次打卡', { c: sum.checks })) + '</span>';
  }
  $('#syncExport').addEventListener('click', function () { var b = document.getElementById('exportBtn'); if (b) b.click(); });

  /* ---------- 网络 & 可见性 ---------- */
  addEventListener('online', function () { if (user) { retryDelay = 2000; announce(t('网络已恢复，正在同步')); syncNow(); } });
  addEventListener('offline', function () { if (user) { setStatus('offline'); announce(t('离线，修改会保存在本机')); } });
  var lastFocusSync = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (user && meta().dirty) push(); return; }
    if (user && Date.now() - lastFocusSync > 20000) { lastFocusSync = Date.now(); syncNow(); }
  });
  addEventListener('pagehide', function () { if (user && meta().dirty && navigator.onLine) push(); });

  /* =====================================================================
   *  登录界面
   * ===================================================================== */
  var gate = $('#gate'), form = $('#authForm'), tab = 'in', busy = false, firstRun = false;
  var emailIn = $('#authEmail'), passIn = $('#authPass'), msgEl = $('#authMsg');
  var gateView = 'auth', ignorePop = false;
  var NATIVE = !!(window.Capacitor || /LedgerAndroid/.test(navigator.userAgent));
  if (NATIVE) $('#landingApk').hidden = true;          // 已在安卓 App 内，不再提示下载

  /* 首页（landing）与登录页共用一个全屏 dialog，用 data-view 切换 */
  function setGateView(v) {
    gateView = v; gate.dataset.view = v;
    $('#landing').hidden = v !== 'landing';
    $('.gate__inner', gate).hidden = v !== 'auth';
    gate.setAttribute('aria-labelledby', v === 'landing' ? 'landingTitle' : 'gateTitle');
    gate.setAttribute('aria-describedby', v === 'landing' ? 'landingLede' : 'gateLede');
    $('#gateBack').hidden = !(v === 'auth' && firstRun);
    gate.scrollTop = 0;
  }
  function fine() { return matchMedia('(pointer: fine)').matches; }
  function toAuth() {
    if (gateView === 'auth') return;
    setGateView('auth');
    try { if (!(history.state && history.state.gpGate === 'auth')) history.pushState({ gpGate: 'auth' }, ''); } catch (e) {}
    (fine() && CONFIGURED ? emailIn : $('#tabIn').disabled ? $('#gateBack') : $('#tabIn')).focus();
  }
  function toLanding(fromPop) {
    if (!gate.open || gateView !== 'auth' || !firstRun) return;
    if (busy) return;
    showView('auth'); clearErrors();
    setGateView('landing');
    $('#landingCta').focus();
    if (!fromPop) popAuthEntry();
  }
  function popAuthEntry() {
    try { if (history.state && history.state.gpGate === 'auth') { ignorePop = true; history.back(); } } catch (e) {}
  }
  $('#landingCta').addEventListener('click', toAuth);
  $('#gateBack').addEventListener('click', function () { toLanding(false); });
  addEventListener('popstate', function () {
    if (ignorePop) { ignorePop = false; return; }
    if (gate.open && gateView === 'auth' && firstRun) toLanding(true);          // 浏览器 / 安卓返回键：回到首页
    else if (gate.open && gateView === 'landing' && history.state && history.state.gpGate === 'auth') toAuth();
  });

  function openGate(isFirst, view) {
    firstRun = !!isFirst;
    $('#gateClose').hidden = firstRun;
    showView('auth');
    setGateView(view || (firstRun ? 'landing' : 'auth'));
    if (!CONFIGURED) {
      $('#authNotice').hidden = false;
      Array.prototype.forEach.call(form.querySelectorAll('input, button'), function (el) { el.disabled = true; });
      $$tabs().forEach(function (b) { b.disabled = true; });
    }
    if (!gate.open) gate.showModal();
    document.documentElement.classList.add('gate-open');
    if (gateView === 'auth' && fine()) setTimeout(function () { (CONFIGURED ? emailIn : $('#gateLocal')).focus(); }, 30);
  }
  function closeGate() { if (gate.open) gate.close(); }
  gate.addEventListener('close', function () {
    document.documentElement.classList.remove('gate-open');
    popAuthEntry();
    if (!user && !getMode()) setMode('local');
  });
  gate.addEventListener('cancel', function (e) { if (firstRun) { e.preventDefault(); if (gateView === 'auth') toLanding(false); } });
  $('#gateClose').addEventListener('click', closeGate);
  $('#gateLocal').addEventListener('click', function () {
    setMode('local'); closeGate();
    if (firstRun && !(window.GP && GP.willOnboard && GP.willOnboard())) toast(t('本机模式：数据只存在这台设备上'), '本');
  });

  function $$tabs() { return [$('#tabIn'), $('#tabUp')]; }
  function setTab(t, focus) {
    tab = t;
    $$tabs().forEach(function (b) { var on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    $('#authPanel').setAttribute('aria-labelledby', t === 'in' ? 'tabIn' : 'tabUp');
    form.closest('.auth-view').dataset.tab = t;
    passIn.autocomplete = t === 'in' ? 'current-password' : 'new-password';
    $('#authPassHint').hidden = t === 'in';
    $('#forgotBtn').hidden = t !== 'in';
    $('.btn__label', form).textContent = window.I18N.t(t === 'in' ? '登录' : '注册并登录');
    clearErrors();
  }
  $$tabs().forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') { e.preventDefault(); setTab(tab === 'in' ? 'up' : 'in', true); }
    });
  });
  $('#pwToggle').addEventListener('click', function () {
    var show = passIn.type === 'password'; passIn.type = show ? 'text' : 'password';
    this.setAttribute('aria-pressed', String(show)); this.setAttribute('aria-label', t(show ? '隐藏密码' : '显示密码'));
  });

  function clearErrors() {
    msgEl.textContent = ''; msgEl.className = 'auth__msg';
    [['authEmail', 'authEmailErr'], ['authPass', 'authPassErr']].forEach(function (p) { $('#' + p[0]).removeAttribute('aria-invalid'); $('#' + p[1]).textContent = ''; });
  }
  function fieldErr(input, errId, text) { input.setAttribute('aria-invalid', 'true'); $('#' + errId).textContent = text; }
  function say(text, kind) { msgEl.textContent = text; msgEl.className = 'auth__msg' + (kind ? ' is-' + kind : ''); }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function checkEmail() {
    var v = emailIn.value.trim();
    if (!v) { fieldErr(emailIn, 'authEmailErr', t('请填写邮箱。')); emailIn.focus(); return null; }
    if (!validEmail(v)) { fieldErr(emailIn, 'authEmailErr', t('邮箱格式不正确。')); emailIn.focus(); return null; }
    return v;
  }
  function setBusy(on, btn) {
    busy = on; (btn || $('#authSubmit')).classList.toggle('is-busy', on);
    $('#authSubmit').disabled = on; $('#magicBtn').disabled = on; $('#forgotBtn').disabled = on;
    form.setAttribute('aria-busy', String(on));
  }
  function ensureSb() {
    if (!CONFIGURED) return Promise.reject({ message: t('云同步尚未配置：config.js 中缺少 Publishable key。') });
    return sbReady;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault(); if (busy) return;
    clearErrors();
    var email = checkEmail(); if (!email) return;
    var pw = passIn.value;
    if (!pw) { fieldErr(passIn, 'authPassErr', t('请填写密码。')); passIn.focus(); return; }
    if (pw.length < 6) { fieldErr(passIn, 'authPassErr', t('密码至少需要 6 位。')); passIn.focus(); return; }
    setBusy(true);
    ensureSb().then(function () {
      return tab === 'in'
        ? sb.auth.signInWithPassword({ email: email, password: pw })
        : sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: redirectUrl() } });
    }).then(function (r) {
      setBusy(false);
      if (r.error) {
        say(zhError(r.error), 'err');
        if (r.error.code === 'email_not_confirmed' || /not confirmed/i.test(r.error.message)) offerResendConfirm(email);
        return;
      }
      if (tab === 'up') {
        var u = r.data && r.data.user;
        if (u && Array.isArray(u.identities) && u.identities.length === 0) { say(t('这个邮箱已经注册过了，请直接登录。'), 'err'); setTab('in'); emailIn.value = email; passIn.focus(); return; }
        if (!r.data.session) { showSent('signup', email); return; }
      }
      passIn.value = '';
      // 成功：onAuthStateChange 会接手
    }).catch(function (err) { setBusy(false); say(zhError(err), 'err'); });
  });

  function offerResendConfirm(email) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'link-btn'; b.textContent = t('重新发送确认邮件');
    b.addEventListener('click', function () {
      sb.auth.resend({ type: 'signup', email: email, options: { emailRedirectTo: redirectUrl() } }).then(function (r) {
        if (r.error) say(zhError(r.error), 'err'); else showSent('signup', email);
      });
    });
    msgEl.appendChild(document.createTextNode(' ')); msgEl.appendChild(b);
  }

  $('#magicBtn').addEventListener('click', function () {
    if (busy) return; clearErrors();
    var email = checkEmail(); if (!email) return;
    setBusy(true, this);
    ensureSb().then(function () {
      return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true } });
    }).then(function (r) {
      setBusy(false, $('#magicBtn'));
      if (r.error) { say(zhError(r.error), 'err'); return; }
      showSent('magic', email);
    }).catch(function (err) { setBusy(false, $('#magicBtn')); say(zhError(err), 'err'); });
  });
  $('#forgotBtn').addEventListener('click', function () {
    if (busy) return; clearErrors();
    var email = checkEmail(); if (!email) { say(t('先填写注册时用的邮箱，再点「忘记密码」。')); return; }
    setBusy(true, this);
    ensureSb().then(function () { return sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }); })
      .then(function (r) { setBusy(false, $('#forgotBtn')); if (r.error) { say(zhError(r.error), 'err'); return; } showSent('reset', email); })
      .catch(function (err) { setBusy(false, $('#forgotBtn')); say(zhError(err), 'err'); });
  });

  var sentKind = '', sentEmail = '', cooldown = 0, coolTimer = 0;
  function showView(v) {
    $('#authView').hidden = v !== 'auth';
    $('#authSent').hidden = v !== 'sent';
  }
  function showSent(kind, email) {
    sentKind = kind; sentEmail = email;
    paintSent();
    showView('sent');
    var s = $('#authSent'); s.classList.remove('is-in'); void s.offsetWidth; s.classList.add('is-in'); s.focus();
    startCooldown();
  }
  function paintSent() {
    if (!sentKind) return;
    var b = '<b>' + esc(sentEmail) + '</b>';
    var x = {
      signup: ['确认邮件已寄出', '我们向 {email} 发送了一封确认邮件。点击邮件里的链接完成验证，就会自动登录。'],
      magic: ['登录链接已寄出', '打开 {email} 收到的邮件，点击其中的链接即可登录，无需密码。'],
      reset: ['重置链接已寄出', '点击 {email} 收到的邮件中的链接，回到这里设置新密码。']
    }[sentKind];
    $('#sentTitle').textContent = t(x[0]);
    $('#sentText').innerHTML = esc(t(x[1], { email: '\u0000' })).replace('\u0000', b) + '<br><small>' + esc(t('没收到？看看垃圾邮件箱；同一邮箱每分钟只能发送一次。')) + '</small>';
  }
  function resendLabel() { var b = $('#sentResend'); b.textContent = cooldown > 0 ? t('重新发送（{n}s）', { n: cooldown }) : t('重新发送'); b.disabled = cooldown > 0; }
  function startCooldown() {
    cooldown = 60; var b = $('#sentResend'); b.disabled = true;
    clearInterval(coolTimer);
    resendLabel();
    coolTimer = setInterval(function () { cooldown--; resendLabel(); if (cooldown <= 0) clearInterval(coolTimer); }, 1000);
  }
  $('#sentBack').addEventListener('click', function () { showView('auth'); (sentKind === 'reset' || sentKind === 'magic' ? emailIn : passIn).focus(); });
  $('#sentResend').addEventListener('click', function () {
    var p = sentKind === 'signup' ? sb.auth.resend({ type: 'signup', email: sentEmail, options: { emailRedirectTo: redirectUrl() } })
      : sentKind === 'magic' ? sb.auth.signInWithOtp({ email: sentEmail, options: { emailRedirectTo: redirectUrl() } })
      : sb.auth.resetPasswordForEmail(sentEmail, { redirectTo: redirectUrl() });
    p.then(function (r) { if (r.error) toast(zhError(r.error), '!'); else { toast(t('已重新发送'), '寄'); startCooldown(); } });
  });

  /* ---------- 账号面板 ---------- */
  pill.addEventListener('click', function () { if (user) openAccount(); else openGate(false); });
  function openAccount() { paintAccount(); $('#dlgAccount').showModal(); }
  function paintAccount() {
    if (!user) return;
    var m = meta(), s = status;
    $('#acctEmail').textContent = user.email || '—';
    $('#acctSeal').textContent = (user.email || 'L').charAt(0).toUpperCase();
    $('#acctDot').dataset.state = s;
    $('#acctStatus').textContent = LONG[s] + (statusMsg && s === 'error' ? (window.I18N.lang === 'en' ? ' (' + statusMsg + ')' : '（' + statusMsg + '）') : '');
    $('#acctLast').textContent = fmtTime(m.syncedAt);
    var sum = GP.summary();
    $('#acctLocal').innerHTML = sumHtml(sum);
    $('#acctSync').disabled = !navigator.onLine;
  }
  $('#acctSync').addEventListener('click', function () {
    var b = this; b.disabled = true;
    syncedUid = null;      // 强制先拉取对齐，再决定推送
    pull().then(function () { b.disabled = false; paintAccount(); if (status === 'synced') toast(t('已同步'), '同'); });
  });
  $('#acctSignOut').addEventListener('click', function () {
    $('#dlgAccount').close();
    var d = $('#dlgSignOut'), m = meta();
    $('#dlgSignOutText').textContent = t(m.dirty ? '还有修改尚未上传到云端，退出后它们只保留在本机。' : '数据已同步到云端。') + t('本机会保留一份副本，方便离线查看；如果这是公共设备，建议一并清除。');
    d.returnValue = ''; d.showModal();
    d.addEventListener('close', function h() {
      d.removeEventListener('close', h);
      var v = d.returnValue; if (v !== 'keep' && v !== 'clear') return;
      var flush = m.dirty && navigator.onLine ? Promise.race([push(), new Promise(function (r) { setTimeout(r, 4000); })]) : Promise.resolve();
      flush.then(function () { return sb.auth.signOut({ scope: 'local' }); }).catch(function () {}).then(function () {
        if (v === 'clear') { GP.reset(); try { localStorage.removeItem(META_KEY); } catch (e) {} }
        else setMeta({ dirty: undefined, rev: undefined, syncedAt: undefined });   // 保留 uid：下次换账号登录时能识别「这是别人的数据」
        signedOut();
        toast(t(v === 'clear' ? '已退出，本机数据已清除' : '已退出登录'), '别');
        setMode(null); openGate(true);
      });
    });
  });
  function signedOut() { user = null; syncedUid = null; clearTimeout(pushTimer); clearTimeout(retryTimer); setStatus('local'); }

  /* ---------- 新密码（重置链接回来） ---------- */
  $('#formNewPass').addEventListener('submit', function (e) {
    var sub = e.submitter; if (sub && sub.value === 'cancel') return;
    e.preventDefault();
    var v = $('#newPass').value, err = $('#newPassErr');
    if (v.length < 6) { err.textContent = t('密码至少需要 6 位。'); $('#newPass').setAttribute('aria-invalid', 'true'); return; }
    $('#newPassOk').disabled = true;
    sb.auth.updateUser({ password: v }).then(function (r) {
      $('#newPassOk').disabled = false;
      if (r.error) { err.textContent = zhError(r.error); return; }
      $('#dlgNewPass').close(); toast(t('新密码已保存'), '密');
    });
  });

  /* ---------- 会话 ---------- */
  function onAuth(ev, session) {
    if (ev === 'PASSWORD_RECOVERY') { setTimeout(function () { $('#newPass').value = ''; $('#dlgNewPass').showModal(); }, 300); }
    if (session && session.user) {
      var changed = !user || user.id !== session.user.id;
      user = session.user; setMode('cloud');
      closeGate(); paint();
      if (changed) {
        if (ev === 'SIGNED_IN') toast(t('欢迎，{email}', { email: user.email || '' }), '✓');
        syncedUid = null; pull();
      }
      return;
    }
    if (user) signedOut();
    if (ev === 'INITIAL_SESSION' && getMode() !== 'local' && !gate.open) openGate(true);
  }
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error(t('无法加载 {src}', { src: src }))); }; document.head.appendChild(s); });
  }
  function readUrlError() {
    var h = new URLSearchParams((location.hash || '').replace(/^#/, '')), q = new URLSearchParams(location.search);
    var code = h.get('error_code') || q.get('error_code'), desc = h.get('error_description') || q.get('error_description');
    if (!code && !desc) return null;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    return zhError({ code: code, message: desc || code });
  }

  function boot() {
    setTab('in');
    var urlErr = readUrlError();
    var hasStored = false; try { hasStored = !!localStorage.getItem(AUTH_KEY); } catch (e) {}
    var fromLink = /access_token=|type=(recovery|magiclink|signup)|[?&]code=/.test(location.hash + location.search);
    paint();
    if (!CONFIGURED) { if (getMode() !== 'local') openGate(true); return; }
    // 没有会话、也不是从邮件链接回来：立刻显示登录页，避免内容闪一下
    var resumeAuth = false; try { resumeAuth = !!(history.state && history.state.gpGate === 'auth'); } catch (e) {}
    if (!hasStored && !fromLink && getMode() !== 'local') openGate(true, resumeAuth ? 'auth' : 'landing');
    if (urlErr) { openGate(getMode() !== 'local', 'auth'); say(urlErr, 'err'); }
    loadScript('vendor/supabase.min.js').then(function () {
      sb = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY }
      });
      readyResolve();
      sb.auth.onAuthStateChange(function (ev, session) { setTimeout(function () { onAuth(ev, session); }, 0); });
      if (fromLink) setTimeout(function () { try { history.replaceState(null, '', location.pathname); } catch (e) {} }, 1500);
    }).catch(function (err) { console.warn(err); say(t('云同步组件加载失败，可先使用本机模式。'), 'err'); });
  }

  /* 语言切换：重绘状态、按钮文字、已寄出页、冲突对话框等 */
  document.addEventListener('gp:lang', function () {
    i18nLabels(); paint();
    $('.btn__label', form).textContent = t(tab === 'in' ? '登录' : '注册并登录');
    $('#pwToggle').setAttribute('aria-label', t(passIn.type === 'text' ? '隐藏密码' : '显示密码'));
    if (!$('#authSent').hidden) { paintSent(); resendLabel(); }
    if (msgEl.textContent) clearErrors();     // 旧语言的错误提示直接清掉，避免混排
  });

  if (window.GP) boot(); else document.addEventListener('gp:ready', boot);

  /* ---------- PWA ---------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.info('SW 注册失败', e); }); });
  }

  // 供测试与调试
  window.GPCloud = { status: function () { return user ? status : 'local'; }, view: function () { return gate.open ? gateView : null; }, user: function () { return user; }, syncNow: syncNow, configured: CONFIGURED };
})();
