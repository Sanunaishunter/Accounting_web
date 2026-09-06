# 記帳系統 (Accounting Web)

這是 [Accounting](https://github.com/Sanunaishunter/Accounting)（原本以 Python + Streamlit + SQLite 開發的記帳系統）改寫而成的**純前端靜態網站版本**，可直接部署於 GitHub Pages。

原版是一個伺服器端應用（需要 Python 執行環境與資料庫檔案），無法直接放上 GitHub Pages。本專案將其核心功能（半結構化中文記帳文字解析、月曆輸入、待審核、統計報表、人員/關係表管理）改用 **Vanilla HTML / CSS / JavaScript** 重新實作，資料改存放在瀏覽器的 `localStorage`。

## 功能

- **首頁**：系統統計（人員數、支出記錄、待審核、總支出）、類別單價設定、最近記錄、資料備份/還原
- **輸入**：月曆模式輸入當日記帳文字、暫存＋批次輸入、整月批次貼上文字（含衝突偵測確認）
- **審核**：處理無法自動辨識的人名（設為別名／新增人員／忽略）、人員別名管理
- **報表**：全員月報卡片（含每日明細 tooltip）、月份比較、年度統計（含月度趨勢長條圖）、費用查詢、CSV／HTML 匯出
- **關係表**：管理備忘 `⚠️` 關鍵字對應到人員的代理關係

解析規則與原版一致：

```
1/19（一）
早餐：小明、小華
中餐：阿鵰、泰禎
點心：阿鵰點心+60
晚餐：傑森*2
牛奶*1.5：小明
⚠️ 備忘內容
```

- `類別：人名` 基本格式
- `人名+金額` 額外金額
- `人名*次數` 多次
- `類別*次數：` 預設次數
- `⚠️` 標記備忘

## 技術架構

純靜態頁面，無需建置工具、無外部依賴：

```
index.html          首頁
input.html           輸入頁
review.html          審核頁
report.html           報表頁
relations.html        關係表頁
assets/css/style.css  共用樣式（深色主題）
assets/js/db.js        資料層（localStorage，取代原本的 SQLite）
assets/js/parser.js    中文記帳文字解析器（移植自 parser.py，含模糊比對）
assets/js/utils.js     共用工具函式
assets/js/nav.js       共用導覽列
assets/js/home.js      首頁邏輯
assets/js/input.js     輸入頁邏輯
assets/js/review.js    審核頁邏輯
assets/js/report.js    報表頁邏輯
assets/js/relations.js 關係表頁邏輯
```

## 資料儲存與備份

資料儲存在瀏覽器 `localStorage`，**只存在於目前使用的瀏覽器與裝置上**（GitHub Pages 是純靜態託管，沒有共用後端資料庫）。

請在首頁使用「資料備份 / 還原」功能：
- **匯出備份 (JSON)**：下載目前所有資料
- **匯入備份**：從 JSON 檔案還原資料（可用於搬移到其他瀏覽器/裝置）

## 部署到 GitHub Pages

1. 到 repo 的 **Settings → Pages**
2. Source 選擇 **Deploy from a branch**
3. Branch 選擇本專案所在分支（例如 `main` 或本次的 `claude/accounting-github-pages-bh3tey`），資料夾選 `/ (root)`
4. 儲存後，GitHub 會提供一個 `https://<user>.github.io/<repo>/` 的網址

本地端也可以直接用瀏覽器打開 `index.html`，或用簡易伺服器（如 `python -m http.server`）預覽。

## 與原版的差異

- 資料庫從 SQLite 改為瀏覽器 `localStorage`（單機、單瀏覽器，需自行匯出備份）
- 移除了原本依賴伺服器檔案系統的「History 對帳」功能（讀取本地歷史記帳文字檔案並逐筆勾選核對），因為靜態網站無法存取伺服器檔案系統
- 其餘記帳解析規則、報表卡片樣式、月曆輸入、審核流程等均保留一致的行為
