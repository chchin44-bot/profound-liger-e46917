#!/bin/bash
# 每一輪的第一個指令。開發容器回捲過八次，每次都是「產品活著、工程資產死掉」。
#
# v93i：這支以前是 fail-open —— 它對人喊「停手」，對 shell 卻回 exit 0，
# 任何自動化流程（包括串指令）都會當它成功。最典型的回捲證據「.git 不見了」
# 甚至沒有計入 bad。現在改成 fail-closed：工程資產或 .git 缺失一律 exit 2。
#
# 測試清單也不再硬編在這裡，改讀 tools/tests.manifest——
# 否則新增第 70 支測試要同時改兩個地方，那就是「同一個 enum 兩份副本」，
# 而那正是這個專案最常出事的形狀。
TOOLS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$TOOLS/.." && pwd)"
cd "$REPO"
bad=0

echo "容器開機   $(uptime -s 2>/dev/null || echo '（查不到）')   現在 $(date -u '+%Y-%m-%d %H:%M:%S') UTC"
if [ -f index.html ]; then
  echo "index      $(grep -o 'v9[0-9] · 2026-[0-9-]* [0-9:]*' index.html | head -1)   改於 $(stat -c %y index.html 2>/dev/null | cut -c1-16)"
else
  echo "!! index.html 不見了"; bad=1
fi

# ── 一、非測試的工程資產 ────────────────────────────────────────
for f in tools/tests.manifest tools/test-baseline.json tools/run-suite.sh tools/sync-source.sh; do
  [ -f "$f" ] || { echo "!! 工程資產不見了：$f"; bad=1; }
done

# ── 二、manifest 宣告的每一支測試都要在 ────────────────────────
if [ -f tools/tests.manifest ]; then
  n=0; gone=0
  while IFS=$'\t' read -r path group enabled requires expect; do
    case "$path" in ''|\#*) continue;; esac
    [ "$enabled" = "1" ] || continue
    n=$((n+1))
    [ -f "$path" ] || { echo "!! 測試檔不見了：$path"; gone=$((gone+1)); }
  done < tools/tests.manifest
  if [ $gone -gt 0 ]; then
    echo "!! manifest 登錄 $n 支，其中 $gone 支的檔案已經不在"; bad=1
  else
    echo "測試       manifest 登錄 $n 支，全部都在"
  fi
fi

# ── 三、回捲的典型徵兆 ──────────────────────────────────────────
[ -d .git ] || { echo "!! .git 不見了（回捲的典型徵兆）"; bad=1; }

if [ $bad -ne 0 ]; then
  echo
  echo "**停手，先跟使用者確認，不要編輯任何檔案。**"
  echo "（這支腳本會以 exit 2 結束，串在它後面的指令不會再被當成成功。）"
  exit 2
fi
echo "工程資產齊全。"
exit 0
