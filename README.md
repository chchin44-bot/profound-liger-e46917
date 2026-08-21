# 台股動物法則儀表板 · v93i 交付包

解壓縮後會得到 `taiwan-dashboard-v93i/`。
**把裡面的東西照原樣放進 GitHub repo 的根目錄就對了**，資料夾結構已經排好，不用自己搬。

最省事的做法：GitHub 按 `Add file → Upload files`，把解壓出來資料夾**裡面的全部內容**
（不是資料夾本身）一起拖進去。GitHub 網頁上傳支援整批拖曳，會自動保留 `tools/` 與 `tests/` 兩層。

---

## 一、只想讓網站更新的話

只有 `index.html` 是必要的，其他全部可以不管。
上傳步驟看 `github-upload-guide.html`（用瀏覽器打開）。
驗收：打開網站 → 強制重新整理 → 字級按鈕下方要顯示 **v93**。

---

## 二、結構

```
index.html                  產品本身。必須在根目錄，GitHub Pages 要用。

tools/                      工程工具（不影響網站，純粹是給開發流程用的）
  run-suite.sh              跑回歸套件 + 跟 baseline 對帳
  staleguard.sh             開工前檢查工程資產有沒有被吃掉；缺東西 exit 2
  sync-source.sh            index.html → tools/source.html 反推
  tests.manifest            「哪些檔案屬於正式回歸套件」的唯一名單（70 支）
  test-baseline.json        每一支測試目前的已知狀態＋分類＋原因
  source.html               index.html 的可讀底稿（衍生物，由 sync-source.sh 產生）
  tw.out.css                內嵌的 Tailwind 樣式（同上，衍生物）

tests/                      回歸測試（70 支）
  invariants.mjs 等 9 支     核心（含 v49.mjs 跨功能安全網）
  r13/                      58 支
  scratch/                  3 支契約測試（估值引擎 / provenance / 面板標題）
```

三支腳本都把「自己所在資料夾的上一層」當 repo 根目錄，
所以放進 `tools/` 之後照樣跑得動，不需要改任何路徑。

---

## 三、怎麼跑

```bash
tools/staleguard.sh                    # 先確認工程資產齊全；缺東西會 exit 2
tools/run-suite.sh                     # 跑 70 支，跟 baseline 對帳
ONLY=contract tools/run-suite.sh       # 只跑 3 支契約測試（約 20 秒）
UPDATE_BASELINE=1 tools/run-suite.sh   # 確認過結果之後才用，會覆蓋 baseline
```

需要 Node 與 `playwright` 套件。沒裝會被判成 CRASH，不會假裝通過。

`run-suite.sh` 在下列任一情況都回傳非 0：

- 有新的失敗
- 已知紅燈變綠了（好事，但 baseline 要更新才算數）
- manifest 登錄的測試檔不見了
- `tests/scratch/` 有測試沒登錄進 manifest
- 某支 exit 0 但斷言數少於 manifest 宣告的（跑到一半就結束）
- 某支沒失敗、但一條斷言都數不到（綠得沒有意義）

最後兩條不是理論。這一版第一次跑就抓到 `lv.mjs` 少了 9 條——
原因是我自己在重寫時刪掉了一組沒有意義的佔位斷言，
但如果那 9 條是「真的沒跑到」，舊 runner 一樣會給綠燈。

---

## 四、目前的紅燈狀態

不是全綠。目前是「**每一支紅燈都具名、分類、寫得出原因**」。
`tools/test-baseline.json` 裡每一支不是 PASS 的都有 `category` 與 `why`。

那份檔案的用途是讓**變化**看得見，不是替紅燈辦永久居留證——
最終目標仍然是 expected fail = 0。

目前：**42 綠 / 20 紅 / 2 CRASH / 6 數不到斷言**。

其中兩支是 CRASH（中途拋例外），代表它們後面的區段從來沒被驗過，
比單純紅燈更需要優先處理。

另外有一支 `dlg.mjs`：21 條斷言在失敗，但它沒有呼叫 `process.exit`，
所以舊 runner 一直把它報成綠燈，不知道紅了幾輪。是版面問題，與估值無關，
但這正是為什麼新 runner 要數 FAIL 行而不是只看 exit code。

---

## 五、不要放進 GitHub 的東西

這個 repo 是**公開**的。以下絕對不能上傳：

- FinMind API Token（任何形式）
- 備份 JSON（裡面有成本價與持股）

這包裡沒有這兩樣，我掃描過。
`tests/r13/sec88.mjs` 裡有一個長得像 token 的字串，那是**故意放的假值**，
用來驗證「匯出時會不會把 token 洗掉」，不是真的。
