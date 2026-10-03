/* Ledger — vanilla JS, no build, works from file:// */
(function () {
  'use strict';

  var KEY = 'growth-plan:v1';
  var THEME_KEY = 'growth-plan:theme';
  var SKIN_KEY = 'growth-plan:skin';          // 主题的本机镜像（只用于首帧防闪烁）；真正的选择存在 state.prefs.theme，随云端同步
  var SKINS = ['farm', 'arcade', 'night', 'minimal'];      // 公开的主题列表
  var HIDDEN_SKIN = 'cuties';                               // 隐藏主题：解锁后才出现在主题列表里（prefs.cutiesUnlocked，随云端同步）
  var CUTE_KEY = 'growth-plan:cuties';                      // 本机镜像，只用于首帧
  function skinOk(s, unlocked) { return SKINS.indexOf(s) >= 0 || (s === HIDDEN_SKIN && !!unlocked); }
  var MILESTONES = [3, 7, 14, 21, 30, 50, 100, 200, 365];
  var WEEK_MILESTONES = [2, 4, 8, 12, 26, 52];
  var FREQS = ['daily', 'weekdays', 'days', 'weekly'];
  var I = window.I18N, t = I.t, F = I.fmt;
  function isEn() { return I.lang === 'en'; }
  var DEFAULT_MOTTO = '慢慢来，比较快。';
  var DEFAULT_MOTTO_EN = 'Slow is smooth, and smooth is fast.';
  var OLD_MOTTOS = ['\u65e5\u62f1\u4e00\u5352\uff0c\u529f\u4e0d\u5510\u6350\u3002'];   // 旧版默认语（含被禁用的字），读取时换成新默认
  var CJK_RX = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
  function isDefaultMotto(m) { return m === DEFAULT_MOTTO || m === DEFAULT_MOTTO_EN; }
  function curLang() { return isEn() ? 'en' : 'zh'; }
  function defMotto(l) { return l === 'en' ? DEFAULT_MOTTO_EN : DEFAULT_MOTTO; }
  /* 每种语言各自一句：state.mottos = { zh, en }（空串 = 用该语言的默认语）。
   * 旧字段 state.motto 继续保留并镜像「最近改写的那一句」，旧版客户端 / 旧云端行照常可读。 */
  function mottoFor(l) { var m = state.mottos && state.mottos[l]; return m ? m : defMotto(l); }
  function mottoText() { return mottoFor(curLang()); }
  function langOfText(m) { return CJK_RX.test(m) ? 'zh' : 'en'; }
  function normMottos(o) {
    var legacy = typeof o.motto === 'string' ? o.motto.trim() : '';
    if (OLD_MOTTOS.indexOf(legacy) >= 0) legacy = '';
    var src = o.mottos && typeof o.mottos === 'object' ? o.mottos : null, ms = { zh: '', en: '' };
    if (src) ['zh', 'en'].forEach(function (l) { var v = typeof src[l] === 'string' ? src[l].trim().slice(0, 60) : ''; ms[l] = OLD_MOTTOS.indexOf(v) >= 0 || isDefaultMotto(v) ? '' : v; });
    // 没有 mottos（旧数据），或旧版客户端之后又改了 motto：按文字判断语言，放进对应的一栏
    if (legacy && !isDefaultMotto(legacy) && legacy !== ms.zh && legacy !== ms.en) ms[langOfText(legacy)] = legacy.slice(0, 60);
    o.mottos = ms;
    o.motto = legacy && !isDefaultMotto(legacy) ? legacy.slice(0, 60) : (ms.zh || ms.en || DEFAULT_MOTTO);
  }
  var PALETTE = [
    { key: 'indigo', name: '靛青' }, { key: 'pine', name: '松绿' }, { key: 'ochre', name: '赭石' },
    { key: 'cinnabar', name: '朱砂' }, { key: 'plum', name: '藕紫' }, { key: 'slate', name: '黛灰' }
  ];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function dow(d) { return (d.getDay() + 6) % 7; } // Mon=0
  function startOfWeek(d) { return addDays(d, -dow(d)); }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }
  function md(d) { return F.md(d); }
  function mdLong(d) { return F.mdLong(d); }   // 读屏用
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function scheduleText(days) {
    var s = days.slice().sort().join('');
    if (s === '0123456') return t('每天');
    if (s === '01234') return t('周一至周五');
    if (s === '56') return t('周末');
    if (!days.length) return t('未安排');
    return days.slice().sort().map(function (i) { return F.wdShort(i); }).join(isEn() ? ', ' : '、');
  }
  /* 频率：每天 / 周一至周五 / 指定几天 / 每周 N 次（N 次的不限哪天） */
  function freqText(h) { return h.freq === 'weekly' ? t('每周 {n} 次', { n: h.target }) : scheduleText(h.days); }

  /* ---------- state ---------- */
  var state;
  var T = today();
  var weekOffset = 0;
  var filter = 'all';

  /* 新用户的入门模板：通用、中性的示例，可随意编辑或删除（不含任何个人课程或课表）。
   * 只在「本机没有任何数据」时使用；已有的本机缓存或云端数据永远不会被它覆盖。 */
  function sample() { return isEn() ? sampleEn() : sampleZh(); }
  function sampleZh() {
    var t = today();
    var areas = [
      { id: 'a-study', name: '学业', color: 'indigo' },
      { id: 'a-health', name: '健康', color: 'pine' },
      { id: 'a-skill', name: '技能', color: 'ochre' },
      { id: 'a-habit', name: '习惯', color: 'cinnabar' },
      { id: 'a-life', name: '生活', color: 'plum' }
    ];
    var created = keyOf(t);
    var habits = [
      { id: 's-h1', name: '复习今天的课堂笔记', seal: '习', area: 'a-study', freq: 'weekdays', days: [0, 1, 2, 3, 4], created: created },
      { id: 's-h2', name: '阅读 20 分钟', seal: '读', area: 'a-study', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: created },
      { id: 's-h3', name: '运动 30 分钟', seal: '动', area: 'a-health', freq: 'weekly', target: 3, days: [0, 1, 2, 3, 4, 5, 6], created: created },
      { id: 's-h4', name: '练习一项技能 20 分钟', seal: '技', area: 'a-skill', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: created },
      { id: 's-h5', name: '12 点前睡觉', seal: '眠', area: 'a-habit', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: created },
      { id: 's-h6', name: '记录今天的支出', seal: '账', area: 'a-life', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: created },
      { id: 's-h7', name: '回顾本周，计划下周', seal: '省', area: 'a-habit', freq: 'days', days: [6], created: created }
    ];
    function due(n) { return keyOf(addDays(t, n)); }
    var goals = [
      { id: 's-g1', title: '按时完成所有作业', area: 'a-study', due: due(90), note: '示例目标：点铅笔图标即可修改或删除。', tasks: [
        { id: uid(), text: '列出所有作业的截止时间', done: false },
        { id: uid(), text: '每份作业拆成几个小步骤', done: false },
        { id: uid(), text: '每周检查一次进度', done: false }] },
      { id: 's-g2', title: '养成运动习惯', area: 'a-health', due: due(60), note: '', tasks: [
        { id: uid(), text: '选一项喜欢的运动', done: false },
        { id: uid(), text: '连续两周，每周运动 3 次', done: false },
        { id: uid(), text: '完成一次 5 公里跑步或快走', done: false }] },
      { id: 's-g3', title: '学会一项新技能', area: 'a-skill', due: due(90), note: '', tasks: [
        { id: uid(), text: '确定想学的技能', done: false },
        { id: uid(), text: '找一门入门课程或一本书', done: false },
        { id: uid(), text: '做出一个小作品', done: false }] },
      { id: 's-g4', title: '建立规律的作息', area: 'a-habit', due: '', note: '', tasks: [
        { id: uid(), text: '设定固定的起床时间', done: false },
        { id: uid(), text: '睡前 30 分钟不看手机', done: false },
        { id: uid(), text: '连续 21 天 12 点前睡觉', done: false }] },
      { id: 's-g5', title: '存下一笔应急金', area: 'a-life', due: due(120), note: '', tasks: [
        { id: uid(), text: '列出每月固定支出', done: false },
        { id: uid(), text: '定好每月存钱的金额', done: false },
        { id: uid(), text: '每月回顾一次账目', done: false }] }
    ];
    return { version: 2, motto: DEFAULT_MOTTO, mottos: { zh: '', en: '' }, areas: areas, habits: habits, goals: goals, log: {}, notes: {}, prefs: { theme: deviceSkin() } };
  }

  /* 英文界面下的新用户：同一套模板的英文版（id 与中文版一致，GP.isSample 照样能识别） */
  function sampleEn() {
    var td = today(), created = keyOf(td);
    function due(n) { return keyOf(addDays(td, n)); }
    function steps(a) { return a.map(function (x) { return { id: uid(), text: x, done: false }; }); }
    return { version: 2, motto: DEFAULT_MOTTO_EN, mottos: { zh: '', en: '' }, log: {}, notes: {}, prefs: { theme: deviceSkin() },
      areas: [
        { id: 'a-study', name: 'Study', color: 'indigo' }, { id: 'a-health', name: 'Health', color: 'pine' },
        { id: 'a-skill', name: 'Skills', color: 'ochre' }, { id: 'a-habit', name: 'Routine', color: 'cinnabar' },
        { id: 'a-life', name: 'Life', color: 'plum' }],
      habits: [
        { id: 's-h1', name: 'Review today’s class notes', seal: 'N', area: 'a-study', freq: 'weekdays', days: [0, 1, 2, 3, 4], created: created },
        { id: 's-h2', name: 'Read for 20 minutes', seal: 'R', area: 'a-study', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: created },
        { id: 's-h3', name: 'Exercise for 30 minutes', seal: 'E', area: 'a-health', freq: 'weekly', target: 3, days: [0, 1, 2, 3, 4, 5, 6], created: created },
        { id: 's-h4', name: 'Practise a skill for 20 minutes', seal: 'P', area: 'a-skill', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: created },
        { id: 's-h5', name: 'In bed by midnight', seal: 'S', area: 'a-habit', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: created },
        { id: 's-h6', name: 'Note today’s spending', seal: '$', area: 'a-life', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: created },
        { id: 's-h7', name: 'Review the week, plan the next', seal: 'W', area: 'a-habit', freq: 'days', days: [6], created: created }],
      goals: [
        { id: 's-g1', title: 'Hand in every assignment on time', area: 'a-study', due: due(90), note: 'A sample goal — use the pencil to edit or delete it.', tasks: steps(['List every assignment deadline', 'Break each assignment into small steps', 'Check progress once a week']) },
        { id: 's-g2', title: 'Make exercise a habit', area: 'a-health', due: due(60), note: '', tasks: steps(['Pick an activity you enjoy', 'Exercise 3 times a week for two weeks', 'Run or walk 5 km in one go']) },
        { id: 's-g3', title: 'Learn a new skill', area: 'a-skill', due: due(90), note: '', tasks: steps(['Decide what to learn', 'Find a beginner course or book', 'Make one small project']) },
        { id: 's-g4', title: 'Keep a steady sleep schedule', area: 'a-habit', due: '', note: '', tasks: steps(['Set a fixed wake-up time', 'No phone for 30 minutes before bed', 'In bed by midnight for 21 days straight']) },
        { id: 's-g5', title: 'Build an emergency fund', area: 'a-life', due: due(120), note: '', tasks: steps(['List fixed monthly costs', 'Set a monthly savings amount', 'Review spending once a month']) }]
    };
  }

  function emptyState() {
    return { version: 2, motto: defMotto(curLang()), mottos: { zh: '', en: '' }, areas: sample().areas, habits: [], goals: [], log: {}, notes: {}, prefs: keepPrefs({ theme: state && state.prefs ? state.prefs.theme : deviceSkin() }) };
  }

  function validate(o) {
    if (!o || typeof o !== 'object') throw new Error(t('不是有效的 JSON 对象'));
    if (!Array.isArray(o.areas) || !Array.isArray(o.habits) || !Array.isArray(o.goals) || typeof o.log !== 'object' || o.log === null) throw new Error(t('缺少 areas / habits / goals / log 字段'));
    o.areas = o.areas.filter(function (a) { return a && a.id && a.name; }).map(function (a) { return { id: String(a.id), name: String(a.name).slice(0, 12), color: PALETTE.some(function (p) { return p.key === a.color; }) ? a.color : 'slate' }; });
    if (!o.areas.length) o.areas = sample().areas;
    var firstArea = o.areas[0].id, areaIds = o.areas.map(function (a) { return a.id; });
    function mapHabits(list) { return list.filter(function (h) { return h && h.id && h.name; }).map(function (h) {
      var days = Array.isArray(h.days) ? h.days.map(Number).filter(function (x, i, a) { return x >= 0 && x <= 6 && x === Math.floor(x) && a.indexOf(x) === i; }).sort() : [0, 1, 2, 3, 4, 5, 6];
      var out = { id: String(h.id), name: String(h.name).slice(0, 60), seal: String(h.seal || h.name).trim().charAt(0) || '习', area: areaIds.indexOf(h.area) >= 0 ? h.area : firstArea,
        freq: 'days', days: days, created: /^\d{4}-\d\d-\d\d$/.test(h.created) ? h.created : keyOf(today()) };
      normFreq(out, h);
      return out;
    }); }
    o.habits = mapHabits(o.habits);
    // 归档的习惯放在 o.archive（同样的格式；打卡记录按 id 保留在 log 里，恢复后照常显示）
    o.archive = mapHabits(Array.isArray(o.archive) ? o.archive : []).filter(function (h) { return !o.habits.some(function (x) { return x.id === h.id; }); });
    if (!o.archive.length) delete o.archive;
    o.goals = o.goals.filter(function (g) { return g && g.id && g.title; }).map(function (g) {
      return { id: String(g.id), title: String(g.title).slice(0, 80), area: areaIds.indexOf(g.area) >= 0 ? g.area : firstArea, due: /^\d{4}-\d\d-\d\d$/.test(g.due) ? g.due : '', note: String(g.note || '').slice(0, 80),
        tasks: (Array.isArray(g.tasks) ? g.tasks : []).filter(function (t) { return t && t.text; }).map(function (t) { return { id: String(t.id || uid()), text: String(t.text).slice(0, 80), done: !!t.done }; }) };
    });
    var log = {};
    Object.keys(o.log).forEach(function (k) { if (/^\d{4}-\d\d-\d\d$/.test(k) && Array.isArray(o.log[k])) log[k] = o.log[k].map(String); });
    o.log = log;
    // 每天一句笔记（v10 新增）：{ 'YYYY-MM-DD': '文字' }；旧数据没有这一栏 → 空
    var notes = {}, srcN = o.notes && typeof o.notes === 'object' && !Array.isArray(o.notes) ? o.notes : {};
    Object.keys(srcN).forEach(function (k) { var v = typeof srcN[k] === 'string' ? srcN[k].trim().slice(0, 80) : ''; if (/^\d{4}-\d\d-\d\d$/.test(k) && v) notes[k] = v; });
    o.notes = notes;
    // 偏好（v10 新增，随云端同步）：主题。旧数据 / 没选过主题的老用户 → 田园
    var pr = o.prefs && typeof o.prefs === 'object' ? o.prefs : {};
    // v11：隐藏主题的解锁标记只在为 true 时保存；没解锁却选了隐藏主题（旧数据 / 手改）→ 田园
    o.prefs = { theme: skinOk(pr.theme, pr.cutiesUnlocked === true) ? pr.theme : 'farm' };
    if (pr.cutiesUnlocked === true) o.prefs.cutiesUnlocked = true;
    if (pr.onboarded === true) o.prefs.onboarded = true;   // v12：新手指引看过了（随云端同步）
    normMottos(o);
    o.version = 2;
    return o;
  }
  /* 频率迁移：旧数据只有 days（每周哪几天）→ 按 days 推断「每天 / 周一至周五 / 指定几天」；「每周 N 次」另存 target。
   * days 一直保留并写成等价的值（每周 N 次 = 七天都可以），旧版客户端读到的仍是合理的安排。 */
  function normFreq(out, h) {
    var f = FREQS.indexOf(h.freq) >= 0 ? h.freq : null, d = out.days.join('');
    if (f === 'weekly') {
      var n = Math.round(+h.target); out.freq = 'weekly'; out.target = n >= 1 && n <= 7 ? n : 3; out.days = [0, 1, 2, 3, 4, 5, 6]; return;
    }
    if (f === 'daily' || (!f && d === '0123456')) { out.freq = 'daily'; out.days = [0, 1, 2, 3, 4, 5, 6]; return; }
    if (f === 'weekdays' || (!f && d === '01234')) { out.freq = 'weekdays'; out.days = [0, 1, 2, 3, 4]; return; }
    out.freq = 'days';
  }

  /* 本机已有数据（无论是用户自己的，还是旧版示例）一律原样使用，不做版本迁移、不替换成新模板 */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return validate(JSON.parse(raw));
    } catch (e) { console.warn('数据读取失败，已载入示例', e); }
    return sample();
  }
  /* 每次用户修改：立即写本机（离线优先），再通知云同步模块（cloud.js）去抖上传 */
  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { toast(t('保存失败：浏览器存储不可用'), '!'); return false; }
  }
  function save() {
    if (writeLocal()) {
      try { document.dispatchEvent(new CustomEvent('gp:change')); } catch (e) {}
    }
    updateDataSize();
  }

  /* ---------- domain ---------- */
  function area(id) { for (var i = 0; i < state.areas.length; i++) if (state.areas[i].id === id) return state.areas[i]; return state.areas[0] || { id: '', name: t('未分类'), color: 'slate' }; }
  function areaColor(id) { return 'var(--a-' + area(id).color + ')'; }
  function isDone(hid, k) { var a = state.log[k]; return !!a && a.indexOf(hid) >= 0; }
  function isWeekly(h) { return h.freq === 'weekly'; }
  function onDay(h, d) { return h.days.indexOf(dow(d)) >= 0; }
  /* 这周（d 所在的周一 ~ 周天）里，d 之前打卡了几次 */
  function doneBefore(h, d) { var n = 0, ws = startOfWeek(d); for (var x = ws; x < d; x = addDays(x, 1)) if (isDone(h.id, keyOf(x))) n++; return n; }
  function weekDone(h, ws) { var n = 0; for (var i = 0; i < 7; i++) if (isDone(h.id, keyOf(addDays(ws, i)))) n++; return n; }
  /* 那天「需要打卡」吗？
   * - 每天 / 周一至周五 / 指定几天：安排在那天就需要
   * - 每周 N 次：哪天做都行。只有当天打了卡，或者剩下的天数刚好只够补齐（再不做就完不成）时才算需要；这周已达标后都不需要 */
  function required(h, d) {
    if (!isWeekly(h)) return onDay(h, d);
    var need = h.target - doneBefore(h, d);
    if (need <= 0) return false;
    return isDone(h.id, keyOf(d)) || need >= 7 - dow(d);
  }
  var isSched = required;
  /* 这周的目标与完成数（整周）：用于作物 / 电池 / 月相的阶段，以及「这周 3/5」 */
  function weekProgress(h, ws) {
    ws = ws || startOfWeek(T);
    if (isWeekly(h)) return { done: Math.min(weekDone(h, ws), h.target), target: h.target, extra: Math.max(0, weekDone(h, ws) - h.target) };
    var tg = 0, dn = 0;
    for (var i = 0; i < 7; i++) { var d = addDays(ws, i); if (onDay(h, d)) { tg++; if (isDone(h.id, keyOf(d))) dn++; } }
    return { done: dn, target: tg, extra: weekDone(h, ws) - dn };
  }
  function setDone(hid, k, on) {
    var a = state.log[k] || [];
    var i = a.indexOf(hid);
    if (on && i < 0) a.push(hid);
    if (!on && i >= 0) a.splice(i, 1);
    if (a.length) state.log[k] = a; else delete state.log[k];
  }
  /* 连续：按天的习惯数「天」（不需要打卡的那几天跳过，不算断）；每周 N 次的习惯数「周」（达标的周连在一起） */
  function streakUnit(h) { return isWeekly(h) ? 'week' : 'day'; }
  function weekStreak(h) {
    var ws = startOfWeek(T), n = 0, c = startOfWeek(parseKey(h.created));
    if (weekDone(h, ws) < h.target) ws = addDays(ws, -7);     // 这周还没达标：不算断，从上周往回数
    for (var i = 0; i < 600 && ws >= c && weekDone(h, ws) >= h.target; i++) { n++; ws = addDays(ws, -7); }
    return n;
  }
  function bestWeekStreak(h) {
    var ws = startOfWeek(parseKey(h.created)), end = startOfWeek(T), best = 0, cur = 0;
    for (var i = 0; i < 600 && ws <= end; i++) {
      if (weekDone(h, ws) >= h.target) { cur++; if (cur > best) best = cur; }
      else if (ws < end) cur = 0;
      ws = addDays(ws, 7);
    }
    return best;
  }
  function streak(h) {
    if (isWeekly(h)) return weekStreak(h);
    var d = T, n = 0, created = parseKey(h.created);
    if (!isDone(h.id, keyOf(d))) d = addDays(d, -1);
    for (var i = 0; i < 1000 && d >= created; i++) {
      var k = keyOf(d);
      if (isDone(h.id, k)) n++;
      else if (isSched(h, d)) break;
      d = addDays(d, -1);
    }
    return n;
  }
  function bestStreak(h) {
    if (isWeekly(h)) return bestWeekStreak(h);
    var best = 0, cur = 0, d = parseKey(h.created);
    if (d > T) return 0;
    for (var i = 0; i < 2000 && d <= T; i++) {
      var k = keyOf(d);
      if (isDone(h.id, k)) { cur++; if (cur > best) best = cur; }
      else if (isSched(h, d) && keyOf(d) !== keyOf(T)) cur = 0;
      d = addDays(d, 1);
    }
    return best;
  }
  function dayRatio(d) {
    var k = keyOf(d), sched = 0, done = 0;
    state.habits.forEach(function (h) {
      if (parseKey(h.created) > d) return;
      if (required(h, d)) { sched++; if (isDone(h.id, k)) done++; }
    });
    return sched ? done / sched : (state.log[k] && state.log[k].length ? 1 : 0);
  }

  /* ---------- 主题（皮肤）----------
   * 田园 / 电玩 / 星夜是像素主题，简约是原来的墨灰账本。明暗只属于简约：田园是浅色，电玩、星夜本身就是深色，
   * 选了它们时「明暗」开关收起（设置仍保留，切回简约时照旧生效）。主题存在 state.prefs.theme（随云端同步），
   * 本机另存一份镜像（growth-plan:skin），只用于下次打开时首帧就画对颜色。 */
  function deviceSkin() { var s = null, u = false; try { s = localStorage.getItem(SKIN_KEY); u = localStorage.getItem(CUTE_KEY) === '1'; } catch (e) {} return skinOk(s, u) ? s : 'farm'; }
  /* 清空 / 导入不会把已解锁的隐藏主题再藏起来 */
  function keepPrefs(p) { p = p || { theme: 'farm' }; if (cutiesUnlocked()) p.cutiesUnlocked = true; if (state && state.prefs && state.prefs.onboarded) p.onboarded = true; return p; }
  function cutiesUnlocked() { return !!(state && state.prefs && state.prefs.cutiesUnlocked); }
  function shownSkins() { return cutiesUnlocked() ? SKINS.slice(0, 3).concat(HIDDEN_SKIN, SKINS.slice(3)) : SKINS; }
  function curSkin() { return document.documentElement.getAttribute('data-skin') || 'farm'; }
  function isPx() { return curSkin() !== 'minimal'; }
  var SKIN_NAMES = { farm: '田园', arcade: '电玩', night: '星夜', minimal: '简约', cuties: '小可爱' };
  var THEME_COLOR = { farm: '#8b5428', arcade: '#0b0a1f', night: '#0d1636', cuties: '#fff5f7' };
  function paintSkinSwitches() {
    var cur = curSkin();
    $$('[data-skin-switch]').forEach(function (box) {
      var want = shownSkins().join(',');
      if (box.dataset.list !== want) box.dataset.list = want, box.innerHTML = shownSkins().map(function (k) { return '<button type="button" class="skins__opt" data-set-skin="' + k + '" aria-pressed="false"><span class="skins__ico" aria-hidden="true">' + SKIN.icon(k) + '</span><span class="skins__t"></span></button>'; }).join('');
      $$('[data-set-skin]', box).forEach(function (b) {
        var k = b.dataset.setSkin, name = t(SKIN_NAMES[k]);
        $('.skins__t', b).textContent = name;
        b.setAttribute('aria-pressed', String(k === cur));
        if (box.classList.contains('skins--bar')) { b.setAttribute('aria-label', t('主题：{name}', { name: name })); b.title = name; }
      });
      box.setAttribute('aria-label', t('主题'));
    });
  }
  function applySkin(s) {
    if (!skinOk(s, cutiesUnlocked())) s = 'farm';
    var d = document.documentElement, was = curSkin();
    try { if (cutiesUnlocked()) localStorage.setItem(CUTE_KEY, '1'); else localStorage.removeItem(CUTE_KEY); } catch (e) {}
    d.setAttribute('data-skin', s); d.classList.toggle('px', s !== 'minimal');
    try { localStorage.setItem(SKIN_KEY, s); } catch (e) {}
    $$('meta[name="theme-color"]').forEach(function (m, i) { m.content = THEME_COLOR[s] || (i === 0 ? '#F6F5F1' : '#141513'); });
    d.style.setProperty('--cell-icon', SKIN.cellIcon(s));
    d.style.setProperty('--empty-icon', SKIN.isPixel(s) ? SKIN.emptyIcon(s) : 'none');
    d.style.setProperty('--brand-icon', SKIN.isPixel(s) ? SKIN.url(SKIN.icon('logo')) : 'none');
    d.style.setProperty('--check-icon', SKIN.url(SKIN.icon('check')));
    paintSkinSwitches(); paintThemeBtn();
    $('#prefsMode').hidden = s !== 'minimal';
    var ba = $('#bootArt'); if (ba) ba.innerHTML = SKIN.bootArt(s);
    mountCrew(s);
    if (was !== s) document.dispatchEvent(new CustomEvent('gp:skin', { detail: { skin: s } }));
    return was !== s;
  }
  /* 隐藏主题的三只小伙伴：只在该主题下挂载并播放，切走即停 */
  function mountCrew(s) {
    var cv = $('#crew'); if (!cv || !window.Crew) return;
    if (s === HIDDEN_SKIN) { cv.hidden = false; Crew.mount(cv); } else { Crew.stop(); cv.hidden = true; }
  }
  /* 解锁：在设置面板里连点 Ledger 标志 5 下（约 3 秒内） */
  var logoTaps = [];
  function tapLogo() {
    var now = Date.now(); logoTaps = logoTaps.filter(function (x) { return now - x < 3000; }); logoTaps.push(now);
    if (logoTaps.length < 5) return;
    logoTaps = [];
    if (cutiesUnlocked()) { toast(t('已经解锁啦～')); return; }
    if (!state.prefs) state.prefs = {};
    state.prefs.cutiesUnlocked = true;
    try { localStorage.setItem(CUTE_KEY, '1'); } catch (e) {}
    save(); paintSkinSwitches();
    toast(t('解锁了隐藏主题：小可爱～'));
  }
  function setSkin(s) {
    if (!skinOk(s, cutiesUnlocked())) return;
    if (!state.prefs) state.prefs = {};
    var changed = state.prefs.theme !== s;
    state.prefs.theme = s;
    if (changed) save();
    if (applySkin(s) || changed) { renderAll(); drawScenes(); }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-set-skin]'); if (!b) return;
    setSkin(b.dataset.setSkin);
    var same = b.closest('[data-skin-switch]'), cur = same && $('[data-set-skin="' + b.dataset.setSkin + '"]', same); if (cur) cur.focus();
  });
  /* 场景条（像素主题）：顶栏下一条，首页上一条 */
  var sceneT = 0;
  function sceneP() { return matchMedia('(min-width: 960px)').matches ? 4 : 3; }
  function drawScenes() {
    if (!isPx()) return;
    var cv = $('#scene'); if (cv && cv.parentNode.clientWidth) SKIN.drawScene(cv, curSkin(), { P: sceneP(), H: 40, layer: $('#sceneFx') });
    var lc = $('#landingScene'); if (lc && lc.offsetParent && lc.parentNode.clientWidth) SKIN.drawScene(lc, curSkin(), { P: sceneP(), H: 40 });
    paintLandingSheet(); renderHud();
  }
  addEventListener('resize', function () { clearTimeout(sceneT); sceneT = setTimeout(function () { drawScenes(); if (window.Crew) Crew.size(); }, 120); });
  function paintLandingSheet() {
    var st = [4, 2, 1, 4], colors = ['indigo', 'cinnabar', 'plum', 'ochre'];
    $$('.sheet__plot').forEach(function (el, i) { el.innerHTML = SKIN.sprite(curSkin(), st[i % 4], colors[i % 4]); });
  }
  /* 电玩的记分板：这周 XP（每次打卡 10）、历史最高的一周、当前最长连击 */
  function renderHud() {
    var hud = $('#hud'); if (!hud) return;
    if (curSkin() !== 'arcade') { hud.innerHTML = ''; return; }
    var ws = startOfWeek(T), wk = 0, best = 0, weeks = {}, combo = 0;
    Object.keys(state.log).forEach(function (k) { var w = keyOf(startOfWeek(parseKey(k))); weeks[w] = (weeks[w] || 0) + state.log[k].length; });
    Object.keys(weeks).forEach(function (w) { if (weeks[w] > best) best = weeks[w]; });
    wk = weeks[keyOf(ws)] || 0;
    state.habits.forEach(function (h) { if (!isWeekly(h)) combo = Math.max(combo, streak(h)); });
    function z(n) { return String(n * 10).padStart(6, '0'); }
    hud.innerHTML = '<span>1UP <b>' + z(wk) + '</b></span><span>HI <b>' + z(Math.max(best, wk)) + '</b></span><span class="hud__blink">COMBO ×' + combo + '</span>';
  }

  /* ---------- 明暗（只用于简约主题） ---------- */
  var themeBtn = $('#themeBtn');
  function currentTheme() { return document.documentElement.dataset.theme || 'system'; }
  function effectiveDark() { var t = currentTheme(); return t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); }
  function paintThemeBtn() {
    var t = currentTheme();
    var label = I.t({ system: '跟随系统', light: '浅色', dark: '深色' }[t]);
    if (themeBtn) {   // 顶栏的明暗按钮已移到「我的」
      $('#themeLabel').textContent = label;
      themeBtn.dataset.mode = effectiveDark() ? 'dark' : 'light';
      themeBtn.setAttribute('aria-label', I.t('明暗：{label}，点击切换', { label: label }));
    }
    $$('[data-set-theme]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.setTheme === t)); });
  }
  function setTheme(next) {
    if (next === 'system') { delete document.documentElement.dataset.theme; try { localStorage.removeItem(THEME_KEY); } catch (e) {} }
    else { document.documentElement.dataset.theme = next; try { localStorage.setItem(THEME_KEY, next); } catch (e) {} }
    paintThemeBtn();
  }
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var order = ['system', 'light', 'dark'];
    setTheme(order[(order.indexOf(currentTheme()) + 1) % 3]);
  });

  /* 手机顶栏的「设置」小面板：主题 + 语言（披露式：aria-expanded，Esc / 点外面 / Tab 移出即关，关后焦点回到按钮） */
  var prefsBtn = $('#prefsBtn'), prefsMenu = $('#prefsMenu');
  function prefsOpen() { return !!prefsBtn && !prefsMenu.hidden; }   // 设置是「我的」页里的常驻内容，不再是弹出面板
  function visible(el) { return !!el && el.getClientRects().length > 0; }
  function openPrefs() {
    if (!prefsBtn) { goTab('me'); return; }
    prefsMenu.hidden = false; prefsBtn.setAttribute('aria-expanded', 'true');
    var cur = [$('[data-set-skin][aria-pressed="true"]', prefsMenu)].concat($$('button, input', prefsMenu)).filter(visible)[0]; if (cur) cur.focus();
  }
  function closePrefs(refocus) {
    if (!prefsOpen()) return;
    prefsMenu.hidden = true; prefsBtn.setAttribute('aria-expanded', 'false');
    if (refocus) prefsBtn.focus();
  }
  if (prefsBtn) prefsBtn.addEventListener('click', function () { if (prefsOpen()) closePrefs(true); else openPrefs(); });
  /* 游客模式提示：没登录（且云同步可用）时显示；本次会话内可关掉；登录后自动消失 */
  var GUEST_KEY = 'growth-plan:guest-hide';
  function paintGuest() {
    var g = $('#guest'); if (!g) return;
    var cloud = window.GPCloud, hide = false;
    try { hide = sessionStorage.getItem(GUEST_KEY) === '1'; } catch (e) {}
    var show = !!cloud && cloud.configured !== false && !cloud.user() && !hide;
    if (g.hidden === !show) return;
    g.hidden = !show; document.documentElement.classList.toggle('has-guest', show);
    setTimeout(function () { drawScenes(); if (window.Crew) Crew.size(); }, 0);
  }
  $('#guestGo').addEventListener('click', function () { var p = $('#syncPill'); if (p) p.click(); });
  $('#guestX').addEventListener('click', function () {
    try { sessionStorage.setItem(GUEST_KEY, '1'); } catch (e) {}
    paintGuest(); var f = $('#guestT') && $('.brand'); if (f) f.focus();
  });
  (function () {
    var pill = $('#syncPill');
    if (pill && window.MutationObserver) new MutationObserver(paintGuest).observe(pill, { attributes: true, attributeFilter: ['data-state', 'aria-label'] });
    addEventListener('load', paintGuest); setTimeout(paintGuest, 0);
  })();
  // 标志直接写在 index.html 里（不依赖脚本也能显示）；整行（标志 + 版本号）都是点击区域，至少 44px 高
  if (!$('#prefsLogo svg')) $('#prefsLogo').innerHTML = SKIN.icon('logo');
  $('#prefsFoot').addEventListener('click', tapLogo);
  prefsMenu.addEventListener('click', function (e) { var b = e.target.closest('[data-set-theme]'); if (b) { setTheme(b.dataset.setTheme); b.focus(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && prefsOpen()) { e.preventDefault(); e.stopPropagation(); closePrefs(true); } }, true);
  document.addEventListener('pointerdown', function (e) { if (prefsOpen() && !e.target.closest('#prefs')) closePrefs(false); });
  $('#prefs').addEventListener('focusout', function (e) { if (prefsOpen() && e.relatedTarget && !e.relatedTarget.closest('#prefs')) closePrefs(false); });
  // 方向键在面板内的按钮之间移动
  prefsMenu.addEventListener('keydown', function (e) {
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
    var bs = $$('button', prefsMenu).filter(visible), i = bs.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault();
    var n = e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length;
    bs[n].focus();
  });

  /* ---------- 每天提醒 ----------
   * 设置只存本机（localStorage['growth-plan:reminder'] = { on, time }）：提醒是「这台设备」的事——
   * 手机上开了，不代表电脑浏览器也要弹；通知权限本来也是按设备授予的。
   * - 安卓 App（Capacitor）：@capacitor/local-notifications 排一条每天重复的本机通知（系统不给精确闹钟时由插件自动退回非精确，
   *   可能晚几分钟）；打开 App、改时间、换语言时重新排；关掉即取消。点通知打开 App。
   * - 网页：没有自己的推送服务器，做不到后台推送。只在页面 / 已安装的 PWA 开着时，到点弹一条通知；帮助文字如实说明，并推荐安卓版。
   * - 浏览器不支持 Notification（或非安全上下文）：整块隐藏，不报错。 */
  var REM_KEY = 'growth-plan:reminder', REM_LAST = 'growth-plan:reminder-last', REM_ID = 2100, REM_CHANNEL = 'ledger-reminder';
  var CapN = window.Capacitor, NATIVE_APP = !!(CapN && CapN.isNativePlatform && CapN.isNativePlatform());
  var LN = NATIVE_APP && CapN.Plugins ? CapN.Plugins.LocalNotifications : null;
  var WEB_NOTIFY = !NATIVE_APP && typeof window.Notification === 'function' && window.isSecureContext !== false;
  var reminder = { available: !!LN || WEB_NOTIFY, native: !!LN, blocked: false, timer: 0, prevTick: 0 };
  function remLoad() {
    var r = null; try { r = JSON.parse(localStorage.getItem(REM_KEY) || 'null'); } catch (e) {}
    var time = r && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : '21:00';
    return { on: !!(r && r.on), time: time };
  }
  function remSave(r) { try { localStorage.setItem(REM_KEY, JSON.stringify({ on: !!r.on, time: r.time })); } catch (e) {} }
  function remBody() { return t('花一分钟，记下今天的进步。'); }
  function remHM(time) { var p = time.split(':'); return { hour: +p[0], minute: +p[1] }; }
  function paintReminder() {
    var grp = $('#remGrp'); if (!grp) return;
    document.documentElement.classList.toggle('has-reminder', reminder.available);
    grp.hidden = !reminder.available;
    if (!reminder.available) return;
    var r = remLoad();
    $('#remOn').checked = r.on;
    if (document.activeElement !== $('#remTime')) $('#remTime').value = r.time;
    var help = $('#remHelp'), msg;
    if (reminder.blocked) msg = reminder.native ? t('通知权限被关掉了。请在系统设置里允许 Ledger 发送通知。') : t('浏览器拦截了通知。请在浏览器的网站设置里允许通知。');
    else if (reminder.native) msg = r.on ? t('每天 {time} 会收到一条安静的提醒。', { time: r.time }) : t('打开后，每天在这个时间提醒你一次。');
    else msg = t('网页提醒只在本页面（或已安装的应用）开着时才会响。想准时收到，请用安卓版。');
    $('#remHelpText').textContent = msg;
    help.dataset.tone = reminder.blocked ? 'warn' : '';
    $('#remApk').hidden = reminder.native || !!document.documentElement.classList.contains('is-native');
  }
  /* —— 安卓：本机定时通知 —— */
  function nativePermission() {
    return LN.checkPermissions().then(function (p) {
      if (p.display === 'granted') return true;
      if (p.display === 'denied') return false;
      return LN.requestPermissions().then(function (q) { return q.display === 'granted'; });   // Android 13+：POST_NOTIFICATIONS
    });
  }
  function nativeCancel() { return LN.cancel({ notifications: [{ id: REM_ID }] }).catch(function () {}); }
  function nativeSchedule(r) {
    var hm = remHM(r.time);
    var ch = LN.createChannel ? LN.createChannel({ id: REM_CHANNEL, name: t('每天提醒'), description: remBody(), importance: 3, visibility: 1 }).catch(function () {}) : Promise.resolve();
    return ch.then(nativeCancel).then(function () {
      return LN.schedule({ notifications: [{
        id: REM_ID, title: 'Ledger', body: remBody(), channelId: REM_CHANNEL,
        schedule: { on: { hour: hm.hour, minute: hm.minute }, allowWhileIdle: true }   // 每天重复；不申请精确闹钟，系统不允许时插件自动用非精确
      }] });
    });
  }
  /* —— 网页：页面开着时到点提醒 —— */
  function webFire() {
    var k = keyOf(new Date());
    try { if (localStorage.getItem(REM_LAST) === k) return; localStorage.setItem(REM_LAST, k); } catch (e) {}   // 多个标签页只弹一次
    var opts = { body: remBody(), icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: 'ledger-reminder', lang: isEn() ? 'en' : 'zh-CN' };
    var shown = navigator.serviceWorker && navigator.serviceWorker.controller
      ? navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification('Ledger', opts); })
      : Promise.reject();
    shown.catch(function () {
      try { var n = new Notification('Ledger', opts); n.onclick = function () { window.focus(); n.close(); }; } catch (e) {}
    });
  }
  function webTick() {
    var r = remLoad(), now = new Date();
    if (!r.on || Notification.permission !== 'granted') { reminder.prevTick = now.getTime(); return; }
    var hm = remHM(r.time), at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hm.hour, hm.minute).getTime();
    // 只在「上一次检查之前还没到点、这一次已经过点」时提醒；电脑睡眠错过太久（> 1 小时）就不补弹
    if (reminder.prevTick < at && now.getTime() >= at && now.getTime() - at < 3600000) webFire();
    reminder.prevTick = now.getTime();
  }
  function webArm() {
    clearInterval(reminder.timer); reminder.timer = 0;
    if (remLoad().on) { reminder.prevTick = Date.now(); reminder.timer = setInterval(webTick, 20000); }
  }
  function applyReminder() {
    var r = remLoad();
    if (reminder.native) return (r.on ? nativeSchedule(r) : nativeCancel()).catch(function (e) { console.warn('reminder', e); });
    if (WEB_NOTIFY) { if (r.on) reminder.blocked = Notification.permission === 'denied'; webArm(); }
    return Promise.resolve();
  }
  function setReminderOn(on) {
    var r = remLoad();
    if (!on) { r.on = false; remSave(r); reminder.blocked = false; applyReminder(); paintReminder(); return Promise.resolve(false); }
    var ask = reminder.native ? nativePermission()
      : Notification.permission === 'granted' ? Promise.resolve(true)
      : Notification.permission === 'denied' ? Promise.resolve(false)
      : Promise.resolve(Notification.requestPermission()).then(function (p) { return p === 'granted'; });
    return ask.catch(function () { return false; }).then(function (granted) {
      reminder.blocked = !granted; r.on = granted; remSave(r);
      return applyReminder().then(function () {
        paintReminder();
        if (granted) toast(t('好的，每天 {time} 提醒你。', { time: r.time }), '✓');
        return granted;
      });
    });
  }
  if (reminder.available) {
    $('#remOn').addEventListener('change', function (e) { setReminderOn(e.target.checked); });
    $('#remTime').addEventListener('change', function (e) {
      var v = e.target.value; if (!/^\d\d:\d\d$/.test(v)) { paintReminder(); return; }
      var r = remLoad(); r.time = v; remSave(r); applyReminder(); paintReminder();
    });
    document.addEventListener('gp:lang', function () { paintReminder(); if (reminder.native && remLoad().on) applyReminder(); });   // 通知文字跟着换语言
    addEventListener('storage', function (e) { if (e.key === REM_KEY) { applyReminder(); paintReminder(); } });
    if (reminder.native && remLoad().on) {   // 打开 App：权限可能在系统设置里被关掉了，检查后重新排
      LN.checkPermissions().then(function (p) { reminder.blocked = p.display !== 'granted'; paintReminder(); if (!reminder.blocked) applyReminder(); }).catch(function () {});
    } else applyReminder();
  }
  paintReminder();
  window.GP_REMINDER = { load: remLoad, tick: webTick, set: setReminderOn, state: reminder };   // 测试用
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintThemeBtn);

  /* ---------- count-up ---------- */
  function countTo(el, to) {
    var from = +el.dataset.v || 0; el.dataset.v = to;
    if (reduceMotion || from === to) { el.textContent = to; return; }
    var t0 = performance.now(), dur = 700;
    function step(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- render: hero ---------- */
  function renderHero() {
    $('#heroYear').textContent = String(T.getFullYear());
    $('#heroWeek').textContent = t('第 {n} 周', { n: isoWeek(T) });
    $('#heroDay').textContent = F.wdLong(dow(T));
    $('#heroMonth').textContent = pad(T.getMonth() + 1);
    $('#heroDate').textContent = pad(T.getDate());
    $('#motto').textContent = mottoText();
    var m = T.getMonth(), season = m < 2 || m === 11 ? '冬' : m < 5 ? '春' : m < 8 ? '夏' : '秋';
    $('#calSeason').textContent = isEn() ? { '春': 'SPRING', '夏': 'SUMMER', '秋': 'FALL', '冬': 'WINTER' }[season] : season + '季';
    $('#calNum').textContent = pad(T.getDate());
    $('#calDow').textContent = F.wdShort(dow(T));
    $('#heroTag').textContent = t(SKIN_TAG[curSkin()] || '');
    $('#todaySkin').textContent = t(SKIN_LEDE[curSkin()] || '');
  }
  var SKIN_TAG = { cuties: '☀ 三小只在晒太阳，打个卡叫醒它们～', farm: '☀ 晴 · 宜浇水', arcade: '▶ PLAYER 1 · READY', night: '☾ 晚风很轻 · 适合慢慢来' };
  var SKIN_LEDE = { cuties: '打卡＝浇水，小花会慢慢开，这周做够了就开花。', farm: '每打一次卡就浇一次水，这周做够了，作物就会丰收。', arcade: '每次打卡 +10 XP，这周做够就能充满电。', night: '每打一次卡，月亮就圆一点，这周做够就是满月。' };
  function renderSummary() {
    var k = keyOf(T);
    var sched = state.habits.filter(function (h) { return isSched(h, T); });
    var done = sched.filter(function (h) { return isDone(h.id, k); }).length;
    var pct = sched.length ? Math.round(done / sched.length * 100) : 0;
    var C = 2 * Math.PI * 80;
    $('#ringBar').style.strokeDashoffset = String(C * (1 - pct / 100));
    countTo($('#ringPct'), pct);
    $('#ringCount').textContent = done + ' / ' + sched.length;
    $('.today-ring').classList.toggle('is-full', sched.length > 0 && done === sched.length);
    $('.today-ring').setAttribute('aria-label', t('今天的完成度 {pct}%，{done} / {total} 项', { pct: pct, done: done, total: sched.length }));
    var segs = ''; for (var si = 0; si < Math.max(sched.length, 1); si++) segs += '<i' + (si < done ? ' class="on"' : '') + '></i>';
    $('#todaySegs').innerHTML = segs;
    var left = sched.length - done;
    $('#heroHint').textContent = $('#ringHint').textContent = !state.habits.length ? t('还没有习惯，从一件小事开始吧。') : !sched.length ? t('今天没有安排，休息一下。') : left === 0 ? t('今天的都完成了。') : t('今天还有 {n} 项待完成。', { n: left });

    // stats
    var best = 0, bestName = '—';
    state.habits.forEach(function (h) { if (isWeekly(h)) return; var s = streak(h); if (s > best) { best = s; bestName = h.name; } });
    countTo($('#statStreak'), best);
    $('#statStreak').nextElementSibling.textContent = isEn() ? (best === 1 ? 'day' : 'days') : '天';
    renderHud();
    $('#statStreakSub').textContent = best ? t('「{name}」', { name: bestName }) : t('从今天开始');

    var ws = startOfWeek(T), ws_s = 0, ws_d = 0;
    for (var i = 0; i < 7; i++) {
      var d = addDays(ws, i); if (d > T) break;
      var kk = keyOf(d);
      state.habits.forEach(function (h) { if (parseKey(h.created) <= d && isSched(h, d)) { ws_s++; if (isDone(h.id, kk)) ws_d++; } });
    }
    var wp = ws_s ? Math.round(ws_d / ws_s * 100) : 0;
    countTo($('#statWeek'), wp);
    $('#statWeekSub').textContent = t('{d} / {s} 次 · 截至今天', { d: ws_d, s: ws_s });

    var tt = 0, td = 0, gDone = 0;
    state.goals.forEach(function (g) { tt += g.tasks.length; var c = g.tasks.filter(function (t) { return t.done; }).length; td += c; if (g.tasks.length && c === g.tasks.length) gDone++; });
    countTo($('#statGoals'), tt ? Math.round(td / tt * 100) : 0);
    $('#statGoalsSub').textContent = t('{g} 个目标 · {c} 个已达成', { g: state.goals.length, c: gDone });

    var total = 0; Object.keys(state.log).forEach(function (kk) { total += state.log[kk].length; });
    countTo($('#statTotal'), total);
    var firstKey = Object.keys(state.log).sort()[0];
    $('#statTotalSub').textContent = firstKey ? t('自 {date} 起', { date: md(parseKey(firstKey)) }) : t('还没有记录');
  }

  /* ---------- render: habits ---------- */
  var STAGE_NAMES = {
    farm: ['种子', '发芽', '幼苗', '茁壮', '丰收'],
    arcade: ['LV 0', 'LV 1', 'LV 2', 'LV 3', 'MAX'],
    night: ['新月', '蛾眉月', '上弦月', '盈凸月', '满月'],
    cuties: ['种子', '发芽', '长叶', '花苞', '开花']
  };
  function unitText(h, n) { return isWeekly(h) ? (isEn() ? (n === 1 ? 'week' : 'weeks') : '周') : (isEn() ? (n === 1 ? 'day' : 'days') : '天'); }
  function streakLabel(h, n) { return isWeekly(h) ? t('连续 {n} 周达标', { n: n }) : t('连续 {n} 天', { n: n }); }
  function plotHtml(h) {
    if (!isPx()) return '';
    var wp = weekProgress(h), st = SKIN.stage(wp.done, wp.target), sk = curSkin();
    return '<span class="plot plot--' + st + '" data-act="toggle" aria-hidden="true">' + SKIN.sprite(sk, st, area(h.area).color) + '</span>';
  }
  function stageHtml(h) {
    var wp = weekProgress(h), st = isPx() ? SKIN.stage(wp.done, wp.target) : 0;
    var label = t('这周 {d}/{s}', { d: wp.done, s: wp.target });
    return '<span class="habit__week">' + (isPx() ? '<b class="stage stage--' + st + '">' + t(STAGE_NAMES[curSkin()][st]) + '</b>' : '') + '<span>' + label + '</span></span>';
  }
  function habitRow(h, i) {
    var k = keyOf(T), done = isDone(h.id, k), s = streak(h), a = area(h.area);
    var strip = '';
    for (var j = 6; j >= 0; j--) {
      var d = addDays(T, -j), dk = keyOf(d);
      var cls = isDone(h.id, dk) ? 'on' : (required(h, d) ? '' : 'off');
      strip += '<i class="' + cls + (j === 0 ? ' today' : '') + '"></i>';
    }
    return '<li class="habit' + (done ? ' is-done' : '') + '" data-id="' + esc(h.id) + '" data-freq="' + h.freq + '" style="--i:' + i + ';--c:' + areaColor(h.area) + '">' + plotHtml(h) +
      '<button class="seal" type="button" role="checkbox" aria-checked="' + done + '" aria-label="' + esc(h.name) + '" data-act="toggle">' +
        '<span class="seal__frame"></span><span class="seal__ink"></span><span class="seal__char" aria-hidden="true">' + esc(h.seal) + '</span>' +
        '<svg class="seal__check" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4L18 8"/></svg></button>' +
      '<div class="habit__body"><p class="habit__name">' + esc(h.name) + '</p>' +
        '<p class="habit__meta"><span class="dot"></span>' + esc(a.name) + ' · ' + freqText(h) + stageHtml(h) + '</p></div>' +
      '<div class="habit__strip" aria-hidden="true" title="' + t('最近 7 天') + '">' + strip + '</div>' +
      '<div class="habit__streak' + (s >= (isWeekly(h) ? 4 : 7) ? ' is-hot' : '') + '" aria-label="' + streakLabel(h, s) + '"><span class="num">' + s + '</span><span class="u">' + (isEn() ? '' : unitText(h, s)) + '</span><span class="lbl">' + (isEn() ? unitText(h, s) : '连续') + '</span></div>' +
      '<button class="icon-btn habit__note' + (state.notes[k] ? ' has-note' : '') + '" type="button" data-act="note" aria-label="' + esc(t('写一句今天的笔记（{name}）', { name: h.name })) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10l4 4v12H5Z"/><path d="M8 11h8M8 15h5"/></svg></button>' +
    '</li>';
  }
  function habitGroups() {
    var on = [], flex = [], off = [];
    state.habits.forEach(function (h) {
      if (required(h, T)) on.push(h);
      else if (isWeekly(h) && weekDone(h, startOfWeek(T)) < h.target) flex.push(h);
      else off.push(h);
    });
    return { on: on, flex: flex, off: off };
  }
  function renderHabits() {
    var g = habitGroups(), n = 0;
    function rows(list) { return list.map(function (h) { return habitRow(h, n++); }).join(''); }
    $('#habitList').innerHTML = rows(g.on);
    $('#habitFlexList').innerHTML = rows(g.flex);
    $('#habitFlexWrap').hidden = !g.flex.length;
    $('#habitOffList').innerHTML = rows(g.off);
    $('#habitOffWrap').hidden = !g.off.length;
    $('#habitEmpty').hidden = state.habits.length > 0;
    paintNote();
  }
  function refreshHabitRow(hid) {
    var li = $('.habit[data-id="' + cssEsc(hid) + '"]');
    var h = state.habits.filter(function (x) { return x.id === hid; })[0];
    if (!li || !h) return;
    var done = isDone(hid, keyOf(T)), s = streak(h);
    li.classList.toggle('is-done', done);
    var btn = $('.seal', li); btn.setAttribute('aria-checked', String(done));
    var st = $('.habit__streak', li);
    $('.num', st).textContent = s; st.setAttribute('aria-label', streakLabel(h, s));
    $('.u', st).textContent = isEn() ? '' : unitText(h, s); if (isEn()) $('.lbl', st).textContent = unitText(h, s);
    st.classList.toggle('is-hot', s >= (isWeekly(h) ? 4 : 7));
    st.classList.remove('is-bump'); void st.offsetWidth; if (done) { st.classList.add('is-bump'); setTimeout(function () { st.classList.remove('is-bump'); }, 420); }
    var last = $('.habit__strip i.today', li); if (last) { last.classList.toggle('on', done); last.classList.toggle('off', !done && !required(h, T)); }
    var plot = $('.plot', li); if (plot) plot.outerHTML = plotHtml(h);
    var wk = $('.habit__week', li); if (wk) wk.outerHTML = stageHtml(h);
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  /* ---------- render: week ---------- */
  function renderWeek() {
    var ws = addDays(startOfWeek(T), weekOffset * 7);
    var tk = keyOf(T);
    var we = addDays(ws, 6);
    $('#weekLabel').textContent = F.range(ws, we) + (weekOffset === 0 ? ' · ' + t('本周') : '');
    $('#weekNext').disabled = weekOffset >= 0;
    $('#weekNow').hidden = weekOffset === 0;
    var head = '<tr><th scope="col"><span class="sr-only">' + t('习惯') + '</span></th>';
    for (var i = 0; i < 7; i++) {
      var d = addDays(ws, i);
      head += '<th scope="col" class="' + (keyOf(d) === tk ? 'is-today' : '') + '">' + F.wdShort(i) + '<b>' + d.getDate() + '</b></th>';
    }
    $('#weekTable thead').innerHTML = head + '</tr>';
    var body = '';
    var check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    state.habits.forEach(function (h) {
      body += '<tr><th scope="row" title="' + esc(h.name) + '" style="--c:' + areaColor(h.area) + '"><span class="dot"></span><span class="wk-seal" aria-hidden="true">' + esc(h.seal) + '</span><span class="wk-name">' + esc(h.name) + '</span>' + wkCount(h, ws) + '</th>';
      for (var i = 0; i < 7; i++) {
        var d = addDays(ws, i), k = keyOf(d), done = isDone(h.id, k), fut = d > T, sch = isWeekly(h) ? !weekMet(h, ws, d) : onDay(h, d);
        body += '<td class="' + (k === tk ? 'is-today' : '') + '"><button type="button" class="cell' + (sch ? '' : ' is-rest') + '" role="checkbox" aria-checked="' + done + '"' + (fut ? ' disabled' : '') +
          ' data-act="cell" data-h="' + esc(h.id) + '" data-k="' + k + '" aria-label="' + esc(h.name) + ' · ' + (isEn() ? F.wdLong(i) + ', ' + mdLong(d) : mdLong(d) + ' ' + F.wdLong(i)) + (sch ? '' : t('（不需要打卡）')) + '">' + check + '</button></td>';
      }
      body += '</tr>';
    });
    if (!state.habits.length) body = '<tr><td colspan="8" class="week__empty">' + esc(t('添加习惯后，这里会显示每一天的打卡。')) + '</td></tr>';
    $('#weekTable tbody').innerHTML = body;
    renderWeekFoot();
  }
  /* 每周 N 次：这周在 d 之前已经达标 → d 那格显示成「不需要打卡」 */
  function weekMet(h, ws, d) { var n = 0; for (var x = ws; x < d; x = addDays(x, 1)) if (isDone(h.id, keyOf(x))) n++; return n >= h.target; }
  function wkCount(h, ws) {
    var wp = weekProgress(h, ws), sc = wp.target, dn = wp.done;
    return '<span class="wk-count' + (sc && dn >= sc ? ' is-full' : '') + '" aria-label="' + t('这周完成 {d} 次，目标 {s} 次', { d: dn, s: sc }) + '">' + (sc ? dn + '/' + sc : (wp.extra ? '+' + wp.extra : '—')) + '</span>';
  }
  function renderWeekFoot() {
    var ws = addDays(startOfWeek(T), weekOffset * 7);
    var foot = '<tr><th scope="row">' + t('完成') + '</th>';
    for (var i = 0; i < 7; i++) {
      var d = addDays(ws, i);
      if (d > T) { foot += '<td>—</td>'; continue; }
      var r = Math.round(dayRatio(d) * 100);
      foot += '<td><div class="bar-v"><i style="--h:' + r + '%"></i></div>' + r + '%</td>';
    }
    $('#weekTable tfoot').innerHTML = state.habits.length ? foot + '</tr>' : '';
  }

  /* ---------- render: 这一年（年度热力图 + 那天 + 每个习惯的数据 + 笔记） ----------
   * 53 周 × 7 天，每格是一个按钮（方向键移动，回车选中），右边 / 下面显示选中那天的打卡和笔记。手机上横向滚动，默认滚到今天。 */
  var selDay = null, yearFocus = null;
  function heatLevel(r) { return r === 0 ? 0 : r < .34 ? 1 : r < .67 ? 2 : r < 1 ? 3 : 4; }
  function dayLabel(d) { return isEn() ? F.wdLong(dow(d)) + ', ' + mdLong(d) : mdLong(d) + ' ' + F.wdLong(dow(d)); }
  function renderHeat() {
    var weeks = 53;
    var start = addDays(startOfWeek(T), -(weeks - 1) * 7), html = '', months = '', sum = 0, cnt = 0, full = 0;
    var firstLog = Object.keys(state.log).sort()[0];
    var origin = firstLog ? parseKey(firstLog) : T;
    var bestW = -1, bestWStart = null, lastMonth = -1, tk = keyOf(T);
    if (!selDay || selDay > T || selDay < start) selDay = T;
    var sk = keyOf(selDay), fk = yearFocus && yearFocus <= T && yearFocus >= start ? keyOf(yearFocus) : sk;
    for (var w = 0; w < weeks; w++) {
      var wsd = addDays(start, w * 7);
      var m = wsd.getMonth();
      months += '<span>' + (m !== lastMonth && (w > 0 || wsd.getDate() <= 7) ? F.month(m) : '') + '</span>';
      lastMonth = m;
      var wsum = 0, wcnt = 0;
      for (var j = 0; j < 7; j++) {
        var i = w * 7 + j, d = addDays(start, i), k = keyOf(d);
        if (d > T) { html += '<i class="is-future" aria-hidden="true"></i>'; continue; }
        var r = dayRatio(d), l = heatLevel(r), note = state.notes[k];
        if (d >= origin) { sum += r; cnt++; wsum += r; wcnt++; if (r >= 1) full++; }
        html += '<button type="button" class="hc' + (k === tk ? ' is-today' : '') + (note ? ' has-note' : '') + '" data-l="' + l + '" data-k="' + k + '" tabindex="' + (k === fk ? 0 : -1) + '" aria-pressed="' + (k === sk) + '" aria-label="' + esc(dayLabel(d) + ' · ' + Math.round(r * 100) + '%' + (note ? ' · ' + t('有笔记') : '')) + '"></button>';
      }
      if (wcnt >= 5 && wsum / wcnt > bestW) { bestW = wsum / wcnt; bestWStart = wsd; }
    }
    var g = $('#heatGrid'), hadFocus = g.contains(document.activeElement);
    g.innerHTML = html;
    if (hadFocus) { var f = $('[tabindex="0"]', g); if (f) f.focus(); }
    $('#heatMonths').innerHTML = months;
    var avg = cnt ? Math.round(sum / cnt * 100) : 0;
    $('#heatSpan').textContent = t('这一年');
    g.setAttribute('aria-label', t('近 {w} 周完成热力图，平均完成率 {avg}%，全勤 {full} 天', { w: weeks, avg: avg, full: full }));
    $('#heatAvg').innerHTML = avg + '<small>%</small>';
    $('#heatFull').innerHTML = full + '<small>' + (isEn() ? (full === 1 ? 'day' : 'days') : '天') + '</small>';
    $('#heatBest').innerHTML = bestWStart ? Math.round(bestW * 100) + '<small>' + esc(t('% · {date} 周', { date: isEn() ? md(bestWStart) : (bestWStart.getMonth() + 1) + '.' + bestWStart.getDate() })) + '</small>' : '—';
    renderDayCard(); renderHabitStats(); renderNotes();
    if (!yearScrolled) scrollYear();
  }
  var yearScrolled = false;
  function scrollYear() {
    var sc = $('#yearScroll'); if (!sc || !sc.clientWidth) return;
    yearScrolled = true; sc.scrollLeft = sc.scrollWidth;
  }
  $('#heatGrid').addEventListener('click', function (e) {
    var b = e.target.closest('.hc'); if (!b) return;
    selDay = yearFocus = parseKey(b.dataset.k); renderHeat();
    var again = $('#heatGrid [data-k="' + b.dataset.k + '"]'); if (again) again.focus();
  });
  $('#heatGrid').addEventListener('keydown', function (e) {
    var b = e.target.closest('.hc'); if (!b) return;
    var step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7, Home: -dow(parseKey(b.dataset.k)), End: 6 - dow(parseKey(b.dataset.k)) }[e.key];
    if (step == null) return;
    e.preventDefault();
    var d = addDays(parseKey(b.dataset.k), step), n = $('#heatGrid [data-k="' + keyOf(d) + '"]');
    if (!n) return;
    b.tabIndex = -1; n.tabIndex = 0; n.focus(); yearFocus = d;
  });
  function stepDay(n) { var d = addDays(selDay || T, n); if (d > T) return; selDay = yearFocus = d; renderHeat(); }
  $('#dayPrev').addEventListener('click', function () { stepDay(-1); });
  $('#dayNext').addEventListener('click', function () { stepDay(1); });
  function renderDayCard() {
    var d = selDay || T, k = keyOf(d), isT = k === keyOf(T);
    $('#dayCardTitle').textContent = isT ? t('今天') + ' · ' + dayLabel(d) : dayLabel(d);
    $('#dayNext').disabled = isT;
    var req = 0, dn = 0, items = '';
    state.habits.forEach(function (h) {
      if (parseKey(h.created) > d) return;
      var done = isDone(h.id, k), rq = required(h, d);
      if (rq) { req++; if (done) dn++; }
      if (!rq && !done) return;
      items += '<li class="' + (done ? 'is-on' : '') + '" style="--c:' + areaColor(h.area) + '"><span class="daycard__mk" aria-hidden="true"></span>' + esc(h.name) + '<span class="sr-only">' + (done ? t('（已完成）') : t('（未完成）')) + '</span></li>';
    });
    $('#dayList').innerHTML = items || '<li class="daycard__none">' + esc(t('那天没有需要打卡的习惯。')) + '</li>';
    $('#daySum').textContent = req ? t('完成 {d} / {s} 项 · {p}%', { d: dn, s: req, p: Math.round(dn / req * 100) }) : (dn ? t('额外完成 {n} 项', { n: dn }) : '');
    $('#dayNoteK').textContent = isT ? t('今天做了什么') : t('那天做了什么');
    var inp = $('#dayNoteIn'); if (document.activeElement !== inp) inp.value = state.notes[k] || '';
  }
  function renderHabitStats() {
    var ws = startOfWeek(T), rows = state.habits.map(function (h) {
      var wp = weekProgress(h, ws), pct = wp.target ? Math.round(wp.done / wp.target * 100) : 0, c = streak(h), b = bestStreak(h);
      return '<tr style="--c:' + areaColor(h.area) + '"><th scope="row"><span class="dot"></span>' + esc(h.name) + '<small>' + esc(freqText(h)) + '</small></th>' +
        '<td>' + c + '<small>' + unitText(h, c) + '</small></td><td>' + b + '<small>' + unitText(h, b) + '</small></td>' +
        '<td><span class="hstats__bar" aria-hidden="true"><i style="--p:' + pct + '%"></i></span>' + (wp.target ? pct + '%' : '—') + '</td></tr>';
    }).join('');
    $('#hstats tbody').innerHTML = rows || '<tr><td colspan="4" class="week__empty">' + esc(t('添加习惯后，这里会显示连续次数。')) + '</td></tr>';
  }
  function renderNotes() {
    var ks = Object.keys(state.notes).sort().reverse().slice(0, 8);
    $('#notesList').innerHTML = ks.map(function (k) { return '<li><button type="button" class="notes-hist__k" data-note-k="' + k + '">' + esc(md(parseKey(k))) + '</button><span>' + esc(state.notes[k]) + '</span></li>'; }).join('');
    $('#notesEmpty').hidden = ks.length > 0;
  }
  $('#notesList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-note-k]'); if (!b) return;
    selDay = yearFocus = parseKey(b.dataset.noteK); renderHeat();
    var c = $('#heatGrid [data-k="' + b.dataset.noteK + '"]'); if (c) { c.focus(); c.scrollIntoView({ block: 'nearest', inline: 'center' }); }
  });
  /* ---------- 每天一句笔记 ---------- */
  function setNote(k, v) {
    v = String(v || '').trim().slice(0, 80);
    if ((state.notes[k] || '') === v) return false;
    if (v) state.notes[k] = v; else delete state.notes[k];
    save(); return true;
  }
  function paintNote() { var inp = $('#noteIn'); if (inp && document.activeElement !== inp) inp.value = state.notes[keyOf(T)] || ''; }
  function bindNote(form, input, keyFn) {
    function commit(showToast) {
      if (setNote(keyFn(), input.value)) { renderHeat(); paintNote(); if (showToast) toast(input.value.trim() ? t('笔记已记下') : t('笔记已删除'), '记'); }
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); commit(true); });
    input.addEventListener('change', function () { commit(false); });
  }
  bindNote($('#noteForm'), $('#noteIn'), function () { return keyOf(T); });
  bindNote($('#dayNoteForm'), $('#dayNoteIn'), function () { return keyOf(selDay || T); });

  /* ---------- render: goals ---------- */
  function renderChips() {
    var counts = {}; state.goals.forEach(function (g) { counts[g.area] = (counts[g.area] || 0) + 1; });
    if (filter !== 'all' && !state.areas.some(function (a) { return a.id === filter; })) filter = 'all';
    var html = '<button class="chip" type="button" data-filter="all" aria-pressed="' + (filter === 'all') + '">' + t('全部') + ' <span class="n">' + state.goals.length + '</span></button>';
    state.areas.forEach(function (a) {
      html += '<button class="chip" type="button" data-filter="' + esc(a.id) + '" aria-pressed="' + (filter === a.id) + '"><span class="dot" style="--c:var(--a-' + a.color + ')"></span>' + esc(a.name) + ' <span class="n">' + (counts[a.id] || 0) + '</span></button>';
    });
    $('#areaChips').innerHTML = html;
  }
  function dueText(g) {
    if (!g.due) return { t: t('长期'), soon: false };
    var n = daysBetween(T, parseKey(g.due));
    if (n < 0) return { t: t('已过期 {n} 天', { n: -n }), soon: true };
    if (n === 0) return { t: t('今天截止'), soon: true };
    return { t: t('还剩 {n} 天 · {date}', { n: n, date: md(parseKey(g.due)) }), soon: n <= 14 };
  }
  function goalCard(g, i) {
    var a = area(g.area), done = g.tasks.filter(function (t) { return t.done; }).length, tot = g.tasks.length;
    var p = tot ? Math.round(done / tot * 100) : 0, complete = tot > 0 && done === tot, du = dueText(g);
    var tasks = g.tasks.map(function (t) {
      return '<li class="task"><label><input type="checkbox" data-act="task" data-t="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + '><span>' + esc(t.text) + '</span></label></li>';
    }).join('');
    return '<article class="goal' + (complete ? ' is-complete' : '') + '" data-id="' + esc(g.id) + '" style="--i:' + i + ';--c:var(--a-' + a.color + ')" aria-labelledby="gt-' + esc(g.id) + '">' +
      '<div class="goal__top"><span class="tag"><span class="dot"></span>' + esc(a.name) + '</span>' + (complete ? '<span class="goal__done-seal">' + t('已完成') + '</span>' : '') + '<span class="due' + (du.soon && !complete ? ' is-soon' : '') + '">' + du.t + '</span></div>' +
      '<h3 class="goal__title" id="gt-' + esc(g.id) + '">' + esc(g.title) + '</h3>' +
      (g.note ? '<p class="goal__note">' + esc(g.note) + '</p>' : '') +
      '<div class="goal__progress"><div class="bar" role="progressbar" aria-label="' + t('进度') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i style="--p:' + p + '%"></i></div><span class="goal__pct">' + done + '/' + tot + '</span></div>' +
      '<ul class="tasks">' + tasks + '</ul>' +
      '<form class="task-add" data-act="add-task"><label class="sr-only" for="ta-' + esc(g.id) + '">' + esc(t('为「{t}」添加步骤', { t: g.title })) + '</label><input id="ta-' + esc(g.id) + '" placeholder="' + t('＋ 添加一个步骤，回车保存') + '" maxlength="80" autocomplete="off"></form>' +
      '<div class="goal__foot">' +
        '<button class="icon-btn" type="button" data-act="edit-goal" aria-label="' + esc(t('编辑目标「{t}」', { t: g.title })) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg></button>' +
        '<button class="icon-btn" type="button" data-act="del-goal" aria-label="' + esc(t('删除目标「{t}」', { t: g.title })) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button>' +
      '</div></article>';
  }
  function renderGoals() {
    renderChips();
    var list = state.goals.filter(function (g) { return filter === 'all' || g.area === filter; });
    // group by area order
    var order = state.areas.map(function (a) { return a.id; });
    list.sort(function (a, b) { return order.indexOf(a.area) - order.indexOf(b.area); });
    $('#goalGrid').innerHTML = list.map(goalCard).join('');
    $('#goalEmpty').hidden = list.length > 0;
  }
  function refreshGoalCard(gid) {
    var g = state.goals.filter(function (x) { return x.id === gid; })[0], el = $('.goal[data-id="' + cssEsc(gid) + '"]');
    if (!g || !el) return;
    var done = g.tasks.filter(function (t) { return t.done; }).length, tot = g.tasks.length, p = tot ? Math.round(done / tot * 100) : 0;
    var bar = $('.bar', el); bar.setAttribute('aria-valuenow', p); $('i', bar).style.setProperty('--p', p + '%');
    $('.goal__pct', el).textContent = done + '/' + tot;
    var complete = tot > 0 && done === tot, was = el.classList.contains('is-complete');
    el.classList.toggle('is-complete', complete);
    var seal = $('.goal__done-seal', el);
    if (complete && !seal) { var s = document.createElement('span'); s.className = 'goal__done-seal'; s.textContent = t('已完成'); $('.goal__top', el).insertBefore(s, $('.due', el)); }
    if (!complete && seal) seal.remove();
    var du = dueText(g); $('.due', el).classList.toggle('is-soon', du.soon && !complete);
    return complete && !was;
  }

  function renderAll() {
    T = today();
    if (state.prefs && applySkin(state.prefs.theme)) setTimeout(drawScenes, 0);
    renderHero(); renderHabits(); renderWeek(); renderHeat(); renderGoals(); renderSummary(); updateDataSize(); renderMgr();
  }
  function updateDataSize() {
    var n = 0; try { n = (localStorage.getItem(KEY) || '').length; } catch (e) {}
    $('#dataSize').textContent = t('{h} 个习惯 · {g} 个目标 · {kb} KB', { h: state.habits.length, g: state.goals.length, kb: (n / 1024).toFixed(1) });
  }

  /* ---------- feedback ---------- */
  function toast(msg, sealChar, action) {
    if (onbBusy() && !action) return;   // 新手指引进行中：提示气泡本身就是反馈，不再叠一条 toast
    // 一次只显示一条：新的替换旧的（旧的立刻淡出，不叠在一起）
    $$('#toasts .toast').forEach(function (o) { o.classList.add('is-out'); o.setAttribute('aria-hidden', 'true'); setTimeout(function () { o.remove(); }, 200); });
    var el = document.createElement('div');
    el.className = 'toast';
    var warn = sealChar === '!';
    if (warn) el.classList.add('toast--warn');
    el.innerHTML = '<span class="toast__mark" aria-hidden="true">' + (warn ? '!' : '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4L18 8"/></svg>') + '</span><span>' + esc(msg) + '</span>';
    if (action) { var b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.addEventListener('click', function () { action.fn(); dismiss(); }); el.appendChild(b); }
    $('#toasts').appendChild(el);
    var timer = setTimeout(dismiss, action ? 6000 : 2800);
    function dismiss() { clearTimeout(timer); el.classList.add('is-out'); setTimeout(function () { el.remove(); }, 360); }
  }
  /* ---------- actions ---------- */
  /* 打卡反馈：田园浇水、电玩金币 +10 XP、星夜闪光（减弱动态时不播） */
  var FX_TEXT = { farm: '浇水 +1', arcade: '+10 XP', night: '点亮 +1', cuties: '开心 +1' };
  function checkFx(btn) {
    if (!isPx() || !btn) return;
    var li = btn.closest('.habit'), target = li ? $('.plot', li) || btn : btn;
    SKIN.fx(target, curSkin(), t(FX_TEXT[curSkin()]));
    if (curSkin() === HIDDEN_SKIN && window.Crew) Crew.wake();
  }
  function toggleToday(hid, btn) {
    var k = keyOf(T), h = state.habits.filter(function (x) { return x.id === hid; })[0];
    if (!h) return;
    var on = !isDone(hid, k);
    var schedBefore = state.habits.filter(function (x) { return isSched(x, T); });
    var allBefore = schedBefore.length && schedBefore.every(function (x) { return isDone(x.id, k); });
    setDone(hid, k, on); save();
    if (on && btn) {
      btn.classList.remove('is-stamping'); void btn.offsetWidth; btn.classList.add('is-stamping');
      setTimeout(function () { btn.classList.remove('is-stamping'); }, 600);
    }
    refreshHabitRow(hid);
    if (on && btn) checkFx(btn);
    if (on) onbChecked(hid);
    renderWeek(); renderHeat(); renderSummary();
    if (on) {
      var s = streak(h), wp = weekProgress(h);
      var allNow = schedBefore.length && schedBefore.every(function (x) { return isDone(x.id, k); });
      if (allNow && !allBefore) { toast(t('今天的计划都完成了。'), '✓'); }
      else if (isWeekly(h) && weekDone(h, startOfWeek(T)) === h.target) toast(WEEK_MILESTONES.indexOf(s) >= 0 ? t('「{name}」已连续 {n} 周达标', { name: h.name, n: s }) : t('「{name}」这周的 {n} 次完成了', { name: h.name, n: h.target }), h.seal);
      else if (!isWeekly(h) && MILESTONES.indexOf(s) >= 0) toast(t('「{name}」已连续 {n} 天', { name: h.name, n: s }), h.seal);
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act],[data-action],[data-filter],[data-close]');
    if (!el) return;
    if (el.hasAttribute('data-close')) { el.closest('dialog').close('cancel'); return; }
    if (el.dataset.filter) { filter = el.dataset.filter; renderGoals(); return; }
    var act = el.dataset.act || el.dataset.action;
    var habitLi = el.closest('.habit'), goalEl = el.closest('.goal');
    switch (act) {
      case 'toggle': toggleToday(habitLi.dataset.id, $('.seal', habitLi)); break;
      case 'cell': {
        var hid = el.dataset.h, k = el.dataset.k, on = !isDone(hid, k);
        setDone(hid, k, on); save();
        el.setAttribute('aria-checked', String(on));
        var wc = el.closest('tr').querySelector('.wk-count');
        if (wc) wc.outerHTML = wkCount(state.habits.filter(function (x) { return x.id === hid; })[0], addDays(startOfWeek(T), weekOffset * 7));
        if (k === keyOf(T)) { refreshHabitRow(hid); var sb = $('.habit[data-id="' + cssEsc(hid) + '"] .seal'); if (on && sb) { sb.classList.add('is-stamping'); setTimeout(function () { sb.classList.remove('is-stamping'); }, 600); } }
        if (k !== keyOf(T) || $$('.habit[data-freq="weekly"]').length) renderHabits();
        var hh = state.habits.filter(function (x) { return x.id === hid; })[0];
        if (hh && isWeekly(hh)) {
          var hadF = document.activeElement === el; renderWeek();
          el = $('#weekTable .cell[data-h="' + cssEsc(hid) + '"][data-k="' + k + '"]') || el; if (hadF) el.focus();
        } else renderWeekFoot();
        if (on) checkFx(el);
        renderHeat(); renderSummary();
        break;
      }
      case 'edit-habit': openHabit(habitLi.dataset.id); break;
      case 'note': openNote(habitLi && habitLi.dataset.id); break;
      case 'mgr-edit': openHabit(el.closest('.mgr__row').dataset.id); break;
      case 'mgr-up': case 'mgr-down': moveHabit(el.closest('.mgr__row').dataset.id, act === 'mgr-up' ? -1 : 1); break;
      case 'mgr-arch': archiveHabit(el.closest('.mgr__row').dataset.id, true); break;
      case 'mgr-unarch': archiveHabit(el.closest('.mgr__row').dataset.id, false); break;
      case 'add-habit': openHabit(null); break;
      case 'add-goal': openGoal(null); break;
      case 'edit-goal': openGoal(goalEl.dataset.id); break;
      case 'del-goal': {
        var gid = goalEl.dataset.id, g = state.goals.filter(function (x) { return x.id === gid; })[0];
        confirmDlg(t('删除目标'), t('「{t}」及其 {n} 个步骤将被删除。', { t: g.title, n: g.tasks.length }), t('删除')).then(function (ok) {
          if (!ok) return;
          var idx = state.goals.indexOf(g); state.goals.splice(idx, 1); save(); renderGoals(); renderSummary();
          toast(t('已删除目标'), '删', { label: t('撤销'), fn: function () { state.goals.splice(idx, 0, g); save(); renderGoals(); renderSummary(); } });
        });
        break;
      }
      case 'edit-areas': openAreas(); break;
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.act === 'task') {
      var gid = el.closest('.goal').dataset.id, g = state.goals.filter(function (x) { return x.id === gid; })[0];
      var task = g.tasks.filter(function (x) { return x.id === el.dataset.t; })[0];
      task.done = el.checked; save();
      var justDone = refreshGoalCard(gid); renderSummary();
      if (justDone) toast(t('目标达成：「{t}」', { t: g.title }), '✓');
    }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.dataset && f.dataset.act === 'add-task') {
      e.preventDefault();
      var inp = $('input', f), v = inp.value.trim(); if (!v) return;
      var gid = f.closest('.goal').dataset.id, g = state.goals.filter(function (x) { return x.id === gid; })[0];
      g.tasks.push({ id: uid(), text: v, done: false }); save();
      renderGoals(); renderSummary();
      var again = $('#ta-' + cssEsc(gid)); if (again) again.focus();
    }
  });

  /* ---------- dialogs ---------- */
  function fillAreaSelect(sel, val) {
    sel.innerHTML = state.areas.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join('');
    sel.value = val || (filter !== 'all' ? filter : state.areas[0].id);
  }
  var editingHabit = null;
  function openHabit(id) {
    var h = id ? state.habits.filter(function (x) { return x.id === id; })[0] : null;
    editingHabit = h;
    $('#dlgHabitTitle').textContent = h ? t('编辑习惯') : t('新习惯');
    $('#hName').value = h ? h.name : '';
    $('#hSeal').value = h ? h.seal : '';
    fillAreaSelect($('#hArea'), h && h.area);
    var days = h && h.freq === 'days' ? h.days : [0, 1, 2, 3, 4, 5, 6];
    $('#hDays').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<label class="day"><input type="checkbox" value="' + i + '"' + (days.indexOf(i) >= 0 ? ' checked' : '') + ' aria-label="' + F.wdLong(i) + '"><span aria-hidden="true">' + F.wdShort(i) + '</span></label>'; }).join('');
    var fr = h ? h.freq : 'daily';
    $$('#hFreq input').forEach(function (r) { r.checked = r.value === fr; });
    $('#hTarget').value = h && h.freq === 'weekly' ? h.target : 3;
    paintFreq();
    $('#hDelete').hidden = !h;
    $('#dlgHabit').showModal();
    $('#hName').focus();
  }
  function curFreq() { var r = $('#hFreq input:checked'); return r ? r.value : 'daily'; }
  function paintFreq() {
    var f = curFreq();
    $('#hDays').hidden = f !== 'days';
    $('#hTargetRow').hidden = f !== 'weekly';
  }
  $('#hFreq').addEventListener('change', paintFreq);
  $('#hName').addEventListener('input', function () { $('#hSeal').placeholder = this.value.trim().charAt(0) || t('读'); });
  $('#formHabit').addEventListener('submit', function (e) {
    var name = $('#hName').value.trim(); if (!name) { e.preventDefault(); return; }
    var freq = curFreq(), target = Math.round(+$('#hTarget').value);
    var days = freq === 'daily' || freq === 'weekly' ? [0, 1, 2, 3, 4, 5, 6] : freq === 'weekdays' ? [0, 1, 2, 3, 4] : $$('#hDays input:checked').map(function (x) { return +x.value; });
    if (!days.length) { e.preventDefault(); toast(t('请至少选择一天'), '!'); return; }
    if (freq === 'weekly' && !(target >= 1 && target <= 7)) { e.preventDefault(); toast(t('每周次数要在 1 到 7 之间'), '!'); $('#hTarget').focus(); return; }
    var seal = ($('#hSeal').value.trim() || name).charAt(0);
    var fields = { name: name, seal: seal, area: $('#hArea').value, freq: freq, days: days };
    if (freq === 'weekly') fields.target = target;
    if (editingHabit) { Object.assign(editingHabit, fields); if (freq !== 'weekly') delete editingHabit.target; toast(t('已更新「{n}」', { n: name }), seal); }
    else { fields.id = uid(); fields.created = keyOf(T); state.habits.push(fields); toast(t('新习惯「{n}」已加入', { n: name }), seal); }
    save(); renderAll();
  });
  $('#hDelete').addEventListener('click', function () {
    var h = editingHabit; $('#dlgHabit').close();
    confirmDlg(t('删除习惯'), t('「{n}」及其所有打卡记录将被删除。', { n: h.name }), t('删除')).then(function (ok) {
      if (!ok) return;
      var idx = state.habits.indexOf(h), backup = JSON.stringify(state.log);
      state.habits.splice(idx, 1);
      Object.keys(state.log).forEach(function (k) { setDone(h.id, k, false); });
      save(); renderAll();
      toast(t('已删除习惯'), '删', { label: t('撤销'), fn: function () { state.habits.splice(idx, 0, h); state.log = JSON.parse(backup); save(); renderAll(); } });
    });
  });

  var editingGoal = null;
  function openGoal(id) {
    var g = id ? state.goals.filter(function (x) { return x.id === id; })[0] : null;
    editingGoal = g;
    $('#dlgGoalTitle').textContent = g ? t('编辑目标') : t('新目标');
    $('#gTitle').value = g ? g.title : '';
    fillAreaSelect($('#gArea'), g && g.area);
    $('#gDue').value = g ? g.due : '';
    $('#gNote').value = g ? g.note : '';
    $('#gTasks').value = g ? g.tasks.map(function (t) { return t.text; }).join('\n') : '';
    $('#gDelete').hidden = !g;
    $('#dlgGoal').showModal();
    $('#gTitle').focus();
  }
  $('#formGoal').addEventListener('submit', function (e) {
    var title = $('#gTitle').value.trim(); if (!title) { e.preventDefault(); return; }
    var lines = $('#gTasks').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var old = editingGoal ? editingGoal.tasks : [];
    var tasks = lines.map(function (text) {
      var m = old.filter(function (t) { return t.text === text; })[0];
      return { id: m ? m.id : uid(), text: text.slice(0, 80), done: m ? m.done : false };
    });
    var data = { title: title, area: $('#gArea').value, due: $('#gDue').value, note: $('#gNote').value.trim(), tasks: tasks };
    if (editingGoal) { Object.assign(editingGoal, data); toast(t('目标已更新'), '改'); }
    else { data.id = uid(); state.goals.push(data); toast(t('新目标已建立'), '立'); }
    save(); renderGoals(); renderSummary(); updateDataSize();
  });
  $('#gDelete').addEventListener('click', function () {
    var g = editingGoal; $('#dlgGoal').close();
    confirmDlg(t('删除目标'), t('「{t}」将被删除。', { t: g.title }), t('删除')).then(function (ok) {
      if (!ok) return;
      var idx = state.goals.indexOf(g); state.goals.splice(idx, 1); save(); renderGoals(); renderSummary();
      toast(t('已删除目标'), '删', { label: t('撤销'), fn: function () { state.goals.splice(idx, 0, g); save(); renderGoals(); renderSummary(); } });
    });
  });

  var draftAreas = [];
  function areaRow(a, i) {
    return '<li data-i="' + i + '"><label class="sr-only" for="ar-' + i + '">' + t('领域名称') + '</label><input id="ar-' + i + '" value="' + esc(a.name) + '" maxlength="12" required>' +
      '<label class="sr-only" for="ac-' + i + '">' + t('颜色') + '</label><select id="ac-' + i + '">' + PALETTE.map(function (p) { return '<option value="' + p.key + '"' + (p.key === a.color ? ' selected' : '') + '>' + t(p.name) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="icon-btn" data-del-area="' + i + '" aria-label="' + esc(t('删除领域「{n}」', { n: a.name })) + '"' + (draftAreas.length <= 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>';
  }
  function syncDraft() { $$('#areaList li').forEach(function (li) { var i = +li.dataset.i; draftAreas[i].name = $('input', li).value; draftAreas[i].color = $('select', li).value; }); }
  function paintAreas() { $('#areaList').innerHTML = draftAreas.map(areaRow).join(''); }
  function openAreas() { draftAreas = state.areas.map(function (a) { return { id: a.id, name: a.name, color: a.color }; }); paintAreas(); $('#dlgAreas').showModal(); }
  $('#areaAdd').addEventListener('click', function () {
    syncDraft(); draftAreas.push({ id: 'a-' + uid(), name: t('新领域'), color: PALETTE[draftAreas.length % PALETTE.length].key }); paintAreas();
    var ins = $$('#areaList input'); ins[ins.length - 1].select();
  });
  $('#areaList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del-area]'); if (!b) return;
    syncDraft(); draftAreas.splice(+b.dataset.delArea, 1); paintAreas();
  });
  $('#formAreas').addEventListener('submit', function (e) {
    syncDraft();
    if (draftAreas.some(function (a) { return !a.name.trim(); })) { e.preventDefault(); toast(t('领域名称不能为空'), '!'); return; }
    draftAreas.forEach(function (a) { a.name = a.name.trim(); });
    state.areas = draftAreas;
    var ids = state.areas.map(function (a) { return a.id; });
    state.habits.forEach(function (h) { if (ids.indexOf(h.area) < 0) h.area = ids[0]; });
    state.goals.forEach(function (g) { if (ids.indexOf(g.area) < 0) g.area = ids[0]; });
    save(); renderAll(); toast(t('领域已更新'), '域');
  });

  function confirmDlg(title, text, okLabel) {
    return new Promise(function (resolve) {
      var d = $('#dlgConfirm');
      $('#dlgConfirmTitle').textContent = title; $('#dlgConfirmText').textContent = text; $('#dlgConfirmOk').textContent = okLabel || t('确定');
      d.returnValue = '';
      d.addEventListener('close', function h() { d.removeEventListener('close', h); resolve(d.returnValue === 'ok'); });
      d.showModal();
      $('.btn--ghost', d).focus();
    });
  }
  // close dialog on backdrop click
  $$('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d && !d.hasAttribute('data-sticky')) d.close('cancel'); });
  });

  $('#editMotto').addEventListener('click', function () { $('#mText').value = mottoText(); $('#dlgMotto').showModal(); $('#mText').select(); });
  $('#formMotto').addEventListener('submit', function () { var v = $('#mText').value.trim(); var l = curLang();
    if (!state.mottos) state.mottos = { zh: '', en: '' };
    state.mottos[l] = !v || isDefaultMotto(v) ? '' : v.slice(0, 60);
    state.motto = state.mottos[l] || state.mottos[l === 'en' ? 'zh' : 'en'] || defMotto(l);   // 旧版客户端读这一栏
    save(); renderHero(); });

  /* ---------- week nav ---------- */
  $('#weekPrev').addEventListener('click', function () { weekOffset--; renderWeek(); });
  $('#weekNext').addEventListener('click', function () { if (weekOffset < 0) { weekOffset++; renderWeek(); } });
  $('#weekNow').addEventListener('click', function () { weekOffset = 0; renderWeek(); $('#weekPrev').focus(); });

  /* ---------- data ---------- */
  /* 导出：JSON（完整备份，可再导入）和 CSV（每天一行，方便用表格软件看；1 = 完成，0 = 没做，空 = 那天不需要打卡） */
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function exportJson() { download('ledger-' + keyOf(T) + '.json', JSON.stringify(state, null, 2), 'application/json'); toast(t('备份已导出'), '存'); }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function buildCsv() {
    var keys = Object.keys(state.log).concat(Object.keys(state.notes)), first = T;
    state.habits.forEach(function (h) { keys.push(h.created); });
    keys.forEach(function (k) { var d = parseKey(k); if (d < first) first = d; });
    var rows = [[isEn() ? 'Date' : '时间', t('星期'), t('完成度')].concat(state.habits.map(function (h) { return h.name; }), [t('笔记')])];
    for (var d = first; d <= T; d = addDays(d, 1)) {
      var k = keyOf(d), req = 0, dn = 0, cells = state.habits.map(function (h) {
        if (parseKey(h.created) > d && !isDone(h.id, k)) return '';
        var done = isDone(h.id, k), rq = required(h, d);
        if (rq) { req++; if (done) dn++; }
        return done ? 1 : rq ? 0 : '';
      });
      rows.push([k, F.wdShort(dow(d)), req ? Math.round(dn / req * 100) + '%' : ''].concat(cells, [state.notes[k] || '']));
    }
    return '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function exportCsv() { download('ledger-' + keyOf(T) + '.csv', buildCsv(), 'text/csv;charset=utf-8'); toast(t('表格已导出'), '存'); }
  $('#exportBtn').addEventListener('click', exportJson);
  $('#csvBtn').addEventListener('click', exportCsv);
  $('#prefsJson').addEventListener('click', exportJson);
  $('#prefsCsv').addEventListener('click', exportCsv);
  $('#importLabel').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#importFile').click(); } });
  $('#importFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var input = this;
    var r = new FileReader();
    r.onload = function () {
      try { state = validate(JSON.parse(r.result)); state.prefs = keepPrefs(state.prefs); save(); renderAll(); toast(t('已导入 {h} 个习惯、{g} 个目标', { h: state.habits.length, g: state.goals.length }), '入'); }
      catch (err) { toast(t('导入失败：{m}', { m: err.message }), '!'); }
      input.value = '';
    };
    r.readAsText(f);
  });
  $('#sampleBtn').addEventListener('click', function () {
    confirmDlg(t('恢复示例'), t('当前数据将被示例计划替换。建议先导出备份。'), t('恢复')).then(function (ok) { if (ok) { state = sample(); save(); renderAll(); toast(t('示例内容已载入'), '例'); } });
  });
  $('#resetBtn').addEventListener('click', function () {
    confirmDlg(t('清空全部数据'), t('所有目标、习惯和打卡记录都会被删除，且无法撤销。领域会保留默认值。'), t('清空')).then(function (ok) { if (ok) { state = emptyState(); save(); renderAll(); toast(t('已清空，重新出发'), '新'); } });
  });

  /* ---------- scroll: sticky bar, active nav, reveal ---------- */
  var topbar = $('.topbar');
  function onScroll() { topbar.classList.toggle('is-scrolled', scrollY > 8); }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    $$('.section').forEach(function (s) { io.observe(s); });
    var navLinks = $$('.nav a');
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) navLinks.forEach(function (a) { var on = a.getAttribute('href') === '#' + en.target.id; a.classList.toggle('is-active', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('.section').forEach(function (s) { spy.observe(s); });
  } else { $$('.section').forEach(function (s) { s.classList.add('is-in'); }); }

  // date rollover (tab left open past midnight)
  document.addEventListener('visibilitychange', function () { if (!document.hidden && keyOf(today()) !== keyOf(T)) renderAll(); });

  /* ---------- v12：新手指引（3 步） ----------
   * 1. 选第一个习惯（模板 + 自己写）。全新用户：只建这 1 个习惯（不再塞示例模板）；
   * 2. 聚光在它的打卡方框上：「做完就点一下」，点完立刻有反馈（小花长一点 + 小小的庆祝）；
   * 3. 收尾：连续记录和热力图会慢慢长出来，登录后换手机也不丢。
   * 每一步都能跳过（跳过 = 结束指引）。完成标记：prefs.onboarded（随云端同步）+ 本机 growth-plan:onboarded。
   * 已经有数据的老用户不弹；登录中（还在拉取云端）先等，拉到真实数据就不弹。 */
  var ONB_KEY = 'growth-plan:onboarded';
  var ONB_TPL = {
    read: { zh: '阅读 20 分钟', en: 'Read for 20 minutes', sz: '读', se: 'R', area: 'a-study' },
    sleep: { zh: '12 点前睡觉', en: 'In bed by midnight', sz: '眠', se: 'S', area: 'a-habit' },
    move: { zh: '运动 30 分钟', en: 'Exercise for 30 minutes', sz: '动', se: 'E', area: 'a-health' },
    money: { zh: '记录今天的支出', en: 'Note today\u2019s spending', sz: '账', se: '$', area: 'a-life' }
  };
  var onb = { step: 0, hid: null, shown: false, replay: false, raf: 0 };
  function onbFlag() {
    try { if (localStorage.getItem(ONB_KEY) === '1') return true; } catch (e) {}
    if (state && state.prefs && state.prefs.onboarded) { try { localStorage.setItem(ONB_KEY, '1'); } catch (e) {} return true; }   // 云端带来的标记：镜像到本机
    return false;
  }
  /* 全新：从没动过的示例模板，或者完全空白（没有习惯、目标和打卡） */
  function pristine() {
    if (Object.keys(state.log).length) return false;
    if (!state.habits.length && !state.goals.length) return true;
    return untouchedSample(state);
  }
  /* 首次打开的示例模板，而且一个字都没改过（按内容比较，不看修改时间：登录上传过也算） */
  function untouchedSample(o) {
    if (!window.GP.isSample(o) || Object.keys(o.notes || {}).length) return false;
    function sig(x) { return JSON.stringify([x.habits.map(function (h) { return [h.name, h.seal, h.freq, h.days.join('')]; }), x.goals.map(function (g) { return [g.title, g.tasks.length, g.tasks.filter(function (t) { return t.done; }).length]; })]); }
    var me = sig(o);
    return me === sig(sampleZh()) || me === sig(sampleEn());
  }
  function onbBusy() { var d = $('#dlgOnb'); return !!(onb.step || (d && d.open)); }
  /* 首次「先在本机用」时会不会马上进新手指引（会的话，不弹「本机模式」toast：游客提示条已经说明了） */
  function willOnboard() { try { return onbBusy() || (!onb.shown && !!state && !onbFlag() && pristine()); } catch (e) { return false; } }
  function otherDialogOpen() { return $$('dialog[open]').some(function (d) { return d.id !== 'dlgOnb'; }); }
  function maybeOnboard() {
    if (onb.shown || onb.step || !state) return;
    if (onbFlag()) return;
    if (otherDialogOpen() || $('#boot')) return;               // 首页 / 登录页 / 冲突选择还开着：等它们关掉
    var c = window.GPCloud;
    if (c && c.user() && (c.status() === 'syncing' || !c.status())) return;   // 正在拉取云端：等结果
    if (!pristine()) { try { localStorage.setItem(ONB_KEY, '1'); } catch (e) {} return; }   // 老用户（有数据）：跳过
    startOnboard(false);
  }
  function startOnboard(replay) {
    closePrefs(false); goTab('today', true);
    onb.shown = true; onb.replay = replay; onb.hid = null;
    var d = $('#dlgOnb');
    $('#onbOwn').hidden = true; $('#onbName').value = ''; $('#onbNameErr').textContent = ''; $('#onbName').removeAttribute('aria-invalid');
    $('[data-tpl="own"]').setAttribute('aria-expanded', 'false');
    showPane(1);
    if (!d.open) d.showModal();
    var first = $('.onb__chips .onb-chip', d); if (first) first.focus();
  }
  function showPane(n) {
    onb.step = n;
    var d = $('#dlgOnb');
    $('#onbPane1').hidden = n !== 1; $('#onbPane3').hidden = n !== 3;
    $('#onbStart').hidden = n !== 3; $('#onbSkip').hidden = n === 3;   // 最后一步只留「开始吧」
    $('#onbStep').textContent = t(['第 1 步，共 3 步', '第 2 步，共 3 步', '第 3 步，共 3 步'][n - 1]);
    d.setAttribute('aria-labelledby', n === 3 ? 'onbTitle3' : 'onbTitle');
    d.setAttribute('aria-describedby', n === 3 ? 'onbLede3' : 'onbLede');
    paintOnbArt();
    if (n === 3) {
      var c = window.GPCloud, can = !!c && c.configured !== false, inn = can && !!c.user();
      $('#onbSync').hidden = !can;
      $('#onbSyncT').textContent = t(inn ? '已登录，换手机也不丢' : '登录后换手机也不丢');
      $('#onbLogin').hidden = inn;
    }
  }
  function paintOnbArt() {
    var px = isPx(), sk = curSkin();
    [['#onbArt1', 1, 'pine'], ['#onbArt3', 4, 'cinnabar']].forEach(function (a) {
      var el = $(a[0]); if (!el) return;
      el.hidden = !px; el.innerHTML = px ? SKIN.sprite(sk, a[1], a[2]) : '';
    });
  }
  function onbDone() {
    if (!state.prefs) state.prefs = {};
    try { localStorage.setItem(ONB_KEY, '1'); } catch (e) {}
    if (!state.prefs.onboarded) { state.prefs.onboarded = true; save(); }
  }
  /* 全新用户在第 1 步跳过：不塞示例模板，从空白开始（空状态会指向「新习惯」） */
  function freshStart() {
    state = validate({ version: 2, motto: defMotto(curLang()), mottos: { zh: '', en: '' }, areas: sample().areas, habits: [], goals: [], log: {}, notes: {}, prefs: keepPrefs({ theme: curSkin() }) });
    renderAll(); drawScenes();
  }
  function endOnboard(focusEl) {
    if (onb.step === 1 && !onb.replay && pristine() && state.habits.length) freshStart();
    onbDone(); hideCoach();
    onb.step = 0;
    var d = $('#dlgOnb'); if (d.open) d.close();
    var f = focusEl || $('#habitList .seal') || $('#todayTitle');
    if (f) { if (f.id === 'todayTitle') f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: f.id !== 'todayTitle' }); }
  }
  /* 选好习惯：全新用户 → 只留这 1 个习惯；已有数据（重新看指引）→ 加进去（同名的就直接用） */
  function onbPick(tpl, ownName) {
    var en = isEn(), T0 = ONB_TPL[tpl], name = T0 ? (en ? T0.en : T0.zh) : ownName;
    var h = { id: 'h-' + uid(), name: name, seal: T0 ? (en ? T0.se : T0.sz) : (ownName.trim().charAt(0) || '习'), area: T0 ? T0.area : 'a-habit', freq: 'daily', days: [0, 1, 2, 3, 4, 5, 6], created: keyOf(T) };
    if (!onb.replay && pristine()) {
      state = validate({ version: 2, motto: defMotto(curLang()), mottos: { zh: '', en: '' }, areas: sample().areas, habits: [h], goals: [], log: {}, notes: {}, prefs: keepPrefs({ theme: curSkin() }) });
    } else {
      var same = state.habits.filter(function (x) { return x.name === name; })[0];
      if (same) h = same; else {
        if (!state.areas.some(function (a) { return a.id === h.area; })) h.area = state.areas[0].id;
        state.habits.push(h);
      }
    }
    save(); renderAll(); drawScenes();
    onb.hid = h.id;
    $('#dlgOnb').close();
    onb.step = 2;
    if (isDone(h.id, keyOf(T))) { showPane(3); $('#dlgOnb').showModal(); $('#onbStart').focus(); return; }
    goTab('today', true); setTimeout(showCoach, 30);
  }
  function onbSeal() { return onb.hid ? $('.habit[data-id="' + cssEsc(onb.hid) + '"] .seal') : null; }
  function showCoach() {
    var seal = onbSeal(); if (!seal) { showPane(3); $('#dlgOnb').showModal(); return; }
    var c = $('#coach');
    $('#coachT').textContent = t('做完就点一下');
    $('#coachD').textContent = t('轻点这个方框，记下第一次打卡。');
    c.classList.remove('is-yay');
    seal.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    seal.setAttribute('aria-describedby', 'coachT coachD');
    $('#coachRing').hidden = false; c.hidden = false;
    document.documentElement.classList.add('is-coaching');
    placeCoach();
    setTimeout(function () { placeCoach(); seal.focus({ preventScroll: true }); }, reduceMotion ? 0 : 350);
    addEventListener('scroll', placeCoachSoon, { passive: true }); addEventListener('resize', placeCoachSoon);
  }
  function hideCoach() {
    var seal = onbSeal(); if (seal) seal.removeAttribute('aria-describedby');
    $('#coach').hidden = true; $('#coachRing').hidden = true;
    document.documentElement.classList.remove('is-coaching');
    removeEventListener('scroll', placeCoachSoon); removeEventListener('resize', placeCoachSoon);
  }
  function placeCoachSoon() { cancelAnimationFrame(onb.raf); onb.raf = requestAnimationFrame(placeCoach); }
  function placeCoach() {
    var seal = onbSeal(), c = $('#coach'), ring = $('#coachRing'); if (!seal || c.hidden) return;
    var r = seal.getBoundingClientRect(), pad = 6, vw = document.documentElement.clientWidth, vh = innerHeight;
    ring.style.left = (r.left - pad) + 'px'; ring.style.top = (r.top - pad) + 'px';
    ring.style.width = (r.width + pad * 2) + 'px'; ring.style.height = (r.height + pad * 2) + 'px';
    var w = Math.min(300, vw - 24); c.style.width = w + 'px';
    var left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2));
    var ch = c.offsetHeight, below = r.bottom + pad + 12, top = below + ch <= vh - 8 ? below : Math.max(8, r.top - pad - 12 - ch);
    c.style.left = left + 'px'; c.style.top = top + 'px';
    c.style.setProperty('--arrow-x', Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left)) + 'px');
    c.classList.toggle('is-above', top < r.top);
  }
  /* 第 2 步：点了那个方框 */
  function onbChecked(hid) {
    if (onb.step !== 2 || hid !== onb.hid || $('#coach').hidden) return;
    onb.step = 2.5;
    var c = $('#coach');
    $('#coachT').textContent = t(isPx() ? '漂亮！小花长大了一点。' : '漂亮！第一次打卡完成。');
    $('#coachD').textContent = t('以后做完一项，就这样点一下。');
    c.classList.remove('is-yay'); void c.offsetWidth; c.classList.add('is-yay');
    setTimeout(function () {
      hideCoach();
      showPane(3); $('#dlgOnb').showModal(); $('#onbStart').focus();
    }, reduceMotion ? 900 : 1500);
  }

  $$('#dlgOnb [data-tpl]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tpl !== 'own') { onbPick(b.dataset.tpl); return; }
      var f = $('#onbOwn'); f.hidden = !f.hidden; b.setAttribute('aria-expanded', String(!f.hidden));
      if (!f.hidden) $('#onbName').focus();
    });
  });
  $('#onbOwn').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#onbName').value.trim();
    if (!v) { $('#onbNameErr').textContent = t('写一个习惯的名字吧。'); $('#onbName').setAttribute('aria-invalid', 'true'); $('#onbName').focus(); return; }
    onbPick('own', v.slice(0, 60));
  });
  $('#onbSkip').addEventListener('click', function () { endOnboard(); });
  $('#coachSkip').addEventListener('click', function () { endOnboard(); });
  $('#onbStart').addEventListener('click', function () { endOnboard(); });
  $('#onbLogin').addEventListener('click', function () { endOnboard($('#syncPill')); var p = $('#syncPill'); if (p) p.click(); });
  $('#dlgOnb').addEventListener('cancel', function (e) { e.preventDefault(); endOnboard(); });   // Esc = 跳过
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#coach').hidden) endOnboard(); });
  $('#prefsGuide').addEventListener('click', function () { hideCoach(); onb.step = 0; startOnboard(true); });
  document.addEventListener('gp:lang', function () {
    if (!onb.step) return;
    if (onb.step === 1 || onb.step === 3) showPane(onb.step);
    if (onb.step === 2 && !$('#coach').hidden) { $('#coachT').textContent = t('做完就点一下'); $('#coachD').textContent = t('轻点这个方框，记下第一次打卡。'); placeCoach(); }
  });
  document.addEventListener('gp:skin', function () { paintOnbArt(); placeCoachSoon(); });
  (function () {
    function later() { setTimeout(maybeOnboard, 60); }
    new MutationObserver(later).observe($('#gate'), { attributes: true, attributeFilter: ['open'] });
    var pill = $('#syncPill'); if (pill) new MutationObserver(later).observe(pill, { attributes: true, attributeFilter: ['data-state'] });
    var dlgS = $('#dlgSync'); if (dlgS) dlgS.addEventListener('close', later);
    addEventListener('load', function () { setTimeout(maybeOnboard, 1300); });
  })();

  /* ---------- v12：四个标签页（今天 / 统计 / 习惯 / 我的），哈希路由，不刷新页面 ---------- */
  var TABS = ['today', 'stats', 'habits', 'me'], curTab = null;
  var TAB_ICONS = {   // 12×12 像素图标，颜色跟随文字（currentColor），每个主题自动换色
    today: ['....X..X....', '.XXXXXXXXXX.', '.X........X.', '.XXXXXXXXXX.', '.X........X.', '.X......X.X.', '.X.....X..X.', '.X.X..X...X.', '.X..XX....X.', '.X........X.', '.XXXXXXXXXX.', '............'],
    stats: ['............', '.........XX.', '.........XX.', '.....XX..XX.', '.....XX..XX.', '.XX..XX..XX.', '.XX..XX..XX.', '.XX..XX..XX.', '.XX..XX..XX.', '.XX..XX..XX.', 'XXXXXXXXXXXX', '............'],
    habits: ['............', '.XX.XXXXXXX.', '.XX.........', '............', '.XX.XXXXXXX.', '.XX.........', '............', '.XX.XXXXXXX.', '.XX.........', '............', '.XX.XXXXX...', '.XX.........'],
    me: ['............', '....XXXX....', '...XXXXXX...', '...XXXXXX...', '...XXXXXX...', '....XXXX....', '............', '..XXXXXXXX..', '.XXXXXXXXXX.', '.XXXXXXXXXX.', '.XXXXXXXXXX.', '............']
  };
  function pxIcon(rows) {
    var out = '';
    rows.forEach(function (r, y) { var x = 0; while (x < r.length) { if (r[x] !== 'X') { x++; continue; } var s0 = x; while (x < r.length && r[x] === 'X') x++; out += '<rect x="' + s0 + '" y="' + y + '" width="' + (x - s0) + '" height="1"/>'; } });
    return '<svg viewBox="0 0 12 12" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false">' + out + '</svg>';
  }
  $$('.tabbar__ico').forEach(function (el) { el.innerHTML = pxIcon(TAB_ICONS[el.dataset.ico]); });
  function tabFromHash() { var m = /^#\/(\w+)/.exec(location.hash); return m && TABS.indexOf(m[1]) >= 0 ? m[1] : null; }
  function goTab(tab, quiet) {
    if (location.hash !== '#/' + tab && (tab !== 'today' || tabFromHash())) { history.replaceState(null, '', '#/' + tab); }
    showTab(tab, !quiet);
  }
  function showTab(tab, moveFocus) {
    var changed = curTab !== tab; curTab = tab;
    document.documentElement.dataset.tab = tab;
    $$('.tab').forEach(function (p) { p.hidden = p.dataset.tab !== tab; });
    $$('.tabbar__a').forEach(function (a) { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var name = { today: '今天', stats: '统计', habits: '@tabHabits', me: '我的' }[tab];
    var gd = $('#gate');
    if (titleReady) document.title = gd && gd.open ? (isEn() ? t('@title') : 'Ledger · 安静的进度账本')   // 首页 / 登录页：保留原来的标题
      : (name === '@tabHabits' && !isEn() ? '习惯' : t(name)) + ' · Ledger';
    if (!changed) return;
    scrollTo(0, 0);
    // 隐藏时宽度为 0 的画布 / 横向滚动区：切过来后重新量一次
    setTimeout(function () {
      drawScenes();
      if (tab === 'stats') scrollYear();
      if (window.Crew) { if (tab === 'today' && curSkin() === HIDDEN_SKIN) { var cv = $('#crew'); cv.hidden = false; Crew.mount(cv); } else Crew.stop(); }
    }, 0);
    if (moveFocus) { var h = $('#tab-' + tab + ' h1, #tab-' + tab + ' h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
  }
  addEventListener('hashchange', function () { var tb = tabFromHash() || (location.hash.length <= 1 ? 'today' : null); if (tb) showTab(tb, true); });   // #main / #top 之类的锚点不切换标签
  var titleReady = false;   // 第一次显示时保留原标题（首页 / 登录页可能马上要打开），之后切标签再改
  showTab(tabFromHash() || 'today', false);
  titleReady = true;
  if ($('#gate')) $('#gate').addEventListener('close', function () { showTab(curTab, false); });
  document.addEventListener('gp:lang', function () { showTab(curTab, false); });

  /* 习惯管理（习惯页）：编辑、上移 / 下移、归档 / 恢复 */
  function mgrRow(h, i, n, arch) {
    var a = area(h.area), btn = function (act, label, path, dis) { return '<button class="icon-btn" type="button" data-act="' + act + '" aria-label="' + esc(label) + '"' + (dis ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg></button>'; };
    return '<li class="mgr__row" data-id="' + esc(h.id) + '" style="--c:' + areaColor(h.area) + '">' +
      '<span class="mgr__seal" aria-hidden="true">' + esc(h.seal) + '</span>' +
      '<div class="mgr__body"><p class="mgr__name">' + esc(h.name) + '</p><p class="mgr__meta"><span class="dot"></span>' + esc(a.name) + ' · ' + freqText(h) + '</p></div>' +
      '<div class="mgr__acts">' + (arch
        ? btn('mgr-unarch', t('恢复「{name}」', { name: h.name }), '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/>')
        : btn('mgr-up', t('上移「{name}」', { name: h.name }), '<path d="M6 14l6-6 6 6"/>', i === 0) +
          btn('mgr-down', t('下移「{name}」', { name: h.name }), '<path d="M6 10l6 6 6-6"/>', i === n - 1) +
          btn('mgr-edit', t('编辑「{name}」', { name: h.name }), '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>') +
          btn('mgr-arch', t('归档「{name}」', { name: h.name }), '<path d="M4 5h16v4H4Z"/><path d="M6 9v10h12V9"/><path d="M10 13h4"/>')) +
      '</div></li>';
  }
  function renderMgr() {
    var list = $('#mgrList'); if (!list) return;
    var hs = state.habits, ar = state.archive || [];
    list.innerHTML = hs.map(function (h, i) { return mgrRow(h, i, hs.length, false); }).join('');
    $('#mgrEmpty').hidden = hs.length > 0;
    $('#mgrArchWrap').hidden = !ar.length;
    $('#mgrArchSum').textContent = t('已归档（{n}）', { n: ar.length });
    $('#mgrArch').innerHTML = ar.map(function (h, i) { return mgrRow(h, i, ar.length, true); }).join('');
  }
  function moveHabit(id, d) {
    var i = state.habits.findIndex(function (h) { return h.id === id; }), j = i + d;
    if (i < 0 || j < 0 || j >= state.habits.length) return;
    var x = state.habits[i]; state.habits[i] = state.habits[j]; state.habits[j] = x;
    save(); renderAll();
    var b = $('#mgrList .mgr__row[data-id="' + cssEsc(id) + '"] [data-act="' + (d < 0 ? 'mgr-up' : 'mgr-down') + '"]');
    if (b && b.disabled) b = $('#mgrList .mgr__row[data-id="' + cssEsc(id) + '"] [data-act="mgr-edit"]');
    if (b) b.focus();
    toast(t('已调整顺序'), '序');
  }
  function archiveHabit(id, on) {
    var from = on ? state.habits : (state.archive || []), i = from.findIndex(function (h) { return h.id === id; });
    if (i < 0) return;
    var h = from.splice(i, 1)[0];
    if (on) { state.archive = state.archive || []; state.archive.push(h); } else { state.habits.push(h); if (!state.archive.length) delete state.archive; }
    save(); renderAll();
    var f = $('#mgrList .mgr__row [data-act="mgr-edit"]') || $('[data-action="add-habit"]', $('#habitsMgr')); if (f) f.focus();
    toast(t(on ? '已归档「{name}」，记录都还在' : '已恢复「{name}」', { name: h.name }), on ? '归' : '回', on ? { label: t('撤销'), fn: function () { archiveHabit(id, false); } } : null);
  }

  /* 每天一句笔记：从「今天」里任一习惯的笔记按钮打开 */
  function openNote(hid) {
    var d = $('#dlgNote'), inp = $('#noteIn'), h = state.habits.filter(function (x) { return x.id === hid; })[0];
    inp.value = state.notes[keyOf(T)] || (h ? h.name + (isEn() ? ': ' : '：') : '');
    d.showModal(); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  }
  $('#noteForm').addEventListener('submit', function () { setTimeout(function () { $('#dlgNote').close(); renderHabits(); }, 0); });

  /* 「我的」：账号卡片跟着同步状态走 */
  function paintAcct() {
    var c = window.GPCloud, inn = !!(c && c.user()), can = !!c && c.configured !== false;
    $('#meAcctT').textContent = !can ? t('云同步还没配置，数据保存在这台设备上。') : inn ? t('已登录：{who}', { who: ($('#syncWho') && $('#syncWho').textContent) || c.user().email || '' }) + ' · ' + ($('#syncText').textContent || '') : t('登录后，换手机也不丢。');
    $('#meAcctBtn').textContent = t(inn ? '账号与同步' : '登录 / 注册');
    $('#meAcctBtn').hidden = !can;
  }
  $('#meAcctBtn').addEventListener('click', function () { var p = $('#syncPill'); if (p) p.click(); });
  (function () {
    var pill = $('#syncPill');
    if (pill) new MutationObserver(paintAcct).observe(pill, { attributes: true, childList: true, subtree: true, characterData: true });
    addEventListener('load', paintAcct); setTimeout(paintAcct, 0);
    document.addEventListener('gp:lang', function () { setTimeout(paintAcct, 0); renderMgr(); });
  })();

  /* ---------- bridge for cloud.js ---------- */
  window.GP = {
    KEY: KEY,
    get: function () { return state; },
    /** 用云端（或其他标签页）的数据替换当前状态；不会触发 gp:change */
    replace: function (data) {
      var next = validate(JSON.parse(JSON.stringify(data)));
      state = next; writeLocal(); renderAll();
    },
    reset: function () { state = emptyState(); writeLocal(); renderAll(); },
    isSample: function (o) {   // 识别首次打开的示例（新模板 s-h1… 或旧版 h1…）
      var ids = JSON.stringify(o && o.habits && o.habits.map(function (h) { return h.id; }));
      return ids === '["s-h1","s-h2","s-h3","s-h4","s-h5","s-h6","s-h7"]' || ids === '["h1","h2","h3","h4","h5","h6","h7"]';
    },
    summary: function (o) {
      o = o || state; var n = 0;
      Object.keys(o.log || {}).forEach(function (k) { n += (o.log[k] || []).length; });
      return { habits: (o.habits || []).length, goals: (o.goals || []).length, checks: n };
    },
    validate: function (o) { return validate(JSON.parse(JSON.stringify(o))); },
    toast: toast, esc: esc,
    skin: curSkin, setSkin: setSkin, tapLogo: tapLogo, paintGuest: paintGuest, onboard: function () { startOnboard(true); }, goTab: goTab, tab: function () { return curTab; }, willOnboard: willOnboard, onbStep: function () { return onb.step; },
    // 测试用：频率 / 连续 / 这周进度 / CSV
    calc: { required: function (h, k) { return required(h, parseKey(k)); }, streak: streak, bestStreak: bestStreak, weekProgress: function (h) { return weekProgress(h); }, csv: buildCsv }
  };
  // 另一个标签页改了数据：同步到当前页
  addEventListener('storage', function (e) {
    if (e.key === KEY && e.newValue) { try { state = validate(JSON.parse(e.newValue)); renderAll(); } catch (err) {} }
  });

  /* ---------- 语言切换：重绘所有动态文案（数据本身不变） ---------- */
  document.addEventListener('gp:lang', function () {
    // 还没动过的入门模板：跟着换成当前语言的版本（用户改过的数据永远不动）
    var untouched = false; try { untouched = !(JSON.parse(localStorage.getItem('growth-plan:meta') || '{}') || {}).updatedAt; } catch (e) {}
    if (untouched && window.GP.isSample(state) && !Object.keys(state.log).length) { state = sample(); writeLocal(); }
    paintThemeBtn(); renderAll();
    $$('#toasts .toast').forEach(function (el) { el.remove(); });   // 旧语言的提示直接收起
    if ($('#dlgHabit').open) $('#dlgHabitTitle').textContent = editingHabit ? t('编辑习惯') : t('新习惯');
    if ($('#dlgGoal').open) $('#dlgGoalTitle').textContent = editingGoal ? t('编辑目标') : t('新目标');
  });

  /* ---------- boot ---------- */
  state = load();
  try { if (!localStorage.getItem(KEY)) writeLocal(); } catch (e) {}
  paintThemeBtn();
  applySkin(state.prefs.theme);
  renderAll();
  drawScenes();
  document.dispatchEvent(new CustomEvent('gp:ready'));
  document.addEventListener('gp:skin', function () { scrollYear(); });
  // 登录页 / 首页出现或收起后，重画首页的场景
  new MutationObserver(function () { setTimeout(drawScenes, 30); }).observe($('#gate'), { attributes: true, attributeFilter: ['open', 'class', 'data-view'] });

  /* 加载画面：字体和数据都就绪后淡出（最多等 1.2 秒）；减弱动态时直接移除 */
  (function () {
    var boot = $('#boot'); if (!boot) return;
    var done = false;
    function hide() {
      if (done) return; done = true;
      drawScenes(); scrollYear();
      if (reduceMotion) { boot.remove(); return; }
      boot.classList.add('is-out'); setTimeout(function () { boot.remove(); }, 400);
    }
    var fr = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fr.then(function () { setTimeout(hide, reduceMotion ? 0 : 250); });
    setTimeout(hide, 1200);
  })();
})();
