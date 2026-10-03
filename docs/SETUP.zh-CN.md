# Ledger · 中文配置与部署说明

> 英文版项目介绍见仓库根目录的 [README.md](../README.md)。本文是 Supabase 配置、部署、同步机制与版本记录的中文详细说明。

一个安静的个人记录工具：目标拆解、习惯打卡、本周一览、近半年热力图。
视觉上刻意保持克制——暖白纸面、石墨色文字、只有一种苔绿色表示「完成」，支持浅色 / 深色、手机与桌面。
纯静态网站，无需构建；数据**先存本机（离线优先）**，登录后通过 Supabase **自动同步到云端**，换设备也不丢。
也可以选择「不登录，仅本机使用」。

---

## 一、快速开始（3 步）

### 1. 建表：运行 `schema.sql`

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard) → 进入项目 `qgqfbouvhbenjgcrstyz`
2. 左侧 **SQL Editor** → **New query**
3. 把 `schema.sql` 全部内容粘贴进去 → 点 **Run**
4. 看到 `Success. No rows returned` 即可（脚本可重复执行）

它会创建 `public.user_state` 表，并**开启 RLS**：每个用户只能查询 / 新建 / 修改 / 删除自己的那一行；未登录（anon）完全无权访问。

### 2. 填 key：修改 `config.js`

> 当前 `config.js` 已填入本项目的 Publishable key（公开 key，可放心随网站发布）。换项目时再改这里。

```js
window.SUPABASE_URL = 'https://qgqfbouvhbenjgcrstyz.supabase.co';
window.SUPABASE_KEY = 'sb_publishable_xxxxxxxx';   // ← 换成你的 Publishable key
```

- key 位置：Dashboard → **Project Settings → API Keys** → 复制 **Publishable key**（`sb_publishable_…`）；旧项目也可以用 **anon public** key（`eyJ…`）。
- publishable / anon key 本来就是公开在前端的，安全由 RLS 保证。
- ⚠️ **绝对不要**填 `service_role` / `secret` key。
- 不填（保留 `PASTE_PUBLISHABLE_KEY_HERE`）时，网站只提供本机模式，其它功能照常。

### 3. 检查 Auth 设置

Dashboard → **Authentication**：

| 设置 | 位置 | 建议 |
|---|---|---|
| **Site URL** | Authentication → URL Configuration | 填正式网址，如 `https://your-app.vercel.app` |
| **Redirect URLs** | 同上 → Add URL | 加入所有会用到的地址，例如：<br>`http://localhost:8765/**`<br>`https://your-app.vercel.app/**`<br>`https://*-yourname.vercel.app/**`（Vercel 预览）<br>`https://your-app.netlify.app/**` |
| **Email 登录** | Authentication → Sign In / Providers → Email | 保持开启 |
| **Confirm email** | 同上 | 正式使用建议**开启**；本地快速测试可**暂时关闭**，注册后立即登录 |
| **自定义 SMTP** | Authentication → Emails → SMTP Settings | Supabase 自带邮件服务**发送频率很低**，并且可能只发给项目团队成员的邮箱。要给其他人发确认 / 免密登录邮件，请配置自己的 SMTP（如 Resend、SendGrid、阿里云邮件推送） |

> 确认邮件、免密登录链接、重置密码邮件里的链接都会跳回 `Redirect URLs` 中的地址；如果没加，会被重定向到 Site URL。

---

## 二、本地运行

Service Worker 与邮件回跳都需要 http(s)，请用本地服务器打开（而不是双击 `index.html`）：

```bash
cd growth-plan-app
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765
```

> 直接双击 `index.html`（file://）也能用：本机模式与密码登录正常，但不会注册离线缓存，免密链接也无法回跳。

---

## 三、部署

整个文件夹就是网站，**无需构建命令**。

