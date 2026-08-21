#!/bin/bash
# 回歸套件執行器（v93i）
#
#   tools/run-suite.sh                      跑全部，跟 test-baseline.json 對帳
#   UPDATE_BASELINE=1 tools/run-suite.sh    把目前結果寫成新的 baseline（要人看過才做）
#   ONLY=contract tools/run-suite.sh        只跑某一個 group（core / r13 / contract）
#
# 跟舊版最大的差別：
#   ① 名單不再寫在這支腳本裡，改讀 tools/tests.manifest（唯一名單）
#   ② 會對帳 —— 少跑、多跑、沒登錄、已知紅燈變綠，全部算失敗
#   ③ 不再只看 exit code。exit 0 但只跑了一半（SHORT）也算失敗
#
# 為什麼要這麼嚴：開發容器已經回捲八次，每次都是「產品活著、工程資產死掉」。
# 少一支測試而沒有人發現，比那支測試紅掉更危險——紅燈至少看得見。
# 而且實測抓到過一支 dlg.mjs：21 條斷言在失敗，卻因為沒有呼叫 process.exit
# 而被舊 runner 報成綠燈，不知道紅了幾輪。
TOOLS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$TOOLS/.." && pwd)"
cd "$REPO"                       # 所有測試都用「相對於 repo 根目錄」的路徑找 index.html

MANIFEST="$TOOLS/tests.manifest"
BASELINE="$TOOLS/test-baseline.json"
RESULTS="$(mktemp)"
trap 'rm -f "$RESULTS"' EXIT

[ -f "$MANIFEST" ] || { echo "!! 找不到 tools/tests.manifest —— 沒有名單就不知道該跑什麼，停手。"; exit 2; }

# ── 一、讀名單，先確認每一支都在 ────────────────────────────────
expected=0; missing=0
while IFS=$'\t' read -r path group enabled requires expect; do
  case "$path" in ''|\#*) continue;; esac
  [ "$enabled" = "1" ] || { echo "  skip   $path（manifest 裡標為停用）"; continue; }
  if [ -n "$ONLY" ] && [ "$ONLY" != "$group" ]; then continue; fi
  expected=$((expected+1))
  [ -f "$path" ] || { echo "!!MISS   $path —— manifest 有登錄，檔案卻不在（回捲的典型徵兆）"; missing=$((missing+1)); }
done < "$MANIFEST"

