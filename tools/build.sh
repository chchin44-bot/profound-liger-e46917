#!/bin/bash
set -e
cd /mnt/user-data/working

# ══ 注意：v93d 起 index.html 才是主檔 ══════════════════════════════
# 這支腳本會用 source.html **覆蓋** index.html。而 source.html 現在是衍生產物，
# 有可能比 index.html 舊（例如容器回捲之後）——那樣一跑就會把修好的產品蓋掉。
# 所以預設擋住：只有在你真的要「從底稿重建」時才明確放行。
#
#   日常修改：直接改 index.html，然後 ./sync-source.sh
#   真的要重建：REBUILD_FROM_SOURCE=1 ./build.sh
if [ "${REBUILD_FROM_SOURCE:-0}" != "1" ]; then
  echo "!! build.sh 會用 source.html 覆蓋 index.html，而 index.html 才是主檔。"
  echo "   日常修改請直接改 index.html，再跑 ./sync-source.sh 同步底稿。"
  echo "   真的要從底稿重建，請下：REBUILD_FROM_SOURCE=1 ./build.sh"
  exit 10
fi
# 再檢查一次新舊：source.html 比 index.html 舊就一定是出事了
if [ -f index.html ] && [ source.html -ot index.html ]; then
  echo "!! source.html 比 index.html 舊（$(date -r source.html '+%F %T') < $(date -r index.html '+%F %T')）"
  echo "   從舊底稿重建會把已經修好的產品蓋掉。先跑 ./sync-source.sh，或確認你真的要回捲。"
  exit 11
fi

# ── 建置前的三道防線 ─────────────────────────────────────────────
# 這些防線跟被保護的檔案在同一顆磁碟上，所以它們**防不了容器回捲**，
# 只能讓人早一點發現。真正的解法是把 repo push 到自己的 GitHub。
for MARK in restoreWatchlist DEFAULT_FS epsAmbiguous PE_BASIS_COPY ANIMAL_META; do
  grep -q "$MARK" source.html || {
    echo "!! source.html 找不到 $MARK —— 底稿可能被回捲成舊版，停止建置。"
    echo "!! 容器開機：$(uptime -s)　source.html 改於：$(date -r source.html '+%F %T')"
    exit 9; }
done
if [ -f index.html ]; then
  CUR=$(grep -o 'v[0-9]\+ · 2026' index.html | head -1 | tr -dc '0-9' | head -c 2)
  NEW=$(tr -dc '0-9' < VERSION)
  if [ -n "$CUR" ] && [ -n "$NEW" ] && [ "$NEW" -lt "$CUR" ]; then
    echo "!! VERSION=$NEW 比現有 index.html 的 v$CUR 舊，停止建置。"; exit 9
  fi
fi
mkdir -p .buildbak
[ -f index.html ] && cp index.html ".buildbak/index.$(date '+%m%d-%H%M%S').html"
ls -1t .buildbak/index.*.html 2>/dev/null | tail -n +25 | xargs -r rm -f
# ────────────────────────────────────────────────────────────────
npx tailwindcss -c twc.js -i tw.in.css -o tw.out.css --minify >/dev/null 2>&1
python3 - <<'PY'
import re, datetime
base = '/mnt/user-data/working/'
s   = open(base+'source.html', encoding='utf-8').read()
css = open(base+'tw.out.css',  encoding='utf-8').read()
js  = open(base+'node_modules/chart.js/dist/chart.umd.js', encoding='utf-8').read()

# 版本標記在建置時填入 —— 手動維護的版本號一定會忘記更新，這樣不可能寫錯
ver = open(base+'VERSION', encoding='utf-8').read().strip()
tz  = datetime.timezone(datetime.timedelta(hours=8))       # 台北時間
tag = f"v{ver} · {datetime.datetime.now(tz).strftime('%Y-%m-%d %H:%M')}"

out = s.replace('@@ASSETS@@', "<style>"+css+"</style>\n<script>"+js.replace('</script>','<\\/script>')+"</script>")
out = out.replace('@@BUILD@@', tag)
assert '@@ASSETS@@' not in out and '@@BUILD@@' not in out
assert 'Chart.js v4' in out and 'src="http' not in out
for f in ['taiwan-stock-dashboard.html', 'index.html']:
    open(base+f, 'w', encoding='utf-8').write(out)
open('/tmp/app.js', 'w', encoding='utf-8').write(re.findall(r'<script>(.*?)</script>', s, re.S)[-1])
print('   build tag:', tag)
PY
node --check /tmp/app.js
echo "built  $(wc -l < source.html) lines"
