# Ivy的獎金

Vue + TypeScript 前端，搭配 FastAPI proxy 抓取報價單資料的季度獎金帳本。

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

## 抓取報價

後端以 **httpx** 抓取 `quote.saiens.tw` 的 HTML（同源 `/api/fetch-quote`）。若靜態 HTML 抓不到金額，可在**本機**設 `PLAYWRIGHT_FALLBACK=1` 啟用 Playwright 備援（需安裝瀏覽器）。**預設關閉**，Vercel 正式站無需額外設定。

```sh
pip install -r requirements-playwright.txt
playwright install chromium
```

在 `.env.local` 加入 `PLAYWRIGHT_FALLBACK=1` 即可在本機 API 啟用。

## 計算規則

- 報價單「未連稅金額」作為未稅獎金基準。
- 報價單「總計」作為含稅總價。
- 回簽月份優先從報價單底部歷史訊息、chatter、timeline 判斷，優先找「簽名 + PDF 附件 + 報價單編號」。
- 回簽月份決定獎金%與季度倍率。
- 收款月份決定實際發放季度。
- 財務季度：2-4 月 Q1、5-7 月 Q2、8-10 月 Q3、11-12 月與隔年 1 月 Q4；1 月歸前一年度 Q4。
- 季度倍率存在 `quarterMultipliers`，每筆案件只保存案件資料。
- 資料保存在 Supabase（`bonus_records`、`quarter_multipliers` 兩張表）。

## 資料操作

- 匯出 CSV（依目前篩選範圍）

## 檢查

```sh
npm run format:check
npm run type-check
npm run test
npm run build
```
