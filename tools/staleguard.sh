#!/bin/bash
# 每一輪的第一個指令。容器回捲過七次，每次都是「產品活著、工程資產死掉」。
cd /mnt/user-data/working
echo "容器開機   $(uptime -s)   現在 $(date -u '+%Y-%m-%d %H:%M:%S') UTC"
echo "index      $(grep -o 'v9[0-9] · 2026-[0-9-]* [0-9:]*' index.html | head -1)   改於 $(stat -c %y index.html | cut -c1-16)"
bad=0
for f in tests.manifest sync-source.sh run-suite.sh scratch/lv.mjs scratch/prov.mjs scratch/paneltitle.mjs; do
  [ -f "$f" ] || { echo "!! 工程資產不見了：$f"; bad=1; }
done
[ -d .git ] || echo "!! .git 不見了（回捲的典型徵兆）"
[ $bad -eq 1 ] && echo "**停手，先跟使用者確認，不要編輯任何檔案**"
exit 0