# tests/scratch/ 是契約測試的家。那裡有檔案卻沒登錄，就是「寫了測試但沒有人跑」。
# tests/r13/ 底下原本有一百多支一次性的探索腳本，所以不對它做同樣的檢查。
unlisted=0
for f in tests/scratch/*.mjs; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in _*) continue;; esac      # _ 開頭是暫時的探針，不算
  grep -q "^$f	" "$MANIFEST" || { echo "!!UNREG  $f —— 在 tests/scratch/ 但沒登錄進 manifest"; unlisted=$((unlisted+1)); }
done

echo "── 名單：預計執行 $expected 支 ──"
echo

# ── 二、逐支執行 ────────────────────────────────────────────────
started=0; completed=0
run(){
  local f="$1" expect="$2"
  started=$((started+1))
  local out rc
  out=$(node "$f" 2>&1); rc=$?
  # 斷言計數：這個專案的測試有兩種輸出習慣（ok／PASS、!!FAIL／FAIL）
  local nok nfail ntotal status
  nok=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*(ok|PASS)([[:space:]]|$)')
  nfail=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*(!!FAIL|FAIL)([[:space:]]|$)')
  ntotal=$((nok+nfail))
  if   [ $rc -gt 1 ] || printf '%s' "$out" | grep -q 'ERR_MODULE_NOT_FOUND\|SyntaxError\|ReferenceError'; then status=CRASH
  elif [ -n "$expect" ] && [ "$ntotal" -lt "$expect" ]; then status=SHORT
  elif [ $rc -ne 0 ] || [ "$nfail" -gt 0 ]; then status=FAIL
  # 「跑完、沒有失敗、但一條斷言都數不到」不可以算綠。
  # 這個專案已經出現過六次「綠但其實什麼都沒測到」——包括 fixture 沒建立成功、
  # 以及 regex 因為 UI 改名而永遠 false。數不到斷言時要看得見，不是默默通過。
  elif [ "$ntotal" -eq 0 ]; then status=EMPTY
  else status=PASS; fi
  completed=$((completed+1))
  printf '%s\t%s\t%s\t%s\n' "$f" "$status" "$ntotal" "$nfail" >> "$RESULTS"
  local mark="  ok   "; [ "$status" = PASS ] || mark="!!$status"
  printf '%-8s %-30s %3s 條斷言，%s 條失敗\n' "$mark" "$f" "$ntotal" "$nfail"
  if [ "$status" != PASS ]; then
    printf '%s\n' "$out" | grep -E '^[[:space:]]*(!!FAIL|FAIL)([[:space:]]|$)' | head -4 | sed 's/^/           /'
    if [ "$status" = CRASH ]; then printf '%s\n' "$out" | tail -3 | sed 's/^/           /'; fi
    if [ "$status" = SHORT ]; then echo "           （manifest 說這支應該有 $expect 條，只看到 $ntotal 條 —— 提早結束了）"; fi
  fi
}

while IFS=$'\t' read -r path group enabled requires expect; do
  case "$path" in ''|\#*) continue;; esac
  [ "$enabled" = "1" ] || continue
  if [ -n "$ONLY" ] && [ "$ONLY" != "$group" ]; then continue; fi
  [ -f "$path" ] || continue
  run "$path" "$expect"
done < "$MANIFEST"

# ── 三、對帳 ────────────────────────────────────────────────────
echo
python3 - "$RESULTS" "$BASELINE" "$expected" "$started" "$completed" "$missing" "$unlisted" <<'PY'
import json, sys, os
res_path, base_path = sys.argv[1], sys.argv[2]
expected, started, completed, missing, unlisted = map(int, sys.argv[3:8])

results = {}
for line in open(res_path, encoding='utf-8'):
    if not line.strip(): continue
    p, st, n, nf = line.rstrip('\n').split('\t')
    results[p] = {'status': st, 'asserts': int(n), 'fails': int(nf)}

counts = {}
for r in results.values(): counts[r['status']] = counts.get(r['status'], 0) + 1
print('Expected  %d' % expected)
print('Started   %d' % started)
print('Completed %d' % completed)
print('Passed    %d' % counts.get('PASS', 0))
print('Failed    %d' % counts.get('FAIL', 0))
print('Crashed   %d' % counts.get('CRASH', 0))
print('Short     %d   （跑完但斷言數少於 manifest 宣告的）' % counts.get('SHORT', 0))
print('Empty     %d   （沒失敗，但一條斷言都數不到 —— 綠得沒有意義）' % counts.get('EMPTY', 0))
print('Missing   %d   （manifest 有登錄但檔案不在）' % missing)
print('Unreg     %d   （tests/scratch/ 有檔案但沒登錄）' % unlisted)

problems = []
if missing:  problems.append('有 %d 支登錄過的測試檔不見了' % missing)
if unlisted: problems.append('有 %d 支測試沒有登錄進 manifest' % unlisted)
if started != expected or completed != started:
    problems.append('少跑：預計 %d、開始 %d、完成 %d' % (expected, started, completed))

if os.environ.get('UPDATE_BASELINE') == '1':
    base = {'note': ('每一支的已知狀態。expect 不是 PASS 的，必須寫 category 與 why——'
                     '這份檔案的目的是讓「變化」看得見，不是替紅燈辦永久居留證。'
                     '最終目標仍然是 expected fail = 0。'),
            'tests': {p: {'expect': r['status'], 'category': '', 'why': ''}
                      for p, r in sorted(results.items())}}
    if os.path.exists(base_path):
        old = json.load(open(base_path, encoding='utf-8')).get('tests', {})
        for p, v in base['tests'].items():          # 保留人工寫過的分類與理由
            if p in old:
                v['category'] = old[p].get('category', '')
                v['why'] = old[p].get('why', '')
    json.dump(base, open(base_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n已更新 baseline：%s（%d 支）' % (base_path, len(results)))
    print('請為每一支已知紅燈補上 category 與 why —— 沒有理由的紅燈就是被正常化的紅燈。')
    sys.exit(1 if problems else 0)

if not os.path.exists(base_path):
    print('\n!! 沒有 tools/test-baseline.json —— 無法判斷「這次跟上次比有什麼變化」。')
    print('   確認目前結果合理之後，跑：UPDATE_BASELINE=1 tools/run-suite.sh')
    sys.exit(2)

base = json.load(open(base_path, encoding='utf-8'))['tests']
new_fail, improved, unlogged, gone = [], [], [], []
for p, r in results.items():
    if p not in base: unlogged.append(p); continue
    want = base[p]['expect']
    if r['status'] != want:
        line = '%s：baseline 是 %s，這次是 %s' % (p, want, r['status'])
        (improved if (want != 'PASS' and r['status'] == 'PASS') else new_fail).append(line)
# ONLY=... 是「刻意只跑一部分」，這時候「其他支沒跑到」不是問題。
# 但完整跑的時候，baseline 有而這次沒跑到，就是少跑——那必須是失敗。
if not os.environ.get('ONLY'):
    for p in base:
        if p not in results: gone.append(p)

def block(title, items):
    if items:
        print('\n' + title)
        for x in items: print('   ' + x)

block('!! 新的失敗（這是回歸，必須解釋）：', new_fail)
block('✓ 已知紅燈變綠了（好事，但請更新 baseline）：', improved)
block('!! 沒有登錄在 baseline 裡：', unlogged)
block('!! baseline 有、這次卻沒跑到：', gone)

known = [p for p, v in base.items() if v['expect'] != 'PASS']
noreason = [p for p in known if not base[p].get('why')]
print('\n已知紅燈 %d 支' % len(known), end='')
if noreason:
    print('，其中 %d 支還沒寫原因：%s' % (len(noreason), '、'.join(noreason[:5]) + ('…' if len(noreason) > 5 else '')))
else:
    print('，全部都有分類與原因')

if problems or new_fail or improved or unlogged or gone:
    print('\n對帳不通過。')
    for x in problems: print('   ' + x)
    sys.exit(1)
print('\n跟 baseline 完全一致。')
sys.exit(0)
PY
