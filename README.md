# 福岡 2026 旅行準備手冊

2026/11/5–11/10，六天五夜。純靜態網站，可使用 GitHub Pages 發布，無須安裝依賴或建置。

功能：每日完整時間軸、對應準備清單、午晚餐主選／備選、官網／地圖／電話、手動訂位狀態、個人備忘、預算及購物清單、JSON 備份與匯入、完整六日列印。

## 本機

以瀏覽器開啟 index.html，或在此目錄執行 `node server.cjs` 並開啟 http://localhost:4173 。建議透過 HTTP 使用穩定的瀏覽器儲存。

## GitHub Pages

將 index.html、styles.css、data.js、app.js 與 .nojekyll 放在儲存庫根目錄。Settings → Pages → Deploy from a branch → main → /(root) → Save。

## 資料及狀態

- 內容取自使用者提供的「福岡2026旅行計畫_最終合併版v2.md」，相關勘誤與 2026/09/29 官方來源查證整理於網站。
- 價格為規劃估算，未代訂任何餐廳或票券。部分 11 月資訊仍待確認，網站明確標示。
- 進度使用 localStorage，限目前裝置／瀏覽器，不會同步到 GitHub。換裝置請備份再匯入。
- 外部照片：Kirin7739，Wikimedia Commons，CC0 1.0：https://commons.wikimedia.org/wiki/File:View_of_Mojiko_Station_from_Mojiko_Retro.jpg
- 主機未配置後端，沒有金鑰、登入或分析追蹤程式。圖片與字體需要網路，字體失敗時會改用系統字體。

## 修改

data.js 保存行程、餐廳、待辦與預算內容；styles.css 為響應式樣式；app.js 處理介面和本機儲存。發布更新後，不會覆蓋瀏覽器中已保存的準備進度。