### Vercel
1. 方式 A：把文件夹推到 GitHub → Vercel **Add New Project** → 导入仓库 → Framework Preset 选 **Other**，Build Command 留空，Output Directory 留空（根目录）→ Deploy。
2. 方式 B：命令行 `npm i -g vercel && vercel --prod`（在本文件夹内运行）。
3. 部署后把 `https://<项目>.vercel.app/**` 加进 Supabase 的 Redirect URLs，并把 Site URL 设成它。
4. 已附带 `vercel.json`：让 `sw.js`、`config.js` 不被长期缓存。

### Netlify
1. 最快：打开 <https://app.netlify.com/drop>，把整个文件夹拖进去。
2. 或连接 Git 仓库：Build command 留空，Publish directory 填 `.`。
3. 同样把 `https://<站点>.netlify.app/**` 加进 Redirect URLs。
4. 已附带 `_headers`（Netlify 响应头配置）。

---

## 四、同步是怎么工作的

**数据表设计：每个用户一行 `user_state(user_id, data jsonb, rev, updated_at, synced_at, device)`。**
原因：`app.js` 的数据本来就是一整份 JSON 文档（`areas / habits / goals[tasks] / log{"YYYY-MM-DD": [习惯 id]}`），并且整份校验、整份导入导出。存成一行 jsonb 和前端模型一一对应，离线合并时只需比较一份文档，不会出现「习惯同步了、打卡没同步」的半同步状态；一个学期的数据也就几十 KB。

- **离线优先**：每次修改立即写 localStorage，再去抖（约 1.2 秒）推送到云端；连续操作只推一次。
- **离线 / 断网**：状态显示「离线」，修改照常保存；联网（`online` 事件）后自动补传，失败按 2s→4s→…→60s 退避重试。
- **乐观锁**：更新时带上 `rev = 上次同步的版本`，数据库触发器每次自增 `rev`。若别的设备先写了，更新 0 行 → 自动重新拉取并决策，绝不静默覆盖。
- **登录时**：
  - 云端为空、本机有数据 → 上传本机；
  - 本机是首次打开的示例数据、云端有数据 → 直接载入云端；
  - 只有一边改过 → 采用改过的那边；
  - 两边都改过 → 以 `updated_at`（最后修改时间）较新者为准。差异小（习惯 / 目标数量相同、打卡差 ≤ 2 次）时自动采用较新版本，并给出「改用另一份」的撤销提示；差异明显时弹出对比框（两边的习惯数、目标数、打卡数、修改时间、设备），推荐较新的一份，并可先导出备份。
  - 本机数据属于另一个账号、而当前账号云端为空 → 询问「带入本机数据」还是「从空白开始」。
- **状态指示**（右上角）：已同步 / 同步中 / 离线 / 同步失败；点开可看账号邮箱、上次同步时间、立即同步、退出登录。
- **退出登录**：可选择保留本机副本，或清除本机数据（公共设备推荐）。
- 回到前台、切换标签页时会自动拉取最新数据；同一浏览器多个标签页之间也会互相刷新。

## 五、文件说明

| 文件 | 作用 |
|---|---|
| `index.html` / `style.css` / `app.js` | 应用本体（含首页（landing，未登录时先显示，点「登录 / 注册」进入登录页）、登录页、同步状态、对话框；app.js 暴露 `window.GP` 供同步模块使用） |
| `cloud.js` | 登录 / 注册 / 免密链接 / 找回密码、同步引擎、冲突处理、PWA 注册 |
| `config.js` | **唯一需要手动修改**：Supabase URL 与 Publishable key |
| `schema.sql` | 建表 + RLS 策略（粘贴到 SQL Editor 运行） |
| `vendor/supabase.min.js` | 本地内置的 supabase-js v2.117.2（UMD），运行时不依赖 CDN |
| `manifest.webmanifest` / `sw.js` / `icons/` | PWA：可安装到桌面 / 主屏幕，离线打开（不缓存任何 Supabase 请求）。图标为「L」字母标，由 `tools/make_icons.py` 生成 |
| `i18n.js` | 中文 / English 界面：以中文原文为键的英文词典，自动翻译静态文案与 aria / placeholder / title；`I18N.t()` / `I18N.fmt` 供脚本使用。语言默认跟随浏览器，切换后存在 `localStorage['growth-plan:lang']`，并同步 `<html lang>` 与页面标题 |
| `fonts/` | 自托管 woff2 字体（均为 SIL OFL 1.1，许可证见 `fonts/LICENSES.md`）：Noto Serif SC 子集（中文标题）、Newsreader 正体 / 斜体（字标、英文标题、数字）、Inter（英文正文）。中文正文使用系统黑体 |
| `tools/build_fonts.py` | 重新生成字体子集（需 fonttools + brotli；源字体放在 `/workspace/fontsrc`）。改动界面中文后请重跑，保证新字被收录 |
| `vercel.json` / `_headers` | Vercel / Netlify 缓存头 |

