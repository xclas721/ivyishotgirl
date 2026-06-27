# Saiens 季度獎金帳本

Vue + TypeScript 前端，搭配 Node.js Express proxy 抓取 Saiens 報價單資料。

## 啟動

```sh
npm install
npm start
```

打開：

```text
http://localhost:3000
```

請從 `http://localhost:3000` 使用，不要直接用 `file://` 開 HTML。前端只會呼叫同源 API：

```text
GET /api/health
POST /api/fetch-quote
```

`/api/fetch-quote` 只允許抓取 `quote.saiens.tw`，避免變成任意 proxy。

## Playwright fallback

如果報價單內容是 JavaScript 動態渲染，可以安裝 Playwright 後啟動 fallback：

```sh
npm install playwright
npx playwright install chromium
npm run start:pw
```

## 計算規則

- 報價單「未連稅金額」作為未稅獎金基準。
- 報價單「總計」作為含稅總價。
- 回簽月份優先從報價單底部歷史訊息、chatter、timeline 判斷，優先找「簽名 + PDF 附件 + 報價單編號」。
- 回簽月份決定獎金%與季度倍率。
- 收款月份決定實際發放季度。
- 財務季度：2-4 月 Q1、5-7 月 Q2、8-10 月 Q3、11-12 月與隔年 1 月 Q4；1 月歸前一年度 Q4。
- 季度倍率存在 `quarterMultipliers`，每筆案件只保存案件資料。
- `localStorage` 保存 `quotes` 與 `quarterMultipliers`。

## 資料操作

前端保留：

- 匯出 JSON
- 匯入 JSON
- 匯出 CSV
- 清空紀錄

## 檢查

```sh
npm run format:check
npm run type-check
npm run build
```
