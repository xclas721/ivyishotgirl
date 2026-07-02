# Ivy的獎金 — Handoff 交接

**專案：** `ivyishotgirl`  
**Repo：** https://github.com/xclas721/ivyishotgirl  
**分支：** `main`  
**維護者：** Kyson Wang  
**需求規格：** [需求清單.md](./需求清單.md)  
**AI Spec：** [spec/spec-architecture-auth-multi-account-rls.md](../spec/spec-architecture-auth-multi-account-rls.md)  
**UX 規劃：** [ui-ux-plan.md](./ui-ux-plan.md)  
**接手提示詞：** [handoff-prompt.md](./handoff-prompt.md)

---

## 0. 目前實作現況（2026-07-01）

**線上已上線（過渡方案 — 個人／小團隊共用）**

| 項目             | 現況                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 登入             | **單一共用帳號** — Supabase Auth `gate@ivy.app`，UI 只問密碼；經 **`POST /api/gate-login`** 代理（**10 次/分/IP** 限流） |
| 登出             | 側欄「登出」→ `signOut` + 清空記憶體帳本                                                                                 |
| 修改密碼         | 側欄「修改密碼」→ 驗證目前密碼後 `supabase.auth.updateUser`（`ChangePasswordModal.vue`）                                 |
| Session 過期     | JWT 失效時自動回密碼閘，顯示「登入已過期」                                                                               |
| 手機版導覽       | ≤768px 左上角 **☰** 滑出完整側欄（同桌面：導覽 + 改密 + 登出）；非頂部橫列                                               |
| 未登入           | **硬閘** — 看不到帳本，無訪客試算                                                                                        |
| RLS              | **已啟用** — `bonus_records`、`quarter_multipliers` 僅 `authenticated` 可讀寫（[`schema.sql`](../supabase/schema.sql)）  |
| 多帳號／業務隔離 | **尚未實作**（spec §2–§5 待決）                                                                                          |
| 工程品質         | GitHub Actions CI、Vitest 單元測試、Prettier                                                                             |
| 視覺特效         | `src/assets/effects.css`（頁面切換、KPI 閃爍、表格聚光等）                                                               |
| 報價抓取         | **httpx** 靜態 HTML；本機可設 `PLAYWRIGHT_FALLBACK=1` 啟用 Playwright 備援（預設關閉；Vercel 無需設定） |
| 案件搜尋         | 報價單紀錄區塊模糊搜尋（編號、客戶、季度等）；Esc 清除、關鍵字高亮、捲到首筆                                   |
| 手機案件明細     | ≤768px 卡片式；桌面維持表格                                                                                      |
| 篩選範圍總覽     | 預設顯示；排在「新增報價單」之後；手機 KPI 四欄橫排                                                              |

**文件 §2–§5 與 spec** 描述的是**正式版（方案 B：多帳號 + 業務隔離 + 管理頁）**，標為待實作；**是否採用尚未定案**。

若未來做方案 B：須**替換**現有 RLS policy（非從零開 RLS），並把硬閘改成「訪客試算 + 多帳號登入」。詳見 [需求清單.md](./需求清單.md) §0。

---

## 1. 這是什麼

AM 個人／團隊用的**季度獎金試算帳本**（產品名 **Ivy的獎金**）：

- 貼 `quote.saiens.tw` 報價單 URL → FastAPI 抓取金額、回簽日、案件編號、**案件業務**
- 依**回簽季度**算應計獎金（客戶類型 % + 季度倍率）
- 依**收款季度**看實領統計
- 資料存 **Supabase**

不是 HR 發薪系統、不是 Odoo 替代品。

---

## 2. 技術棧

| 層       | 技術                                                         |
| -------- | ------------------------------------------------------------ |
| 前端     | Vue 3 + TypeScript + Vue Router + Tailwind v4                |
| 圖示     | lucide-vue-next                                              |
| 狀態     | `ledger.ts`、`useQuoteWorkflow.ts`、`gate.ts`                |
| 摘要計算 | `src/composables/ledgerSummary.ts`                           |
| 後端     | FastAPI `api/index.py`（Vercel serverless）                  |
| DB       | Supabase PostgreSQL                                          |
| 部署     | Vercel（前端 + API）                                         |
| 測試     | Vitest（前端純函式）、Python unittest（rate limiter）        |
| CI       | `.github/workflows/ci.yml` — format、type-check、test、build |

### 啟動

```sh
npm install
npm start   # Vite :3000 + uvicorn :8000
```

需 `.env.local`：

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

後端（登入閘）另需 Vercel env：`SUPABASE_URL`、`SUPABASE_ANON_KEY`（可與 `VITE_*` 同值；本機 `npm start` 會從 `.env.local` 讀取）。

**不要**用 `file://` 開 HTML；抓取報價需同源 `/api/*`。

Kyson 慣例：**不要自動 build/test**，除非他明確要求。commit/push 需他指示。

