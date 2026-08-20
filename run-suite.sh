#!/bin/bash
# 這個資料夾裡累積了十幾輪的探索性腳本（a*_、c*、chaos*、dad*…），
# 那些是當初找 bug 用的一次性工具，很多故意留著失敗的狀態當紀錄。
# 「回歸測試套件」指的是下面這一份名單——每次改完 source.html 跑這個。
#
#   ./build.sh && ./run-suite.sh
#
cd "$(dirname "$0")"

# 不在名單裡但刻意保留的：
#   r13/cors.mjs —— 那是一次性的調查腳本，要一台 localhost 伺服器加上真的連得到
#   FinMind 才跑得起來（它問的是「即時報價失敗是權限還是 CORS」）。
#   放進回歸套件只會每次都紅一條，然後大家學會忽略紅字——那比沒有測試更糟。

ROOT="invariants ledger close audit txn_e2e dlg fs reg"
R13="ui fold warn toast eddie secfold t100db broken pebase fcf fcf2 rt rtdiag \
rtempty live target verify window wide look look2 fees toastclose btnsize \
closeall penote rtclock overlap costlines autoconn legend_short par reachtarget \
zoom priv stalegate ttmeps lookup bootmarket mktstale misc85 bigfs exitpx \
contrast longmiss onenum unkbuy reduce87 adj87 bounds87 cachehonest resil87 \
statgrid blockc sec88 privsweep walk walkdeep"

pass=0; failed=""
run(){
  local f="$1"
  local out; out=$(node "$f" 2>&1); local rc=$?
  local tail; tail=$(echo "$out" | grep -E '^(FAIL=|\s*發現|.*issues?)' | tail -1)
  if [ $rc -eq 0 ]; then
    pass=$((pass+1)); printf '  ok   %-24s %s\n' "$f" "$tail"
  else
    failed="$failed $f"; printf '!!FAIL %-24s %s\n' "$f" "$tail"
    echo "$out" | grep '^!!FAIL' | head -8 | sed 's/^/         /'
  fi
}

# v93 之後新增的契約測試（估值引擎、provenance、面板標題）。
# 放在 scratch/ 只是因為當初是探索用的，但它們現在是回歸套件的一部分——
# 不列進來就等於「寫了測試但沒有人跑」，那跟沒寫一樣。
SCRATCH="lv prov paneltitle"

for f in $ROOT;    do run "$f.mjs"; done
for f in $R13;     do run "r13/$f.mjs"; done
for f in $SCRATCH; do run "scratch/$f.mjs"; done

echo
if [ -z "$failed" ]; then echo "全部通過（$pass 支）"; exit 0; fi
echo "失敗：$failed"; exit 1
