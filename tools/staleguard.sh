#!/bin/bash
# 每一輪動手前的第一個指令。這個雲端容器會被回收，回收後掛回來的
# 可能是好幾天前的快照（到 2026-08-20 為止已經發生 6 次）。
cd /mnt/user-data/working
echo "容器開機   $(uptime -s)   現在 $(date -u '+%F %T') UTC"
echo "VERSION    $(cat VERSION 2>/dev/null || echo '(不見了)')"
echo "source     $(wc -l < source.html 2>/dev/null) 行   改於 $(date -r source.html '+%F %T' 2>/dev/null)"
echo "index      $(grep -o 'v[0-9]* · 2026-[0-9-]* [0-9:]*' index.html 2>/dev/null | head -1)"
BAD=0
for M in restoreWatchlist DEFAULT_FS epsAmbiguous PE_BASIS_COPY ANIMAL_META TXN_ORDER; do
  grep -q "$M" source.html 2>/dev/null || { echo "!! source.html 缺 $M"; BAD=1; }
done
for F in tests.manifest test-baseline.json r13/pebasis.mjs r13/animalmeta.mjs r13/fsdefault.mjs; do
  [ -e "$F" ] || { echo "!! 工程資產不見了：$F"; BAD=1; }
done
[ -d .buildbak ] || { echo "!! .buildbak 不見了（回捲的典型徵兆）"; BAD=1; }
[ -d .git ]      || { echo "!! .git 不見了（回捲的典型徵兆）"; BAD=1; }
[ $BAD -eq 0 ] && echo "OK：底稿與工程資產看起來都是最新的" \
               || echo "**停手，先跟使用者確認，不要編輯任何檔案**"
exit $BAD