---

## 3. 關鍵檔案

| 路徑                                          | 用途                                             |
| --------------------------------------------- | ------------------------------------------------ |
| `api/index.py`                                | 抓報價 HTML；`gate-login`；`extract_sales_rep()` |
| `src/composables/gate.ts`                     | 密碼閘、session 同步、登出、改密流程             |
| `src/components/ChangePasswordModal.vue`      | 修改密碼 modal                                   |
| `src/lib/passwordChange.ts`                   | 改密驗證邏輯                                     |
| `src/composables/useQuoteWorkflow.ts`         | 抓取／同步／匯出流程                             |
| `src/lib/db.ts`                               | `BonusRecord`、Supabase mapper                   |
| `src/composables/ledger.ts`                   | 紀錄/倍率狀態、篩選、`ensureLoaded`              |
| `src/composables/ledgerSummary.ts`            | 應計/實領、最終獎金計算                          |
| `src/views/CalculatorView.vue`                | 帳本主頁（薄殼，邏輯在 composable）              |
| `src/components/ledger/RecordsTable.vue`      | 案件表格                                         |
| `src/components/layout/QuarterContextBar.vue` | 全域季度脈絡 + KPI                               |
| `src/assets/effects.css`                      | 視覺特效                                         |
| `supabase/schema.sql`                         | 表結構 + RLS policy                              |

### 路由

| 路徑           | 頁面                           |
| -------------- | ------------------------------ |
| `/`            | 帳本計算機                     |
| `/multipliers` | 季度倍率                       |
| `/rules`       | 獎金規則                       |
| `/admin`       | 帳號管理（**待實作**，僅 ivy） |
| `/login`       | 登入（**待實作**，正式版）     |

---

## 4. 業務規則（勿搞錯）

### 客戶類型與基礎%

| 類型   | 代碼       | %   |
| ------ | ---------- | --- |
| 商空   | `biz`      | 2%  |
| 廚櫃   | `kitchen`  | 3%  |
| 設計師 | `designer` | 4%  |
| 個人   | `personal` | 5%  |

- **新增**時使用者自選客戶類型
- **再同步**不覆寫客戶類型（`preserveCustomerFields`）

### 倍率

- 自 **2026-Q2** 起適用（`MULTIPLIER_START_KEY`）
- 更早季度：最終獎金顯示「無法計算」，不計入發放總計

### 案件業務 `sales_rep`（已完成）

- 從報價單「案件業務」自動帶入；表格可手改；再同步會更新（抓不到保留原值）
- CSV 含業務欄

### 財務季度

2–4→Q1、5–7→Q2、8–10→Q3、11–12+隔年1月→Q4；1月歸前一年 Q4。

---

## 5. 資料庫現況

### 已有表

- `bonus_records` — 含 `sales_rep text`
- `quarter_multipliers`

### Migration（若新環境或升級）

見 [`supabase/schema.sql`](../supabase/schema.sql) 全文（含 `sales_rep`、RLS policy）。

Supabase 需建立 Auth 使用者 **`gate@ivy.app`**（密碼由 Kyson 設定），前端登入後 JWT 才通過 RLS。

---

## 6. 已完成 vs 待做

### 已完成（main，2026-07-01）

- 季度工作檯 UI、案件業務、簡易登入閘 + RLS
- CalculatorView 拆分、`useQuoteWorkflow`、移除 clearAll
- CI + Vitest + Python unittest + Playwright E2E smoke
- 視覺特效（`effects.css`）
- 側欄登出、session 過期回閘、DB 錯誤重試
- **修改密碼**（共用帳號過渡版）
- **手機版**：左上角選單滑出側邊欄；修正閃爍與底部橫向捲軸
- **手機案件明細**：卡片式排版；月份欄位溢出修正
- **報價單紀錄模糊搜尋**、CSV 檔名含季度+時間+搜尋詞
- **篩選範圍總覽**：預設顯示、順序調整、手機四欄橫排
- **新增報價單**客戶類型 select 與表格樣式統一（`type-select`）
- **Playwright fallback**（本機；httpx 失敗時重試）
- README 與 Playwright 文件對齊

### 待做（見 [需求清單.md](./需求清單.md)）

**若採正式版：多帳號 + 業務隔離（方案 B）** — 見 spec §3.6 實作順序。

---

## 7. UI/UX

見 [ui-ux-plan.md](./ui-ux-plan.md)（1440px RWD、手機側欄 drawer、閃爍/捲軸修正、type-select 統一 — 已完成）。

---

## 8. 協作慣例

- 回覆一律**繁體中文**
- `.ps1` 須 UTF-8 with BOM
- 不要未經指示 commit/push/build
- docs 預設不主動大改，除非任務需要

---

_最後更新：2026-07-01（搜尋高亮、Playwright fallback、E2E smoke、handoff 同步）_
