/* Ledger · i18n（中文 / English）
 * - 中文原文就是 key（gettext 风格）：静态 HTML 保持中文原样，切到英文时按字典替换；
 *   JS 里的动态文案统一走 I18N.t('中文原文 {n}', { n: 3 })。
 * - 个别同字异义或含内联标记的地方，用 data-i18n="@key" / data-i18n-html="@key" 指定专用 key。
 * - 选择保存在 localStorage（growth-plan:lang）；默认跟随浏览器语言（zh* → 中文，其余 → English）。
 * - 切换时：替换静态文案 → 设置 <html lang> 与标题 → 派发 gp:lang 事件，app.js / cloud.js 重新渲染动态部分。
 */
(function () {
  'use strict';
  var KEY = 'growth-plan:lang';
  var root = document.documentElement;
  var CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;

  function pl(n, one, many) { return (+n === 1 ? one : many).replace('{n}', n); }

  var EN = {
    /* ---------- meta ---------- */
    '@title': 'Ledger · A quiet ledger for steady progress',
    '@desc': 'Ledger: a quiet place to keep your goals, habits and weekly progress. Works offline, syncs to the cloud.',
    '语言': 'Language',

    /* ---------- top bar ---------- */
    '跳到主要内容': 'Skip to content',
    '＋': '+',
    'Ledger，回到顶部': 'Ledger, back to top',
    '页面分区': 'Sections',
    '今天': 'Today', '本周': 'This week', '目标': 'Goals', '数据': 'Data',
    '切换主题': 'Change theme',
    '跟随系统': 'System', '浅色': 'Light', '深色': 'Dark',
    '主题：{label}，点击切换': 'Theme: {label}. Select to change',
    '设置': 'Settings', '主题': 'Theme',
    /* ---------- v10：主题（皮肤）---------- */
    '田园': 'Farm', '电玩': 'Arcade', '星夜': 'Night', '简约': 'Minimal',
    '主题：{name}': 'Theme: {name}',
    '明暗': 'Light / dark', '切换明暗': 'Light or dark', '明暗：{label}，点击切换': 'Light / dark: {label}. Select to change',
    '种子': 'Seed', '发芽': 'Sprout', '幼苗': 'Seedling', '茁壮': 'Growing', '丰收': 'Harvest',
    '新月': 'New moon', '蛾眉月': 'Crescent', '上弦月': 'Half moon', '盈凸月': 'Gibbous', '满月': 'Full moon',
    '浇水 +1': 'Watered +1', '点亮 +1': 'Lit +1',
    '☀ 晴 · 宜浇水': '☀ Sunny · good day for watering',
    '☾ 晚风很轻 · 适合慢慢来': '☾ A soft night breeze · take it slow',
    '每打一次卡就浇一次水，这周做够了，作物就会丰收。': 'Every check-in waters a crop. Hit this week’s target and it’s harvest time.',
    '每次打卡 +10 XP，这周做够就能充满电。': 'Every check-in is +10 XP. Hit this week’s target to fully charge.',
    '每打一次卡，月亮就圆一点，这周做够就是满月。': 'Every check-in fills the moon a little. Hit this week’s target for a full moon.',
    /* ---------- v12：四个标签页 ---------- */
    '统计': 'Stats', '@tabHabits': 'Habits', '我的': 'Me', '主导航': 'Main navigation',
    '连续记录、这周完成率和这一年的热力图。点格子可以补记。': 'Streaks, this week’s rate and the year heatmap. Tap a cell to fill in a missed one.',
    '回看七天，补记遗漏': 'The last seven days; fill in anything you missed',
    '新建、编辑、调整顺序；暂时不做的可以归档，记录都会保留。': 'Create, edit and reorder. Archive what you’re pausing; its history is kept.',
    '全部习惯': 'All habits', '还没有习惯。点「新习惯」加一个吧。': 'No habits yet. Tap “New habit” to add one.',
    '已归档': 'Archived', '已归档的习惯': 'Archived habits', '已归档（{n}）': 'Archived ({n})',
    '上移「{name}」': 'Move “{name}” up', '下移「{name}」': 'Move “{name}” down', '归档「{name}」': 'Archive “{name}”', '恢复「{name}」': 'Restore “{name}”',
    '已调整顺序': 'Order updated', '已归档「{name}」，记录都还在': 'Archived “{name}”. Its history is kept.', '已恢复「{name}」': 'Restored “{name}”',
    '写一句今天的笔记（{name}）': 'Write today’s note ({name})',
    '账号与同步、主题、语言、提醒和数据。': 'Account and sync, theme, language, reminders and data.',
    '登录后，换手机也不丢。': 'Log in and your data follows you to a new phone.', '已登录：{who}': 'Logged in: {who}',
    '云同步还没配置，数据保存在这台设备上。': 'Cloud sync isn’t set up, so data stays on this device.',
    '关于': 'About', 'Ledger：安静地记下每一点进步。离线可用，登录后自动同步。': 'Ledger: a quiet place to note every bit of progress. Works offline, syncs when you log in.',
    /* ---------- v12：新手指引 + 空状态 ---------- */
    '第 1 步，共 3 步': 'Step 1 of 3', '第 2 步，共 3 步': 'Step 2 of 3', '第 3 步，共 3 步': 'Step 3 of 3', '选第一个习惯': 'Pick your first habit',
    '先从一件小事开始，以后随时可以再加。': 'Start with one small thing. You can add more any time.',
    '阅读': 'Reading', '早睡': 'Sleep early', '运动': 'Exercise', '记账': 'Track spending', '自己写': 'Write my own',
    '想养成什么习惯？': 'What habit do you want to build?', '比如：喝 8 杯水': 'e.g. Drink 8 glasses of water', '@onbAdd': 'Add',
    '写一个习惯的名字吧。': 'Give your habit a name.', '跳过': 'Skip', '开始吧': 'Let’s go',
    '做完就点一下': 'Done it? Tap once.', '轻点这个方框，记下第一次打卡。': 'Tap this box to log your first check-in.',
    '漂亮！小花长大了一点。': 'Nice! Your flower grew a little.', '漂亮！第一次打卡完成。': 'Nice! First check-in done.',
    '以后做完一项，就这样点一下。': 'From now on, just tap when it’s done.',
    '接下来，慢慢积累': 'Now, bit by bit', '每打一次卡，连续记录和年度热力图都会慢慢长出来。': 'Every check-in grows your streak and fills in the year heatmap.',
    '登录后换手机也不丢': 'Log in and your data follows you to a new phone.', '已登录，换手机也不丢': 'You’re logged in, so a new phone won’t lose anything.',
    '@onbLogin': 'Log in', '重新看新手指引': 'Replay the intro',
    '还没有习惯': 'No habits yet', '从一件小事开始，比如睡前读 10 页书。点「新习惯」加一个吧。': 'Start with something small, like reading 10 pages before bed. Tap “New habit” to add one.',
    /* ---------- v11：游客模式提示 + 隐藏主题 ---------- */
    '@guest': 'Guest mode: data is saved on this device only. Log in to sync.',
    '@guestGo': 'Log in', '本次不再提示': 'Hide for this session',
    '小可爱': 'Cuties', '长叶': 'Leafy', '花苞': 'Bud', '开花': 'Bloom', '开心 +1': 'Yay +1',
    '解锁了隐藏主题：小可爱～': 'Hidden theme unlocked: Cuties~', '已经解锁啦～': 'Already unlocked~',
    '☀ 三小只在晒太阳，打个卡叫醒它们～': '☀ The trio is sunbathing. Check in to wake them up~',
    '打卡＝浇水，小花会慢慢开，这周做够了就开花。': 'Each check-in waters a flower. Hit this week’s target and it blooms.',
    /* ---------- v10：频率 ---------- */
    '频率': 'Frequency', '指定几天': 'Pick days', '每周几次': 'N times a week', '每周': 'Each week', '次，哪天做都行': 'times, any days',
    '每周 {n} 次': '{n}× a week', '每周次数要在 1 到 7 之间': 'Times per week must be between 1 and 7',
    '这周 {d}/{s}': 'This week {d}/{s}',
    '这周还差几次': 'Still to do this week', '哪天做都行，不计入今天的完成度': 'Any day works; not counted in today’s score',
    '这周还要完成的习惯': 'Habits still due this week',
    '（不需要打卡）': ' (not required)',
    '这周完成 {d} 次，目标 {s} 次': 'Done {d} times this week, target {s}',
    '虚线格＝那天不需要打卡（也可以额外记一次）': 'Dashed cells = not required that day (you can still log an extra one)',
    '连续 {n} 周达标': '{n}-week streak', '周': 'wk',
    '「{name}」已连续 {n} 周达标': '“{name}”: target met {n} weeks in a row',
    '「{name}」这周的 {n} 次完成了': '“{name}”: all {n} done this week',
    /* ---------- v10：这一年 / 笔记 / 数据 ---------- */
    '这一年': 'This year', '每格一天 · 按当天完成比例着色 · 点一格查看那天': 'One square per day · shaded by completion · select one to open it',
    '有笔记': 'has a note',
    '前一天': 'Previous day', '后一天': 'Next day',
    '那天没有需要打卡的习惯。': 'Nothing was due that day.',
    '完成 {d} / {s} 项 · {p}%': '{d} / {s} done · {p}%', '额外完成 {n} 项': '{n} extra done',
    '（已完成）': ' (done)', '（未完成）': ' (not done)',
    '今天做了什么': 'What did you do today?', '那天做了什么': 'What did you do that day?',
    '可选：用一句话记下今天': 'Optional: one line about today', '记下': 'Save', '还没有笔记': 'No note yet',
    '会同步，也能在下面的「这一年」里翻看。': 'Synced, and you can look back in “This year” below.',
    '笔记已记下': 'Note saved', '笔记已删除': 'Note removed',
    '每个习惯': 'By habit', '当前连续 · 最长连续 · 这周完成': 'current streak · longest · this week',
    '每个习惯的连续次数与这周完成率': 'Streaks and this week’s completion for each habit',
    '当前': 'Now', '最长': 'Best', '这周': 'This week',
    '添加习惯后，这里会显示连续次数。': 'Add a habit to see streaks here.',
    '最近的笔记': 'Recent notes', '还没有笔记。在「今天」下面写一句，就会出现在这里。': 'No notes yet. Write one line under “Today” and it shows up here.',
    '导出全部数据': 'Export all data', '表格': 'Spreadsheet', '下载 CSV': 'Download CSV', '每天一行，可用 Excel 打开': 'One row per day; opens in Excel',
    '星期': 'Weekday', '完成度': 'Completion', '笔记': 'Note', '表格已导出': 'Spreadsheet exported',
    /* ---------- 每天提醒 ---------- */
    '每天提醒': 'Daily reminder', '提醒我记一笔': 'Remind me to log', '提醒时间': 'Reminder time', '时间': 'Time',
    '花一分钟，记下今天的进步。': 'Take a minute to log today.',
    '每天 {time} 会收到一条安静的提醒。': 'You’ll get one quiet reminder a day at {time}.',
    '打开后，每天在这个时间提醒你一次。': 'Turn this on for one reminder a day at this time.',
    '网页提醒只在本页面（或已安装的应用）开着时才会响。想准时收到，请用安卓版。': 'Web reminders only fire while this page (or the installed app) is open. For reliable reminders, use the Android app.',
    '通知权限被关掉了。请在系统设置里允许 Ledger 发送通知。': 'Notifications are off. Allow Ledger to send notifications in system settings.',
    '浏览器拦截了通知。请在浏览器的网站设置里允许通知。': 'Your browser is blocking notifications. Allow them in this site’s settings.',
    '好的，每天 {time} 提醒你。': 'Done. Reminding you daily at {time}.',

    /* ---------- hero ---------- */
    '改写这句话': 'Rewrite this line',
    '今天的完成度': 'Today’s progress',
    '去打卡': 'Check in',
    '最长连续': 'Longest streak', '本周达成': 'This week', '目标推进': 'Goal progress', '累计打卡': 'Check-ins',
    '天': 'days', '次': '',
    '第 {n} 周': 'Week {n}',
    '今天的完成度 {pct}%，{done} / {total} 项': 'Today’s progress: {pct}%, {done} of {total} done',
    '今天没有安排，休息一下。': 'Nothing planned today. Take a breath.',
    '还没有习惯，从一件小事开始吧。': 'No habits yet. Start with one small thing.',
    '添加习惯后，这里会显示每一天的打卡。': 'Add a habit and each day’s check-ins will show up here.',
    '今天的都完成了。': 'All done for today.',
    '今天还有 {n} 项待完成。': function (v) { return pl(v.n, 'One thing left for today.', '{n} things left for today.'); },
    '「{name}」': '“{name}”',
    '从今天开始': 'Starts today',
    '{d} / {s} 次 · 截至今天': '{d} of {s} so far',
    '{g} 个目标 · {c} 个已达成': function (v) { return pl(v.g, '1 goal', '{n} goals') + ' · ' + v.c + ' reached'; },
    '自 {date} 起': 'Since {date}',
    '还没有记录': 'Nothing logged yet',

    /* ---------- today ---------- */
    '做完一项，轻点一下。不必每天满分，持续就好。': 'Tap once when it’s done. No need for perfect days — just keep going.',
    '新习惯': 'New habit',
    '今天的习惯': 'Today’s habits',
    '今天不安排': 'Not planned today',
    '不计入完成度，也可额外打卡': 'Doesn’t count toward today, but you can still check in',
    '今天没有安排的习惯': 'Habits not planned for today',
    '还没有习惯。从一件小事开始——比如「睡前读 10 页书」。': 'No habits yet. Start with something small — say, “read ten pages before bed.”',
    '最近 7 天': 'Last 7 days',
    '连续 {n} 天': function (v) { return pl(v.n, '1-day streak', '{n}-day streak'); },
    '连续': 'Streak',
    '编辑「{name}」': 'Edit “{name}”',
    '每天': 'Every day', '周一至周五': 'Weekdays', '周末': 'Weekends', '未安排': 'Not scheduled',

    /* ---------- week ---------- */
    '回看七天，补记遗漏。颜色越深，那天完成得越多。': 'Look back over seven days and fill in what you missed. The deeper the shade, the more you did.',
    '切换周': 'Change week', '上一周': 'Previous week', '下一周': 'Next week', '回到本周': 'Back to this week',
    '本周每天的习惯完成情况，点击格子可补记或取消': 'Check-ins for each day of the week. Select a cell to add or remove one.',
    '习惯': 'Habit',
    '（不安排）': ' (not planned)',
    '本周完成 {d} 次，应完成 {s} 次': '{d} of {s} done this week',
    '完成': 'Done',
    '近半年': 'Last six months', '近四个月': 'Last four months',
    '每格一天 · 按当天完成比例着色': 'One square a day · shaded by completion',
    '少': 'Less', '多': 'More',
    '一': 'M', '三': 'W', '五': 'F',
    '完成热力图': 'Completion heatmap',
    '近 {w} 周完成热力图，平均完成率 {avg}%，全勤 {full} 天': 'Completion heatmap for the last {w} weeks: {avg}% on average, {full} perfect days',
    '平均完成率': 'Average', '全勤天数': 'Perfect days', '最佳单周': 'Best week',
    '% · {date} 周': '% · week of {date}',

    /* ---------- goals ---------- */
    '把大目标拆成看得见的步骤。按领域归档，随时增删。': 'Break big goals into steps you can see. Group them by area; change them anytime.',
    '管理领域': 'Manage areas', '新目标': 'New goal', '按领域筛选': 'Filter by area',
    '这个领域还没有目标。写下一个三个月内想完成的事吧。': 'No goals here yet. Write down one thing you’d like to finish in the next three months.',
    '全部': 'All',
    '长期': 'Ongoing',
    '已过期 {n} 天': function (v) { return pl(v.n, '1 day overdue', '{n} days overdue'); },
    '今天截止': 'Due today',
    '还剩 {n} 天 · {date}': function (v) { return pl(v.n, '1 day left', '{n} days left') + ' · ' + v.date; },
    '已完成': 'Done',
    '进度': 'Progress',
    '为「{t}」添加步骤': 'Add a step to “{t}”',
    '＋ 添加一个步骤，回车保存': '+ Add a step, press Enter',
    '编辑目标「{t}」': 'Edit goal “{t}”',
    '删除目标「{t}」': 'Delete goal “{t}”',

    /* ---------- data ---------- */
    '数据与备份': 'Data & backup',
    '导出': 'Export', '下载 JSON 备份': 'Download a JSON backup',
    '导入': 'Import', '从 JSON 恢复': 'Restore from JSON', '会覆盖当前数据': 'Replaces what’s here now',
    '示例': 'Sample', '恢复示例内容': 'Restore the sample', '重新载入初始计划': 'Reload the starter plan',
    '清空': 'Clear', '从零开始': 'Start from scratch', '删除全部目标、习惯与记录': 'Delete every goal, habit and check-in',
    '{h} 个习惯 · {g} 个目标 · {kb} KB': function (v) { return pl(v.h, '1 habit', '{n} habits') + ' · ' + pl(v.g, '1 goal', '{n} goals') + ' · ' + v.kb + ' KB'; },
    '所有内容只保存在这台设备的浏览器里（localStorage）。定期导出，换设备时导入即可；也可以登录开启云同步。': 'Everything lives in this browser (localStorage). Export now and then and import on a new device — or sign in to turn on cloud sync.',
    '已登录 {email}。每次修改都会先存在本机，再自动同步到云端；导出备份依旧可用。': 'Signed in as {email}. Every change is saved here first, then synced to the cloud. Backups still work.',
    '离线可用 · 数据仅存于本机': 'Works offline · Stored on this device only',
    '离线可用 · 云端同步已开启': 'Works offline · Cloud sync on',

    /* ---------- dialogs ---------- */
    '习惯名称': 'Habit',
    '例如：阅读 20 分钟': 'e.g. Read for 20 minutes',
    '标记字': 'Mark',
    '读': 'R',
    '一个字，显示在打卡按钮上': 'One character for the check-in button',
    '所属领域': 'Area',
    '每周哪几天': 'Which days',
    '删除': 'Delete', '取消': 'Cancel', '保存': 'Save',
    '@goalLabel': 'Goal',
    '例如：按时完成所有作业': 'e.g. Hand in every assignment on time',
    '截止': 'Due', '可选': 'optional',
    '为什么重要': 'Why it matters',
    '一句话提醒未来的自己': 'A note for your future self',
    '拆解步骤': 'Steps', '每行一步': 'one per line',
    '列出要做的事\n拆成几个小步骤\n每周检查进度': 'List what needs doing\nBreak it into small steps\nCheck in on it weekly',
    '重命名、换色或删除领域。删除后，其中的目标和习惯会移到第一个领域。': 'Rename, recolour or remove areas. Goals and habits in a removed area move to the first one.',
    '＋ 添加领域': '+ Add an area',
    '确定吗？': 'Are you sure?', '确定': 'Confirm',
    '一句话': 'Your line',
    '写一句给自己的话（可留空换回默认）': 'A line for yourself (leave blank for the default)',
    '编辑习惯': 'Edit habit', '编辑目标': 'Edit goal',
    '领域名称': 'Area name', '颜色': 'Colour',
    '删除领域「{n}」': 'Remove area “{n}”',
    '新领域': 'New area',
    '星期一': 'Monday', '星期二': 'Tuesday', '星期三': 'Wednesday', '星期四': 'Thursday', '星期五': 'Friday', '星期六': 'Saturday', '星期天': 'Sunday',
    '靛青': 'Indigo', '松绿': 'Pine', '赭石': 'Ochre', '朱砂': 'Cinnabar', '藕紫': 'Plum', '黛灰': 'Slate',
    '未分类': 'Uncategorised',

    /* ---------- toasts & confirmations ---------- */
    '保存失败：浏览器存储不可用': 'Couldn’t save — browser storage isn’t available',
    '今天的计划都完成了。': 'Everything for today is done.',
    '「{name}」已连续 {n} 天': '“{name}” — {n} days in a row',
    '删除目标': 'Delete goal',
    '「{t}」及其 {n} 个步骤将被删除。': function (v) { return '“' + v.t + '” and ' + pl(v.n, 'its 1 step', 'its {n} steps') + ' will be deleted.'; },
    '「{t}」将被删除。': '“{t}” will be deleted.',
    '已删除目标': 'Goal deleted', '撤销': 'Undo',
    '目标达成：「{t}」': 'Goal reached: “{t}”',
    '请至少选择一天': 'Pick at least one day',
    '已更新「{n}」': 'Updated “{n}”',
    '新习惯「{n}」已加入': 'Added “{n}”',
    '删除习惯': 'Delete habit',
    '「{n}」及其所有打卡记录将被删除。': '“{n}” and all of its check-ins will be deleted.',
    '已删除习惯': 'Habit deleted',
    '目标已更新': 'Goal updated', '新目标已建立': 'Goal added',
    '领域名称不能为空': 'Area names can’t be empty',
    '领域已更新': 'Areas updated',
    '备份已导出': 'Backup exported',
    '已导入 {h} 个习惯、{g} 个目标': function (v) { return 'Imported ' + pl(v.h, '1 habit', '{n} habits') + ' and ' + pl(v.g, '1 goal', '{n} goals'); },
    '导入失败：{m}': 'Import failed: {m}',
    '不是有效的 JSON 对象': 'not a valid JSON object',
    '缺少 areas / habits / goals / log 字段': 'missing the areas / habits / goals / log fields',
    '恢复示例': 'Restore the sample',
    '当前数据将被示例计划替换。建议先导出备份。': 'Your current data will be replaced by the sample plan. Consider exporting a backup first.',
    '恢复': 'Restore',
    '示例内容已载入': 'Sample loaded',
    '清空全部数据': 'Clear all data',
    '所有目标、习惯和打卡记录都会被删除，且无法撤销。领域会保留默认值。': 'Every goal, habit and check-in will be deleted. This can’t be undone. Areas go back to the defaults.',
    '已清空，重新出发': 'All clear. A fresh start.',

    /* ---------- landing ---------- */
    'A quiet ledger for small, steady progress.': 'Habits, goals and the shape of your weeks.',
    '把小小的进步，': 'Small progress,',
    '安静地记下来。': 'quietly kept.',
    'Ledger 是一本只属于你的进度账本：打卡习惯，拆解目标，回看每一周。没网也能记，登录后在手机与电脑之间同步。': 'A private notebook for what you’re working on — habits to check off, goals to break into steps, weeks to look back on. It works offline, and syncs your phone and computer once you sign in.',
    '登录 / 注册': 'Sign in / Sign up',
    '下载安卓版': 'Get the Android app',
    '阅读 20 分钟': 'Read for 20 min',
    '运动 30 分钟': 'Move for 30 min',
    '十一点前睡': 'In bed by eleven',
    '背 30 个单词': 'Learn 30 words',
    '动': 'M', '眠': 'S', '词': 'W',
    '本周完成': 'Done',
    '习惯打卡': 'Habits',
    '做完一项，轻点一下，连续的天数慢慢变长。': 'One tap when it’s done. Watch the streak grow, quietly.',
    '目标与步骤': 'Goals & steps',
    '大目标拆成看得见的小步骤，一步一步勾掉。': 'Turn a big goal into small, visible steps — and tick them off one by one.',
    '离线与同步': 'Offline & sync',
    '没网也照常记录，联网后同步到每一台设备。': 'Keep going without a connection. Everything syncs to each device once you’re back online.',
    '安静地记录，慢慢地变好。': 'Keep it quietly. Get better slowly.',

    /* ---------- auth ---------- */
    '返回首页': 'Back',
    '记录每天的一点点。': 'A little, every day.',
    '登录后，目标、习惯与打卡记录会在你的设备之间同步。': 'Sign in and your goals, habits and check-ins stay in step across your devices.',
    '账号': 'Account', '关闭': 'Close',
    '登录或注册': 'Sign in or sign up',
    '登录': 'Sign in', '注册': 'Sign up', '注册并登录': 'Create account',
    '@notice': '<b>Cloud sync isn’t set up yet.</b> Add a Supabase publishable key to <code>config.js</code>. Until then, you can use Ledger on this device.',
    '邮箱': 'Email', '密码': 'Password',
    '显示密码': 'Show password', '隐藏密码': 'Hide password',
    '至少 6 位，建议字母与数字混合': 'At least 6 characters — mix in letters and numbers',
    '发送免密登录链接': 'Email me a sign-in link',
    '忘记密码？': 'Forgot password?',
    '请查收邮件': 'Check your inbox',
    '返回': 'Back', '重新发送': 'Resend',
    '重新发送（{n}s）': 'Resend ({n}s)',
    '或': 'or',
    '不登录，仅本机使用': 'Continue without an account',
    '数据只保存在这台设备的浏览器里，之后随时可以登录并上传。': 'Your data stays in this browser. You can sign in and upload it anytime.',
    '离线优先': 'Offline first', '没网也能记，联网再同步': 'Works offline, syncs later',
    '仅你可见': 'Private', '账号之间彼此隔离': 'Only you can see your data',
    '随时导出': 'Yours to keep', 'JSON 备份随时可用': 'Export a JSON backup anytime',
    '请填写邮箱。': 'Please enter your email.',
    '邮箱格式不正确。': 'That email doesn’t look right.',
    '请填写密码。': 'Please enter your password.',
    '密码至少需要 6 位。': 'Passwords need at least 6 characters.',
    '重新发送确认邮件': 'Resend the confirmation email',
    '先填写注册时用的邮箱，再点「忘记密码」。': 'Enter the email you signed up with, then choose “Forgot password?”.',
    '确认邮件已寄出': 'Confirmation sent',
    '我们向 {email} 发送了一封确认邮件。点击邮件里的链接完成验证，就会自动登录。': 'We sent a confirmation email to {email}. Open the link inside to verify, and you’ll be signed in automatically.',
    '登录链接已寄出': 'Sign-in link sent',
    '打开 {email} 收到的邮件，点击其中的链接即可登录，无需密码。': 'Open the email we sent to {email} and follow the link to sign in — no password needed.',
    '重置链接已寄出': 'Reset link sent',
    '点击 {email} 收到的邮件中的链接，回到这里设置新密码。': 'Follow the link in the email sent to {email}, then come back here to set a new password.',
    '没收到？看看垃圾邮件箱；同一邮箱每分钟只能发送一次。': 'Nothing yet? Check your spam folder. We can send one email per minute.',
    '已重新发送': 'Sent again',
    '本机模式：数据只存在这台设备上': 'Local mode: your data stays on this device',
    '这个邮箱已经注册过了，请直接登录。': 'This email already has an account. Please sign in.',
    '云同步组件加载失败，可先使用本机模式。': 'Couldn’t load the sync module. You can keep using local mode.',
    '云同步尚未配置：config.js 中缺少 Publishable key。': 'Cloud sync isn’t set up: config.js has no publishable key.',
    '无法加载 {src}': 'Couldn’t load {src}',

    /* ---------- errors ---------- */
    '出了点问题，请稍后再试。': 'Something went wrong. Please try again in a moment.',
    '邮箱或密码不正确。': 'The email or password is incorrect.',
    '邮箱尚未验证：请先点击确认邮件中的链接，再回来登录。': 'Your email isn’t verified yet. Open the link in the confirmation email, then come back to sign in.',
    '密码太弱：至少 6 位，建议混合字母与数字。': 'That password is too weak. Use at least 6 characters, with letters and numbers.',
    '邮件发送太频繁，请稍等一分钟再试。': 'Too many emails in a row. Please wait a minute and try again.',
    '操作太频繁，请稍后再试。': 'Too many attempts. Please try again shortly.',
    '当前暂未开放注册。': 'Sign-ups are closed for now.',
    '邮箱登录未启用，请在 Supabase 后台开启 Email 登录方式。': 'Email sign-in is turned off. Enable the Email provider in Supabase.',
    '邮箱地址无效，请检查拼写。': 'That email address isn’t valid. Please check the spelling.',
    '该邮箱不允许接收邮件（Supabase 内置邮件服务只发给项目成员，请配置自定义 SMTP）。': 'This address can’t receive email (Supabase’s built-in mailer only sends to project members — set up custom SMTP).',
    '链接已失效或已被使用，请重新发送。': 'That link has expired or was already used. Please request a new one.',
    '免密登录链接未启用。': 'Sign-in links are turned off.',
    '新密码不能与旧密码相同。': 'Your new password must be different from the old one.',
    '登录状态已失效，请重新登录。': 'Your session has ended. Please sign in again.',
    '找不到这个账号。': 'We couldn’t find that account.',
    '输入格式不正确，请检查邮箱和密码。': 'Something’s not quite right — please check your email and password.',
    'Supabase key 无效：请检查 config.js 里的 Publishable key。': 'Invalid Supabase key. Check the publishable key in config.js.',
    '网络连接失败，请检查网络后重试。': 'Couldn’t connect. Check your connection and try again.',
    '云端还没有建表：请先在 Supabase SQL Editor 运行 schema.sql。': 'The cloud table doesn’t exist yet. Run schema.sql in the Supabase SQL Editor.',
    '没有权限写入云端：请确认 schema.sql 中的 RLS 策略已创建。': 'No permission to write to the cloud. Make sure the RLS policies from schema.sql exist.',
    '登录状态已过期，请重新登录。': 'Your session has expired. Please sign in again.',
    '出了点问题：{m}': 'Something went wrong: {m}',

    /* ---------- sync ---------- */
    '登录同步': 'Sign in to sync', '已同步': 'Synced', '同步中': 'Syncing', '离线': 'Offline', '同步失败': 'Sync failed',
    '本机模式：数据仅存于这台设备': 'Local mode: data stays on this device',
    '已同步：本机与云端一致': 'Synced: this device matches the cloud',
    '同步中…': 'Syncing…',
    '离线：修改已保存在本机，联网后自动上传': 'Offline: changes are saved here and will upload when you’re back online',
    '同步失败，稍后自动重试': 'Sync failed — retrying shortly',
    '同步状态：{s}，账号 {email}。打开账号面板': 'Sync: {s}, account {email}. Open account panel',
    '本机模式，点击登录以开启云同步': 'Local mode. Select to sign in and turn on cloud sync',
    '离线，修改已保存在本机': 'Offline. Changes are saved on this device',
    '离线，修改会保存在本机': 'Offline. Changes will be saved on this device',
    '网络已恢复，正在同步': 'Back online, syncing',
    '云端数据格式异常': 'Cloud data is malformed',
    '云端数据格式异常，已保留本机数据': 'Cloud data is malformed — kept the data on this device',
    '已把本机数据上传到云端': 'Uploaded this device’s data to the cloud',
    '已载入云端数据': 'Loaded your data from the cloud',
    '两端都有修改，已保留较新的本机版本': 'Both sides changed — kept the newer copy on this device',
    '两端都有修改，已采用较新的云端版本': 'Both sides changed — using the newer cloud copy',
    '改用另一份': 'Use the other',
    '较新 · 推荐': 'Newer · suggested',
    '{h} 个习惯': function (v) { return pl(v.h, '1 habit', '{n} habits'); },
    '{g} 个目标': function (v) { return pl(v.g, '1 goal', '{n} goals'); },
    '{c} 次打卡': function (v) { return pl(v.c, '1 check-in', '{n} check-ins'); },
    '带入本机数据吗？': 'Bring this device’s data along?',
    '这台设备上的数据来自另一个账号。你的云端还是空的，要把它们带进当前账号，还是从空白开始？': 'The data on this device belongs to another account. Your cloud is empty — bring it into this account, or start fresh?',
    '本机': 'This device', '带入本机数据': 'Bring it along',
    '修改于 {t}': 'Edited {t}',
    '空白': 'Blank', '从空白开始': 'Start fresh', '保留默认领域，其余清空': 'Keeps the default areas, clears the rest',
    '本机与云端不一致': 'This device and the cloud differ',
    '这台设备上的数据来自另一个账号，': 'The data on this device belongs to another account. ',
    '本机有未登录时记下的内容，': 'This device has entries made before you signed in. ',
    '本机和云端都有修改，': 'Both this device and the cloud have changes. ',
    '请选择保留哪一份，另一份会被替换。': 'Choose which to keep; the other will be replaced.',
    '本机和云端都有修改。请选择保留哪一份，另一份会被替换。': 'Both this device and the cloud have changes. Choose which to keep; the other will be replaced.',
    '保留本机版本': 'Keep this device’s copy',
    '云端': 'Cloud', '使用云端版本': 'Use the cloud copy',
    '来自 {d}': 'From {d}',
    '拿不准？先': 'Not sure?', '导出本机备份': 'Export a backup', '，再做选择。': ' first, then decide.',
    '刚刚': 'just now',
    '{n} 分钟前': function (v) { return pl(v.n, '1 min ago', '{n} min ago'); },
    '今天 {t}': 'today {t}', '昨天 {t}': 'yesterday {t}',
    '设备': 'Device', '浏览器': 'Browser',

    /* ---------- account ---------- */
    '账号与同步': 'Account & sync',
    '已登录': 'Signed in as',
    '同步状态': 'Status', '上次同步': 'Last sync', '本机数据': 'On this device',
    '退出登录': 'Sign out', '立即同步': 'Sync now',
    '本机会保留一份数据副本，方便离线查看。如果这是公共设备，建议一并清除。': 'A copy stays on this device for offline use. On a shared device, clear it too.',
    '还有修改尚未上传到云端，退出后它们只保留在本机。': 'Some changes haven’t reached the cloud yet; after signing out they’ll stay only on this device. ',
    '数据已同步到云端。': 'Everything is synced to the cloud. ',
    '本机会保留一份副本，方便离线查看；如果这是公共设备，建议一并清除。': 'A copy stays on this device for offline use. On a shared device, clear it too.',
    '清除本机数据并退出': 'Sign out and clear this device',
    '退出': 'Sign out',
    '已退出，本机数据已清除': 'Signed out. This device is cleared',
    '已退出登录': 'Signed out',
    '欢迎，{email}': 'Welcome, {email}',
    '设置新密码': 'Set a new password',
    '你正通过重置链接登录，请设置一个新密码。': 'You’re signed in with a reset link. Choose a new password.',
    '新密码': 'New password', '稍后': 'Later', '保存新密码': 'Save password',
    '新密码已保存': 'New password saved'
  };

  var WD_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var WD_EN_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WD_ZH = ['一', '二', '三', '四', '五', '六', '天'];   // 周一 … 周天（界面里刻意用「周天」）

  function detect() {
    try { var s = localStorage.getItem(KEY); if (s === 'zh' || s === 'en') return s; } catch (e) {}
    var l = (navigator.languages && navigator.languages[0]) || navigator.language || 'zh';
    return /^zh/i.test(l) ? 'zh' : 'en';
  }
  var lang = root.getAttribute('data-lang') === 'en' || root.getAttribute('data-lang') === 'zh' ? root.getAttribute('data-lang') : detect();
  var missing = [];

  function fill(s, v) { return v ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return k in v ? v[k] : m; }) : s; }
  function t(s, v) {
    if (lang === 'en') {
      if (Object.prototype.hasOwnProperty.call(EN, s)) { var o = EN[s]; return typeof o === 'function' ? o(v || {}) : fill(o, v); }
      if (CJK.test(s) && missing.indexOf(s) < 0) missing.push(s);
    }
    return s.charAt(0) === '@' ? s : fill(s, v);
  }

  /* ---------- 时间 ---------- */
  var fmt = {
    wdShort: function (i) { return lang === 'en' ? WD_EN[i] : '周' + WD_ZH[i]; },          // 周一 / Mon
    wdLong: function (i) { return lang === 'en' ? WD_EN_LONG[i] : '星期' + WD_ZH[i]; },     // 星期一 / Monday
    md: function (d) { return lang === 'en' ? MON_EN[d.getMonth()] + ' ' + d.getDate() : (d.getMonth() + 1) + '/' + d.getDate(); },
    mdLong: function (d) { return lang === 'en' ? MON_EN_LONG[d.getMonth()] + ' ' + d.getDate() : (d.getMonth() + 1) + '月' + d.getDate() + '号'; },
    month: function (m) { return lang === 'en' ? MON_EN[m] : (m + 1) + '月'; },
    range: function (a, b) {
      if (lang !== 'en') return (a.getMonth() + 1) + '.' + a.getDate() + ' — ' + (b.getMonth() + 1) + '.' + b.getDate();
      return a.getMonth() === b.getMonth() ? MON_EN[a.getMonth()] + ' ' + a.getDate() + '–' + b.getDate() : MON_EN[a.getMonth()] + ' ' + a.getDate() + ' – ' + MON_EN[b.getMonth()] + ' ' + b.getDate();
    }
  };

  /* ---------- 静态 DOM ---------- */
  var reg = [];   // { node, attr?, zh }
  var ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
  function translatable(s) { s = s.trim(); return s && (CJK.test(s) || Object.prototype.hasOwnProperty.call(EN, s)); }
  function collect() {
    var skip = '[data-i18n],[data-i18n-html],[data-lang-switch],[data-i18n-skip],script,style';
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { var p = n.parentElement; if (!p || p.closest(skip)) return NodeFilter.FILTER_REJECT; return translatable(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }
    });
    var n; while ((n = w.nextNode())) reg.push({ node: n, zh: n.nodeValue });
    Array.prototype.forEach.call(document.body.querySelectorAll('*'), function (el) {
      if (el.closest('[data-lang-switch],[data-i18n-skip]')) return;
      ATTRS.forEach(function (a) { var v = el.getAttribute(a); if (v && translatable(v)) reg.push({ node: el, attr: a, zh: v }); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { reg.push({ node: el, key: el.getAttribute('data-i18n'), zh: el.textContent }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-html]'), function (el) { reg.push({ node: el, key: el.getAttribute('data-i18n-html'), html: true, zh: el.innerHTML }); });
    var md = document.querySelector('meta[name="description"]');
    if (md) reg.push({ node: md, attr: 'content', key: '@desc', zh: md.getAttribute('content') });
    zhTitle = document.title;
  }
  var zhTitle = '';
  function apply() {
    reg.forEach(function (r) {
      var out;
      if (lang !== 'en') out = r.zh;
      else if (r.key) out = Object.prototype.hasOwnProperty.call(EN, r.key) ? EN[r.key] : r.zh;
      else {
        var core = r.zh.trim(), lead = r.zh.match(/^\s*/)[0], tail = r.zh.match(/\s*$/)[0];
        out = Object.prototype.hasOwnProperty.call(EN, core) ? lead + EN[core] + tail : (CJK.test(core) && missing.indexOf(core) < 0 && missing.push(core), r.zh);
      }
      if (r.attr) r.node.setAttribute(r.attr, out);
      else if (r.html) r.node.innerHTML = out;
      else if (r.key) r.node.textContent = out;
      else r.node.nodeValue = out;
    });
    document.title = lang === 'en' ? EN['@title'] : zhTitle;
    paintSwitches();
  }

  /* ---------- 语言切换（中文 / EN） ---------- */
  function paintSwitches() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-lang-switch]'), function (box) {
      if (!box.firstChild) {
        box.setAttribute('role', 'group');
        box.innerHTML = '<button type="button" class="lang-switch__opt" data-set-lang="zh" lang="zh-CN">中文</button><span class="lang-switch__sep" aria-hidden="true">/</span><button type="button" class="lang-switch__opt" data-set-lang="en" lang="en">EN</button>';
      }
      box.setAttribute('aria-label', lang === 'en' ? 'Language' : '语言');
      Array.prototype.forEach.call(box.querySelectorAll('[data-set-lang]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang)); });
    });
  }
  function setRootLang() {
    root.lang = lang === 'en' ? 'en' : 'zh-CN';
    root.setAttribute('data-lang', lang);
  }
  function set(l, opts) {
    l = l === 'en' ? 'en' : 'zh';
    try { localStorage.setItem(KEY, l); } catch (e) {}
    if (l === lang) { paintSwitches(); return; }
    lang = l; setRootLang(); apply();
    root.classList.remove('is-lang-swap'); void root.offsetWidth; root.classList.add('is-lang-swap');
    clearTimeout(set._t); set._t = setTimeout(function () { root.classList.remove('is-lang-swap'); }, 400);
    try { document.dispatchEvent(new CustomEvent('gp:lang', { detail: { lang: lang } })); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-set-lang]');
    if (!b) return;
    set(b.getAttribute('data-set-lang'));
    // 保持焦点在当前语言按钮上（同一个开关）
    var same = b.closest('[data-lang-switch]'); var cur = same && same.querySelector('[data-set-lang="' + lang + '"]'); if (cur) cur.focus();
  });
  // 另一个标签页切换了语言
  addEventListener('storage', function (e) { if (e.key === KEY && (e.newValue === 'zh' || e.newValue === 'en') && e.newValue !== lang) set(e.newValue); });

  setRootLang();
  collect();
  apply();
  root.classList.remove('i18n-pending');

  window.I18N = {
    t: t, fmt: fmt, set: set,
    get lang() { return lang; },
    missing: missing,
    has: function (s) { return Object.prototype.hasOwnProperty.call(EN, s); }
  };
})();
