#!/bin/bash
# index.html → source.html（反推）
#
# v93d 起流程反過來了：index.html 是唯一主檔，日常修改直接改它。
# source.html 從此是**衍生產物**，只是為了保留「可讀的底稿 + 可重建」的能力。
# 每次改完 index.html 就跑這支，讓兩者不會各自漂移。
set -e
cd /mnt/user-data/working
python3 - <<'PY'
import re
base='/mnt/user-data/working/'
h=open(base+'index.html',encoding='utf-8').read()
i=h.index('<style>')
j=h.index('</script>', h.index('<script>', h.index('</style>', i)))+len('</script>')
blob=h[i:j]
assert 'Chart.js v4' in blob, 'assets 區塊不含 chart.js —— 版面結構可能變了，停手'
open(base+'tw.out.css','w',encoding='utf-8').write(blob[len('<style>'):blob.index('</style>')])
s=h[:i]+'@@ASSETS@@'+h[j:]
tags=set(re.findall(r'v\d+ · \d{4}-\d\d-\d\d \d\d:\d\d', s))
assert len(tags)==1, f'建置標記不只一個或找不到：{tags}'
s=s.replace(tags.pop(),'@@BUILD@@')
assert s.count('@@ASSETS@@')==1 and s.count('@@BUILD@@')==1
open(base+'source.html','w',encoding='utf-8').write(s)
print('   source.html 已同步（%d 行）' % (s.count('\n')+1))
PY