## 六、已知限制

- 冲突以「整份文档」为单位选择一份保留，不做逐条合并（例如两台设备离线时各打了不同的卡，最终只保留一边；对比框会提示差异，可先导出备份）。
- 「较新」以设备本地时钟判断；设备时间严重不准时可能误判（对比框仍会让你确认）。
- 不使用 Realtime 推送：另一台设备的修改在回到前台 / 刷新 / 点「立即同步」时拉取。
- Supabase 自带邮件服务有严格限额，正式给他人使用请配置自定义 SMTP。
- 单份数据上限 2 MB（schema 中的约束；正常使用远远达不到）。

## 七、版本说明

- **v9 · 每天提醒 + 中文字体切片**：「设置」面板新增「每天提醒」（默认关闭，默认 21:00，只存本机 `growth-plan:reminder`）。
  安卓 App 用 `@capacitor/local-notifications` 排每天重复的本机通知（Android 13+ 打开时申请通知权限；不申请精确闹钟，系统会用非精确时间）；
  网页没有推送服务器，只在页面 / 已安装的 PWA 开着时到点提醒，帮助文字如实说明并推荐安卓版；浏览器不支持通知时整块隐藏。
  中文衬线字体按 unicode-range 切片：首屏只下载约 40 KB 的关键切片（界面标题用字），GB2312 一级字 + 常用 3500 字分成 13 片按需下载（`fonts/serif-sc.css`）。
  中文首页首次加载的字体从约 515 KB 降到约 129 KB。Service Worker 缓存版本升级为 `gp-shell-v9-ledger`。测试：`tools/gp_reminder_test.py`、`tools/gp_font_test.py`。

- **v8 · 手机设置面板与分语言的一句话**：手机顶栏把「主题」与「中文 / EN」收进一个「设置」小面板（Esc / 点外面关闭，焦点回到按钮；桌面与首页不变）。
  顶部的一句话按语言分开保存（`mottos: { zh, en }`），旧数据里的那一句按文字自动归到中文或英文；旧字段 `motto` 继续保留，旧版客户端照常可用。
  Service Worker 缓存版本升级为 `gp-shell-v8-ledger`。测试：`tools/gp_menu_test.py`。双语认证邮件模板见 `/workspace/ledger-email-templates/`。

- **v7 · 字体与英文版**：自托管字体（中文标题衬线 + 英文 Newsreader / Inter，全部 font-display: swap，总计约 515 KB，英文模式只下载约 91 KB）；
  新增 English 界面（首页右上角、登录页、应用顶栏都有「中文 / EN」切换），新用户在英文模式下得到英文入门模板。
  Service Worker 缓存版本升级为 `gp-shell-v7-ledger`。测试：`tools/gp_i18n_test.py`。

- **v4 · Ledger**：改名为 Ledger；去掉印章、竖排文字与口号，改为低调的字标与石墨 / 苔绿配色；打卡反馈改为轻微的勾选动画。
  Service Worker 缓存版本升级为 `gp-shell-v4-ledger`，旧缓存会在新版本激活时自动删除。
  已保存旧默认口号的数据，载入时会自动换成新的默认句子「慢慢来，比较快。」（可随时改写）。
