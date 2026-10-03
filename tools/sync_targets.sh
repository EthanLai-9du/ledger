#!/usr/bin/env bash
# 把源码同步到部署目录与安卓壳 www/（保留安卓专用的 native.js、它的 script 标签，以及 www/cloud.js 里的 Capacitor 改动）
set -euo pipefail
SRC=/workspace/growth-plan-app; D=/workspace/ledger-deploy/ledger; W=/workspace/ledger-android/www
for f in index.html style.css pixel.css cuties.css tabs.css crew.js skin.js app.js i18n.js sw.js config.js manifest.webmanifest cloud.js _headers vercel.json schema.sql README.md; do cp "$SRC/$f" "$D/$f"; done
for f in style.css pixel.css cuties.css tabs.css crew.js skin.js app.js i18n.js sw.js config.js manifest.webmanifest; do cp "$SRC/$f" "$W/$f"; done
for t in "$D" "$W"; do for d in fonts icons vendor; do rm -rf "$t/$d"; cp -r "$SRC/$d" "$t/$d"; done; done
python3 - <<'PY'
s = open('/workspace/growth-plan-app/index.html', encoding='utf-8').read()
import re
m = re.search(r'<script src="cloud\.js(\?v=\d+)?" defer></script>\n', s)
assert m
old = m.group(0)
open('/workspace/ledger-android/www/index.html', 'w', encoding='utf-8').write(s.replace(old, old + '<script src="native.js" defer></script>\n'))
PY
# www/cloud.js：源码 cloud.js + 两处 Capacitor 改动（检查源码 cloud.js 没变，否则需要手动合并）
if ! diff <(sed -e '63d' -e '666d' "$SRC/cloud.js") <(sed -e '63d' -e '666d' "$W/cloud.js") >/dev/null; then echo "WARN: cloud.js differs beyond the Capacitor tweaks — merge by hand"; fi
echo synced
