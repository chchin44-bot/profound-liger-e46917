#!/bin/bash
# index.html → tools/source.html（反推）
#
# v93d 起流程反過來了：index.html 是唯一主檔，日常修改直接改它。
# source.html 從此是衍生產物，只為了保留「可讀底稿 + 可重建」的能力。
#
# v93i：路徑不再硬編開發容器的位置。這支要進 GitHub，
# 而 checkout 出來的位置不會是那個路徑——硬編等於「只能在原本那台跑」，
# 那它就不是 repo 的工程工具，只是一次性的修復腳本。
set -e
TOOLS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$TOOLS/.." && pwd)"
cd "$REPO"
REPO="$REPO" TOOLS="$TOOLS" python3 - <<'PY'
import os, re
repo = os.environ['REPO'] + '/'
tools = os.environ['TOOLS'] + '/'
h = open(repo+'index.html', encoding='utf-8').read()
i = h.index('<style>')
j = h.index('</script>', h.index('<script>', h.index('</style>', i))) + len('</script>')
blob = h[i:j]
assert 'Chart.js v4' in blob, 'assets 區塊不含 chart.js —— 版面結構可能變了，停手'
open(tools+'tw.out.css', 'w', encoding='utf-8').write(blob[len('<style>'):blob.index('</style>')])
s = h[:i] + '@@ASSETS@@' + h[j:]
tags = set(re.findall(r'v\d+ · \d{4}-\d\d-\d\d \d\d:\d\d', s))
assert len(tags) == 1, f'建置標記不只一個或找不到：{tags}'
s = s.replace(tags.pop(), '@@BUILD@@')
assert s.count('@@ASSETS@@') == 1 and s.count('@@BUILD@@') == 1
open(tools+'source.html', 'w', encoding='utf-8').write(s)
print('   tools/source.html 已同步（%d 行）' % (s.count('\n')+1))
PY
