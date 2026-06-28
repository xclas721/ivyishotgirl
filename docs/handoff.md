# Ivy的獎金 — Handoff 交接

**專案：** `ivyishotgirl`  
**Repo：** https://github.com/xclas721/ivyishotgirl  
**分支：** `main`（最新功能 commit：`b22dcf6` — 簡易登入閘 + RLS）  
**維護者：** Kyson Wang  
**需求規格：** [需求清單.md](./需求清單.md)  
**AI Spec：** [spec/spec-architecture-auth-multi-account-rls.md](../spec/spec-architecture-auth-multi-account-rls.md)  
**UX 規劃：** [ui-ux-plan.md](./ui-ux-plan.md)（若本機有；Git 歷史已移除）  
**接手提示詞：** [handoff-prompt.md](./handoff-prompt.md)

---

## 0. 目前實作現況（2026-06-29）

**線上已上線（過渡方案）**

| 項目 | 現況 |
|------|------|
| 登入 | **單一共用帳號** — Supabase Auth `gate@ivy.app`，UI 只問密碼；經 **`POST /api/gate-login`** 代理（**10 次/分/IP** 限流） |
| 未登入 | **硬閘** — 看不到帳本，無訪客試算 |
| RLS | **已啟用** — `bonus_records`、`quarter_multipliers` 僅 `authenticated` 可讀寫（[`schema.sql`](../supabase/schema.sql)） |
| 多帳號／業務隔離 | **尚未實作** |

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

| 層 | 技術 |
|----|------|
| 前端 | Vue 3 + TypeScript + Vue Router + Tailwind v4 |
| 圖示 | lucide-vue-next |
| 狀態 | `src/composables/ledger.ts`（全域 reactive + Supabase） |
| 摘要計算 | `src/composables/ledgerSummary.ts` |
| 後端 | FastAPI `api/index.py`（Vercel serverless） |
| DB | Supabase PostgreSQL |
| 部署 | Vercel（前端 + API） |

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

| 路徑 | 用途 |
|------|------|
| `api/index.py` | 抓報價 HTML；`extract_sales_rep()` 等 |
| `src/lib/db.ts` | `BonusRecord`、Supabase mapper |
| `src/composables/ledger.ts` | 紀錄/倍率狀態、篩選、`ensureLoaded` |
| `src/composables/ledgerSummary.ts` | 應計/實領、最終獎金計算 |
| `src/shared/fiscalQuarter.ts` | 財務季度；`MULTIPLIER_START_KEY = '2026-Q2'` |
| `src/shared/customerType.ts` | 四類客戶 2–5%，% 由類型推導（不存 DB） |
| `src/views/CalculatorView.vue` | 帳本主頁（偏大，待瘦身） |
| `src/components/ledger/RecordsTable.vue` | 案件表格 |
| `src/components/layout/QuarterContextBar.vue` | 全域季度脈絡 + KPI |
| `supabase/schema.sql` | 表結構 + migration 片段 |
| `supabase/migrations/` | RLS policies（登入階段新增） |

### 路由

| 路徑 | 頁面 |
|------|------|
| `/` | 帳本計算機 |
| `/multipliers` | 季度倍率 |
| `/rules` | 獎金規則 |
| `/admin` | 帳號管理（**待實作**，僅 ivy） |
| `/login` | 登入（**待實作**） |

---

## 4. 業務規則（勿搞錯）

### 客戶類型與基礎%

| 類型 | 代碼 | % |
|------|------|---|
| 商空 | `biz` | 2% |
| 廚櫃 | `kitchen` | 3% |
| 設計師 | `designer` | 4% |
| 個人 | `personal` | 5% |

- **新增**時使用者自選客戶類型
- **再同步**不覆寫客戶類型（`preserveCustomerFields`）
- 已移除 DB 欄位 `base_commission_rate`

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

見 [`supabase/schema.sql`](../supabase/schema.sql) 全文（含 `sales_rep`、RLS policy）。摘要：

```sql
alter table bonus_records drop column if exists base_commission_rate;
alter table bonus_records add column if not exists sales_rep text not null default '';
alter table bonus_records enable row level security;
alter table quarter_multipliers enable row level security;
-- policy: authenticated full access（見 schema.sql）
```

Supabase 需建立 Auth 使用者 **`gate@ivy.app`**（密碼由 Kyson 設定），前端登入後 JWT 才通過 RLS。

### 安全現況（**過渡：簡易閘 + RLS**）

- RLS **已開** — anon key 無法讀寫；須 `signInWithPassword` 取得 session
- 前端：**單一共用密碼閘**（非多帳號、無訪客試算）
- 正式版目標：多帳號 + 業務隔離 RLS + 後端建帳 API（見需求清單 §2、§7.1）

---

## 6. 已完成 vs 待做

### 已完成（main）

- 季度工作檯 UI（`QuarterContextBar`、`LedgerTabs`、`RecordsTable` 分組表頭）
- 客戶類型四類、倍率 2026-Q2 分界、「無法計算」邏輯
- Rebrand **Ivy的獎金**、文案潤飾、Vercel 錯誤訊息
- **案件業務** `sales_rep` 全鏈路（`a017801`）
- **簡易登入閘** + Supabase Auth + RLS（`540f4d4` → `b22dcf6`）

### 待做（見 [需求清單.md](./需求清單.md)）

**若採正式版：登入 + 多帳號 + 業務隔離（方案 B）**

摘要（完整規格見需求清單；**不必追求**見 §12）：

1. Supabase Auth + RLS（§7.1 migration）
2. 後端 API：`/api/auth/login` + admin routes（service role，§2.9）
3. 未登入：可試算不存（記憶體）；可匯出試算 CSV
4. fetch-quote：**訪客 20 次/分/IP**，登入不限（§2.8）
5. 登入帳號 / 顯示名稱分離；ivy 用真實 Auth email
6. **ivy 首次亦須改密**（seed `must_change_password=true`）
7. ivy 超管：`/admin` 兩 Tab（業務與別名 / 帳號）
8. 業務篩選（ivy 預設「自己」，可切全部/未歸屬）
9. 別名對照表；未歸屬不計 KPI
10. **徹底移除** clearAll（UI + 程式 + README）
11. 倍率：全員可讀，僅 ivy 可寫；**rep 新增案件不寫倍率表**
12. **訪客閘**、**RLS 同版 deploy**、**kpiRecords** — 見 spec v1.1 / 需求 §13

實作順序見需求清單 §8。衝突釐清見 §11。機器 spec：[spec/spec-architecture-auth-multi-account-rls.md](../spec/spec-architecture-auth-multi-account-rls.md) v1.1。

### 實作前 Kyson 需提供

- ivy 超管 **真實 email**（Supabase Auth）
- 一般帳號 Auth 網域 `{login}@???`

---

## 7. UI/UX 債務（非登入阻塞）

見 `ui-ux-plan.md`：CalculatorView 瘦身、1440px 表格 RWD、規則頁文案等。

---

## 8. 協作慣例

- 回覆一律**繁體中文**
- `.ps1` 須 UTF-8 with BOM
- 不要未經指示 commit/push/build
- docs 預設不主動大改，除非任務需要

---

## 9. 相關對話紀錄

- Cursor agent transcript：`.cursor/projects/.../agent-transcripts/`
- Claude Code：`~/.claude/projects/C--ivyishotgirl/*.jsonl`

---

*最後更新：2026-06-29（§0 簡易閘現況；正式版 spec 仍待實作）*
