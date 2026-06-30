---
title: Ivy的獎金 — 多帳號登入、RLS 與業務隔離
version: 1.2
date_created: 2026-06-28
last_updated: 2026-06-29
owner: Kyson Wang
tags: [architecture, security, auth, supabase, vue, fastapi]
---

# Introduction

本規格定義 **Ivy的獎金**（`ivyishotgirl`）第二階段：多業務帳號登入、Supabase Row Level Security（RLS）資料隔離、訪客試算模式、管理後台與相關 API。目標是讓 Generative AI 與開發者能在無額外口頭上下文下實作並驗收。

**已完成基線（不在本 spec 重複實作）**：案件業務欄位 `sales_rep`、報價單抓取、帳本 UI、季度獎金計算。見 `docs/需求清單.md` §1。

**線上過渡現況（2026-06-29，非本 spec 目標態）**：單一共用 Auth 帳號 `gate@ivy.app` + RLS `authenticated` 全表讀寫；無訪客試算、無業務隔離。實作本 spec 時須**替換**既有 policy，勿假設 RLS 未啟用。見 `docs/需求清單.md` §0。

---

## 1. Purpose & Scope

### 1.1 Purpose

- 將單人開放資料庫模式升級為 **Supabase Auth + RLS** 的多使用者內部工具。
- 依業務別名隔離案件資料；超管（ivy）可管理帳號、別名與全域倍率。
- 支援 **訪客試算**（記憶體、不寫 DB）以降低 demo 門檻。

### 1.2 In Scope

- 新表：`sales_reps`、`sales_rep_aliases`、`user_profiles`
- RLS policies 與 migration
- 後端 Auth / Admin API（FastAPI + service role）
- 前端：登入、`/admin`、路由守衛、試算模式、業務篩選、首次改密 modal
- `/api/fetch-quote` rate limit
- 移除 `clearAll` 相關程式與 README 描述

### 1.3 Out of Scope

見 **OOS-001–OOS-008**（§3）。包含 MFA、稽核日誌、SSO、BFF 全包、`sales_rep_id` FK 重構、企業合規等。

### 1.4 Audience

- 實作本功能的 AI agent 或工程師
- 驗收者（Kyson Wang）

### 1.5 Assumptions

- 部署於 **Vercel**（前端 + FastAPI serverless）
- 資料庫為 **Supabase PostgreSQL**
- 報價單來源固定為 `https://quote.saiens.tw/*`
- 實作前由 owner 提供：`IVY_AUTH_EMAIL`（ivy 真實 email）、`AUTH_EMAIL_DOMAIN`（一般帳號 `{login}@{domain}`）

---

## 2. Definitions

| Term             | Definition                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| **AM**           | Account Manager；本系統使用者（業務或超管）                                                          |
| **ivy**          | 超級管理員帳號；`role=super`；登入帳號 `ivy`                                                         |
| **rep**          | 一般業務帳號；`role=rep`                                                                             |
| **登入帳號**     | `user_profiles.login_username`；英文/數字；登入畫面輸入                                              |
| **顯示名稱**     | `user_profiles.display_name`；可中文；UI 展示用                                                      |
| **Auth email**   | Supabase Auth 用 email；ivy 為真實 email，其他為 `{login_username}@{AUTH_EMAIL_DOMAIN}`              |
| **業務主檔**     | `sales_reps` 一列；含 `display_name`                                                                 |
| **別名**         | `sales_rep_aliases.alias`；與報價單 `bonus_records.sales_rep` 字串完全相等即歸屬                     |
| **未歸屬**       | `trim(sales_rep) ≠ ''` 且無任何別名匹配；**空字串不算未歸屬**；僅 ivy 在「未歸屬」篩選可見；不計 KPI |
| **已歸屬**       | `sales_rep` 與某業務別名完全匹配；或 `sales_rep` 為空字串（不計未歸屬、不計入 rep 案件）             |
| **試算模式**     | 未登入狀態；資料僅存於前端記憶體                                                                     |
| **RLS**          | PostgreSQL Row Level Security                                                                        |
| **service role** | Supabase service role key；僅後端使用                                                                |
| **JWT**          | Supabase session access token；前端帶入 Supabase client                                              |
| **KPI**          | 帳本脈絡列應計/實領統計（`QuarterContextBar` 等）                                                    |
| **財務季度**     | 2–4→Q1、5–7→Q2、8–10→Q3、11–12+隔年1月→Q4；1月歸前一年 Q4                                            |

---

## 3. Requirements, Constraints & Guidelines

### 3.1 Functional Requirements

- **REQ-001**: 系統 SHALL 提供登入畫面；使用者輸入登入帳號 + 密碼（非 email）。
- **REQ-002**: 登入 SHALL 經 `POST /api/auth/login` 解析 `login_username` → Auth email → Supabase session。
- **REQ-003**: 登入成功且 `must_change_password=true` 時，SHALL 顯示不可關閉的改密 modal；改密完成前 SHALL NOT 進入主 UI。
- **REQ-004**: 改密成功 SHALL 將 `user_profiles.must_change_password` 設為 `false`。
- **REQ-005**: 登入畫面 SHALL 提供「記住我」；未勾選用 `sessionStorage`，勾選用 `localStorage` 保存 session。
- **REQ-006**: 未登入使用者 SHALL 可進入 `/`、`/multipliers`、`/rules`；SHALL NOT 讀寫 Supabase。
- **REQ-007**: 未登入使用者 SHALL 可貼報價 URL、呼叫 `/api/fetch-quote`、在記憶體試算、匯出當次 CSV。
- **REQ-008**: 未登入試算資料 SHALL 在重整或關分頁後消失；UI SHALL 顯示「試算模式，資料不會儲存」。
- **REQ-009**: 登入後 SHALL 從 Supabase 載入 `bonus_records` 與 `quarter_multipliers`；恢復現有 CRUD 流程。
- **REQ-010**: rep 帳號 SHALL 僅能看見、編輯、刪除別名匹配到自己 `sales_rep_id` 的案件（RLS + 前端一致）。
- **REQ-011**: ivy SHALL 可透過 UI 篩選「自己 / 其他業務 / 全部 / 未歸屬」；預設「自己」；**「其他業務」= 下拉選單選擇單一 `sales_rep_id`**（見 §4.8）。
- **REQ-012**: 「未歸屬」篩選 SHALL 僅 ivy 可用；未歸屬列 SHALL NOT 出現在「自己/全部」視圖。
- **REQ-013**: 未歸屬案件 SHALL NOT 計入 KPI；掛別名後 SHALL 計入。
- **REQ-014**: ivy SHALL 可在帳本表格對未歸屬列指定業務；SHALL 將該 `sales_rep` 字串加入該業務別名表。
- **REQ-015**: `/admin` SHALL 僅 ivy 可進入；含 Tab「業務與別名」「帳號」。
- **REQ-016**: ivy SHALL 可 CRUD 業務主檔與別名、建立/停用帳號、設初始密碼、重設 `must_change_password`。
- **REQ-017**: 季度倍率 SHALL 全站共用一份；rep 與訪客 SHALL NOT 寫入；ivy SHALL 可寫。
- **REQ-018**: rep SHALL 可讀倍率並用於計算；訪客 SHALL 使用記憶體預設倍率試算。
- **REQ-019**: 系統 SHALL NOT 提供「清空全部」功能；SHALL 移除所有 `clearAll*` 程式符號。
- **REQ-020**: 訪客模式 SHALL NOT 呼叫 `ensureLoaded()` 讀 Supabase；SHALL NOT 執行任何 `persistToDb` 寫入。
- **REQ-021**: rep 新增／更新案件 SHALL NOT 寫入 `quarter_multipliers`；缺列時 SHALL 用記憶體預設倍率 `(1,1,1,1)` 計算。
- **REQ-022**: rep 在案件表格 SHALL NOT 手改 `sales_rep` 欄（唯讀）；ivy 可改；再同步仍更新 `sales_rep`。
- **REQ-023**: KPI／統計（`QuarterContextBar`、`ledgerSummary`）SHALL 使用 `kpiRecords`：排除未歸屬列；ivy 在「未歸屬」篩選時 KPI 仍不計未歸屬列。
- **REQ-024**: Admin 列表 SHALL 經 GET admin API 或 super 身分之 Supabase 讀取；SHALL NOT 對 anon 暴露。
- **REQ-025**: rep SHALL NOT INSERT／UPDATE `bonus_records` 當 `trim(sales_rep) = ''`；僅 super 可寫入空 `sales_rep`；rep 遇此情況 SHALL 顯示阻擋訊息且不呼叫 persist（見 GUD-009）。
- **REQ-026**: 登入／登出／換帳號時 SHALL 重置 `ledger` 的 `loadPromise` 快取並清空記憶體 `records`／`quarterMultipliers`，再依新身分 `ensureLoaded()`。

### 3.2 Security Requirements

- **SEC-001**: `bonus_records`、`user_profiles` 等受保護表 SHALL 啟用 RLS。
- **SEC-002**: anon key SHALL NOT 能讀寫受保護業務資料（驗收需 PostgREST 直測）。
- **SEC-003**: `SUPABASE_SERVICE_ROLE_KEY` SHALL 僅存在於後端環境變數；SHALL NOT 出現在前端 bundle。
- **SEC-004**: `user_profiles` SHALL NOT 對 anon 開放 SELECT。
- **SEC-005**: 登入失敗訊息 SHALL 統一為「帳號或密碼錯誤」（防帳號枚舉）。
- **SEC-006**: Admin API SHALL 驗證 caller 為 `role=super`；否則回 403。
- **SEC-007**: 未登入 `/api/fetch-quote` SHALL 限制同一 IP 每分鐘最多 20 次；超限回 429。
- **SEC-008**: 已登入 `/api/fetch-quote` SHALL NOT 套用 SEC-007 限流；請求 SHALL 可帶 `Authorization: Bearer <access_token>`，後端驗證 JWT 有效後跳過限流。

### 3.3 Constraints

- **CON-001**: 一登入帳號 SHALL 對應一 `sales_rep_id`（一對一）。
- **CON-002**: `bonus_records.sales_rep` SHALL 維持 `text` 原始字串；SHALL NOT 新增 `sales_rep_id` FK。
- **CON-003**: 別名匹配 SHALL 為字串完全相等（區分大小寫、含空白）。
- **CON-004**: `sales_rep_aliases.alias` SHALL 全域唯一。
- **CON-005**: 角色 SHALL 僅 `super` 或 `rep` 兩種。
- **CON-006**: `/api/fetch-quote` 目標 host SHALL 僅 `quote.saiens.tw`。
- **CON-007**: seed 帳號 `ivy` 初始密碼為 `123456`，且 `must_change_password=true`。
- **CON-008**: 啟用 `bonus_records` RLS 之部署 SHALL 與前端 Auth + 訪客閘（REQ-020）同一版本上線；SHALL NOT 先開 RLS 後補前端。

### 3.4 Guidelines

- **GUD-001**: RLS 為權限最終防線；前端篩選為 UX 輔助，不可單靠前端隔離。
- **GUD-002**: 再同步報價 SHALL 更新 `sales_rep`；抓不到時保留原值（既有行為）。
- **GUD-003**: 新增案件時客戶類型由使用者選；再同步 SHALL NOT 覆寫客戶類型（`preserveCustomerFields`）。
- **GUD-004**: 客戶類型 % 由程式推導，不存 DB：`biz` 2%、`kitchen` 3%、`designer` 4%、`personal` 5%。
- **GUD-005**: 季度倍率自 `2026-Q2`（`MULTIPLIER_START_KEY`）起適用；更早季度顯示「無法計算」。
- **GUD-006**: `multiplierFor(key)`：DB 無該 key 時 fallback 記憶體預設 `(1,1,1,1)`；與訪客試算一致。
- **GUD-007**: 改密 SHALL 經 `POST /api/auth/change-password`（或等效流程）：更新 Auth 密碼後，後端以 service role 將 `must_change_password=false`。
- **GUD-008**: 既有 `bonus_records` 上線 RLS 前 SHALL 已清空，或 ivy 先建立別名；否則 rep 可能看不到歷史列（預期行為）。
- **GUD-009**: rep 儲存案件前 SHALL 檢查 `trim(sales_rep) !== ''`；若為空則提示：「此報價單無案件業務，無法加入你的帳本；請聯絡管理員或請 ivy 處理。」不寫 DB。
- **GUD-010**: `persistToDb` SHALL 檢查 `isGuest`；寫入 `quarter_multipliers` 額外檢查 `role === 'super'`。登出時 `loadPromise = null`（REQ-026）。

### 3.5 Out of Scope (Explicit)

- **OOS-001**: MFA / 2FA
- **OOS-002**: 稽核日誌
- **OOS-003**: 密碼重設信 / Forgot password flow
- **OOS-004**: SSO / OAuth
- **OOS-005**: 全資料 BFF（維持 Supabase client + JWT + RLS）
- **OOS-006**: `sales_rep_id` 寫入 `bonus_records`
- **OOS-007**: SOC2 / 企業合規
- **OOS-008**: 三種以上角色

### 3.6 Implementation Order

**部署原則（CON-008）**：下列 1–4 完成後 **一次 deploy** 再對 production 執行 `bonus_records` RLS enable migration。本地開發可全程開 RLS。

1. 新表（`sales_reps`、`aliases`、`user_profiles`）+ seed ivy；**先不** enable `bonus_records` RLS（或僅 staging）
2. 後端 `/api/auth/login`、`/api/auth/change-password`、admin routes（含 GET 列表）
3. 前端 Auth composable、路由守衛、改密 modal、**訪客閘**（REQ-020）、rep 不寫倍率（REQ-021）
4. fetch-quote rate limit + JWT 免限流（SEC-008）
5. **Production migration**：enable RLS on `bonus_records`、`quarter_multipliers` + policies
6. 業務篩選 UI + `kpiRecords`（REQ-023）
7. `/admin` 管理頁
8. 倍率頁依角色禁用編輯；rep 不 persist 倍率
9. 移除 clearAll + 更新 README
10. 驗收 §5

### 3.7 Auth & Guest Ledger Behavior

| 函式／行為                           | 訪客（試算）                        | 已登入                                        |
| ------------------------------------ | ----------------------------------- | --------------------------------------------- |
| `ensureLoaded()`                     | **不呼叫**；`isLoading=false`       | 呼叫；載入 DB                                 |
| `persistToDb(fn)`                    | **no-op**                           | 執行 fn                                       |
| `records` 初始                       | `[]` 記憶體                         | 來自 Supabase                                 |
| `quarterMultipliers` 初始            | 記憶體 `{}` + `defaultMultiplier()` | 來自 Supabase                                 |
| `upsertRecord` 內 `upsertMultiplier` | no-op（整段 persist 被擋）          | **僅 super** 才 persist 倍率；rep 只寫 record |
| `updateMultiplier` / `addYear`       | UI disabled 或 no-op                | rep：disabled；super：可寫                    |

實作建議：新增 `src/composables/auth.ts`（或 `useAuth()`）提供 `isGuest`、`role`、`profile`；`ledger.ts` 的 `persistToDb` 開頭檢查 `isGuest`。

---

## 4. Interfaces & Data Contracts

### 4.1 Database Schema

#### Existing (unchanged columns)

**`bonus_records`**: 含 `sales_rep text not null default ''` 等（見 `supabase/schema.sql`）。

**`quarter_multipliers`**: `key`, `rocket`, `repurchase`, `avg_order`, `yield_rate`, `updated_at`。

#### New Tables

```sql
CREATE TABLE sales_reps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales_rep_aliases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id  uuid NOT NULL REFERENCES sales_reps(id),
  alias         text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id),
  login_username        text NOT NULL UNIQUE,
  display_name          text NOT NULL,
  auth_email            text NOT NULL UNIQUE,
  role                  text NOT NULL CHECK (role IN ('super', 'rep')),
  sales_rep_id          uuid NOT NULL REFERENCES sales_reps(id),
  must_change_password  boolean NOT NULL DEFAULT false,
  active                boolean NOT NULL DEFAULT true
);
```

#### RLS Summary

| Table                             | anon | rep                                                                                | super                          |
| --------------------------------- | ---- | ---------------------------------------------------------------------------------- | ------------------------------ |
| `bonus_records`                   | none | CRUD where `sales_rep` matches own aliases；**`trim(sales_rep)=''` 僅 super 可寫** | all                            |
| `quarter_multipliers`             | none | SELECT                                                                             | SELECT, INSERT, UPDATE, DELETE |
| `sales_reps`, `sales_rep_aliases` | none | SELECT (read aliases for ownership)                                                | all                            |
| `user_profiles`                   | none | SELECT own row                                                                     | all                            |

Implementation MAY use `security definer` helper, e.g. `current_user_role()`, `record_belongs_to_current_rep(sales_rep text)`.

### 4.2 REST API — Existing

#### `GET /api/health`

Response: `{ "ok": true, "message": "server is running" }`

#### `POST /api/fetch-quote`

Request:

```json
{ "url": "https://quote.saiens.tw/..." }
```

Optional header: `Authorization: Bearer <supabase_access_token>` — 若 JWT 有效，跳過 SEC-007 限流。

Success: existing shape from `api/index.py` (includes `salesRep`, amounts, dates, etc.).

Errors: `400` invalid URL/host; `429` rate limit (guest); quote HTTP errors as today.

**Rate limit**: guest — max 20 requests/minute/IP; authenticated — unlimited.

### 4.3 REST API — New (Auth)

#### `POST /api/auth/login`

Request:

```json
{
  "loginUsername": "ivy",
  "password": "string",
  "rememberMe": false
}
```

Success (200):

```json
{
  "ok": true,
  "session": {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": 3600
  },
  "profile": {
    "userId": "uuid",
    "loginUsername": "ivy",
    "displayName": "string",
    "role": "super",
    "salesRepId": "uuid",
    "mustChangePassword": true
  }
}
```

Failure (401): `{ "ok": false, "message": "帳號或密碼錯誤" }` — same message for unknown user, wrong password, inactive account.

**登入流程（固定，REQ-002）**：

1. 前端 `POST /api/auth/login` `{ loginUsername, password, rememberMe }`
2. 後端 service role 查 `user_profiles`（`login_username`、`active=true`）→ 得 `auth_email`
3. 後端呼叫 Supabase GoTrue `POST {SUPABASE_URL}/auth/v1/token?grant_type=password`，body `{ email, password }`（anon key 或 service 依 Supabase 文件）
4. 成功 → 回 `accessToken`、`refreshToken`、`profile`（含 `mustChangePassword`）
5. 前端 `supabase.auth.setSession({ access_token, refresh_token })`
6. `rememberMe` 決定 session 存 `localStorage` vs `sessionStorage`（可包一層 auth storage adapter）
7. 若 `mustChangePassword` → 改密 modal；否則 `ensureLoaded()`

#### `POST /api/auth/change-password` (authenticated)

Request: `{ "newPassword": "string" }` + header `Authorization: Bearer <access_token>`.

Flow:

1. 後端驗證 JWT → 得 `user_id`
2. 呼叫 Supabase 更新密碼（Admin API 或帶 user JWT 之 update user）
3. 後端 service role：`UPDATE user_profiles SET must_change_password = false WHERE user_id = ?`
4. 回 `{ "ok": true }`；前端關 modal → `ensureLoaded()`

#### `POST /api/auth/logout`

Invalidates session (client + server as applicable).

### 4.4 REST API — New (Admin, super only)

All require valid JWT + `role=super`. Non-super → `403`.

| Method | Path                                 | Purpose                                              |
| ------ | ------------------------------------ | ---------------------------------------------------- |
| GET    | `/api/admin/users`                   | 列出帳號（含綁定業務、active、must_change_password） |
| POST   | `/api/admin/users`                   | Create auth user + profile + bind sales_rep          |
| PATCH  | `/api/admin/users/{userId}`          | Deactivate, set must_change_password                 |
| GET    | `/api/admin/sales-reps`              | 列出業務主檔                                         |
| POST   | `/api/admin/sales-reps`              | Create sales rep                                     |
| PATCH  | `/api/admin/sales-reps/{id}`         | Update/deactivate                                    |
| GET    | `/api/admin/sales-reps/{id}/aliases` | 列出該業務別名                                       |
| POST   | `/api/admin/sales-reps/{id}/aliases` | Add alias                                            |
| DELETE | `/api/admin/aliases/{id}`            | Remove alias                                         |

Create user body example:

```json
{
  "loginUsername": "amy01",
  "displayName": "王小明",
  "salesRepId": "uuid",
  "role": "rep",
  "initialPassword": "string"
}
```

Backend SHALL set `auth_email = "{loginUsername}@{AUTH_EMAIL_DOMAIN}"` except ivy uses `IVY_AUTH_EMAIL`.

### 4.5 Frontend Routes

| Path           | Guest           | rep                   | super      |
| -------------- | --------------- | --------------------- | ---------- |
| `/login`       | yes             | redirect if logged in | same       |
| `/`            | trial           | yes                   | yes        |
| `/multipliers` | trial read-only | read                  | read/write |
| `/rules`       | yes             | yes                   | yes        |
| `/admin`       | no              | no                    | yes        |

### 4.6 Environment Variables

| Variable                    | Where               | Required      |
| --------------------------- | ------------------- | ------------- |
| `VITE_SUPABASE_URL`         | frontend            | yes           |
| `VITE_SUPABASE_ANON_KEY`    | frontend            | yes           |
| `SUPABASE_SERVICE_ROLE_KEY` | backend only        | yes (phase 2) |
| `IVY_AUTH_EMAIL`            | backend seed/config | yes at seed   |
| `AUTH_EMAIL_DOMAIN`         | backend             | yes at seed   |

### 4.7 TypeScript — BonusRecord (existing)

See `src/lib/db.ts`: `salesRep: string` maps to `sales_rep`.

### 4.8 Frontend — Filtering & KPI

新增（或擴充）`ledger.ts`：

- `isUnassigned(record)`: `trim(salesRep) !== ''` 且無全域別名匹配（需載入 `sales_rep_aliases` 或快取別名集合）。
- `salesRepFilter`（ivy）：`'self' | 'other' | 'all' | 'unassigned'`；選 **other** 時搭配 `selectedOtherSalesRepId: uuid`。
- **自己**：`sales_rep` 匹配 ivy 綁定業務之別名。
- **其他業務**：`sales_rep` 匹配所選 `sales_rep_id` 之別名（下拉列出其他 active 業務，不含自己）。
- **全部**：所有**已歸屬**列（有別名匹配）；**不含**未歸屬、**不含** `trim(sales_rep)=''`（空字串僅 super 在「全部」可見，不計 KPI）。
- **未歸屬**：僅 `isUnassigned(record)` 為 true 之列。
- `tableRecords`：工作季度篩選後 × 業務篩選結果；供表格、`全部再同步`。
- `kpiRecords`：`tableRecords` 再排除 `isUnassigned`；`ledgerSummary`／`QuarterContextBar` 筆數與金額 **只用** `kpiRecords`。
- `repVisibleRecords`：rep 鎖定自己別名（無業務下拉）。

`RecordsTable`：`sales_rep` 欄位 rep 為 read-only；super 可編輯。

### 4.9 Local Development Environment

| Variable                    | `.env.local` (frontend) | Vercel / API env |
| --------------------------- | ----------------------- | ---------------- |
| `VITE_SUPABASE_URL`         | yes                     | —                |
| `VITE_SUPABASE_ANON_KEY`    | yes                     | —                |
| `SUPABASE_SERVICE_ROLE_KEY` | optional for local API  | **required**     |
| `IVY_AUTH_EMAIL`            | —                       | seed 時          |
| `AUTH_EMAIL_DOMAIN`         | —                       | seed 時          |

---

## 5. Acceptance Criteria

- **AC-001**: Given 未登入, When 貼 URL 試算並重整, Then 試算列消失且 Supabase 無新資料。
- **AC-002**: Given 未登入, When 同一 IP 第 21 次/分鐘呼叫 fetch-quote, Then 回 429。
- **AC-003**: Given 已登入 rep A, When 以 PostgREST 查 `bonus_records`, Then 僅見 A 別名匹配列。
- **AC-004**: Given 已登入 rep B, When 以 A 的案件 id 嘗試 UPDATE, Then RLS 拒絕。
- **AC-005**: Given anon key 無 JWT, When 直打 PostgREST SELECT bonus_records, Then 空或 401/403。
- **AC-006**: Given ivy 登入, When 進入帳本, Then 業務篩選預設「自己」。
- **AC-007**: Given ivy 切「全部」, When 檢視 KPI, Then 含所有已歸屬案件、不含未歸屬。
- **AC-008**: Given ivy 切「未歸屬」, When 檢視表格, Then 僅未匹配別名之列；KPI 不計這些列。
- **AC-009**: Given ivy 對未歸屬列掛業務, When 完成, Then 該 `sales_rep` 加入別名表且案件計入該業務 KPI。
- **AC-010**: Given seed ivy 首次登入, When 密碼未改, Then modal 阻擋主 UI。
- **AC-011**: Given 新 rep 首次登入, When 密碼未改, Then modal 阻擋主 UI。
- **AC-012**: Given rep, When 造訪 `/admin` 或 admin API, Then 403 或導回。
- **AC-013**: Given rep, When 編輯倍率頁, Then 控件 disabled。
- **AC-014**: Given ivy, When 建立帳號, Then 新使用者 `must_change_password=true` 且首次須改密。
- **AC-015**: Given 未登入, When 匯出 CSV, Then 僅含當次試算列。
- **AC-016**: Given repo 全文搜尋, When 搜尋 `clearAll`, Then 零結果；README 無「清空紀錄」。
- **AC-017**: Given 未登入, When 新增試算列, Then Supabase 無 INSERT（persistToDb no-op）。
- **AC-018**: Given rep 新增新季度第一筆案件, When 儲存, Then 案件成功、無 quarter_multipliers INSERT 錯誤；計算用預設倍率。
- **AC-019**: Given rep, When 檢視表格, Then `sales_rep` 欄不可編輯。
- **AC-020**: Given ivy 切「全部」, When 看 KPI, Then 未歸屬列不計入。
- **AC-021**: Given 已登入 JWT, When fetch-quote 帶 Authorization, Then 不受 20/min IP 限流。
- **AC-022**: Given rep, When 報價 `sales_rep` 為空並嘗試儲存, Then 不寫 DB 且顯示 GUD-009 訊息。
- **AC-023**: Given ivy 選「其他業務」並選 amy, When 看表格, Then 僅 amy 別名匹配列；KPI 同 `kpiRecords` 規則。

---

## 6. Test Automation Strategy

- **Test Levels**: 手動驗收為主（owner 慣例不自動 build/test）；建議補充 Postman/ curl 整合測試 RLS 與 API。
- **Frameworks**: 可選 Vitest 測試別名匹配與 ledger 過濾純函式；Playwright 非必須。
- **Test Data**: seed ivy + 2 rep 測試帳號 + 各一業務主檔與別名；各建 1–2 筆 `bonus_records`。
- **CI/CD**: 現階段無強制 CI gate；PR 前建議跑 `npm run type-check`。
- **Coverage**: 無最低覆蓋率要求。
- **Performance**: rate limit 以單 IP 手動驗證即可；無 load test 要求。

### 6.1 Manual RLS Test Script (Required for Sign-off)

1. 登入 rep A，複製 JWT。
2. 用 curl + anon key + JWT 查 `bonus_records` → 僅 A 案件。
3. 換 rep B JWT 查 A 的案件 id → 失敗。
4. 僅 anon key 查 → 失敗或空。

---

## 7. Rationale & Context

- **Auth + RLS**：小團隊 Supabase 應用的標準多使用者隔離；避免僅靠前端 hiding。
- **login_username 與 Auth email 分離**：UX 要簡短帳號；Supabase Auth 仍用 email 欄位。
- **別名字串匹配**：報價單欄位為自由文字；保留原始值利於對帳；別名表由 ivy 維護。
- **未歸屬獨立篩選**：避免污染 ivy 預設「自己」視圖；KPI 不含未處理資料。
- **訪客試算**：降低導入門檻；明確不寫 DB 避免資料污染。
- **rate limit**：開放 fetch-quote 給訪客之 trade-off；20/min/IP 為基本防濫用。
- **移除 clearAll**：多人環境誤刪風險過高。
- **rep 不寫倍率**：避免 RLS 拒絕與權限衝突；缺 DB 列時記憶體預設與訪客一致。
- **同一版 deploy RLS**：避免現有 `ensureLoaded()` 在未登入時全站斷線。
- **空 sales_rep 不算未歸屬**：與「報價未帶業務」區分；ivy 在全部視圖處理。

---

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001**: `quote.saiens.tw` — HTML 報價單來源；server-side fetch only。

### Third-Party Services

- **SVC-001**: Supabase Auth — email/password 登入、session JWT。
- **SVC-002**: Supabase PostgreSQL — 持久化 + RLS。

### Infrastructure Dependencies

- **INF-001**: Vercel — 託管 Vue SPA 與 FastAPI serverless。
- **INF-002**: Supabase project — URL、anon key、service role key。

### Data Dependencies

- **DAT-001**: 報價單 HTML — 動態欄位含「案件業務」；解析邏輯在 `api/index.py`。

### Technology Platform Dependencies

- **PLT-001**: Vue 3 + TypeScript + Vue Router — 前端 SPA。
- **PLT-002**: FastAPI — Python 後端 API。
- **PLT-003**: `@supabase/supabase-js` — 前端 DB/Auth client。

### Compliance Dependencies

- **COM-001**: 無監管合規要求；Out of scope 見 OOS-007。

---

## 9. Examples & Edge Cases

### 9.1 Alias Ownership

```
bonus_records.sales_rep = "Ivy 蔣慶瑤"
sales_rep_aliases.alias = "Ivy 蔣慶瑤" → sales_rep_id = ivy 的業務主檔
→ rep ivy 可見；其他 rep 不可見（除非別名亦匹配）
```

### 9.2 Unassigned Record

```
sales_rep = "新業務 張三"（別名表無此字串）
→ 僅 ivy + 篩選「未歸屬」可見；badge「未歸屬」
→ ivy 指定業務後 INSERT alias；下次歸屬正常
```

### 9.3 Resync Preserves sales_rep When Missing

```
再同步報價若 HTML 無案件業務欄位 → 保留 DB 原 sales_rep（既有 §1 行為）
```

### 9.4 Empty sales_rep

```
sales_rep = "" 或僅空白 → 不算「未歸屬」；不出現在 ivy「未歸屬」篩選
→ rep：RLS 拒絕寫入；前端 GUD-009 阻擋 persist
→ super：可寫入；ivy「全部」可見；不計入 kpiRecords（無別名匹配）
→ 處理：ivy 手改 sales_rep 或等再同步帶出業務後，rep 才能納入自己帳本
```

### 9.5 Ivy「其他業務」篩選

```
ivy 選「其他業務」→ 下拉選「王小明」對應 sales_rep_id
→ 表格僅 sales_rep 匹配王小明別名之列
→ 不含未歸屬、不含空 sales_rep
```

### 9.6 Rep Cannot Edit sales_rep Manually

```
rep 在表格改不到 sales_rep；僅能透過再同步更新（若報價有帶）
若誤把別人案件同步進來且 sales_rep 是別人別名 → RLS 拒絕寫入
```

### 9.7 New Quarter Without DB Multiplier Row

```
rep 新增 2027-Q1 第一案 → 只 upsert bonus_records
multiplierFor("2027-Q1") → DB 無列 → 記憶體 {1,1,1,1}
ivy 日後在倍率頁寫入 DB → 全員讀到新倍率
```

### 9.8 Login Error Uniformity

```
未知帳號 "nope" 與錯誤密碼 → 皆回「帳號或密碼錯誤」
```

---

## 10. Validation Criteria

Spec 實作完成當且僅當：

1. §5 全部 AC 通過（可勾選 `docs/需求清單.md` §9 對照）。
2. `supabase/schema.sql` 與 migration 不再 disable RLS（新環境）。
3. 後端 env 含 service role；前端 bundle 不含 service role。
4. §3.5 所有 OOS 項目未意外實作（避免 scope creep）。

---

## 11. Related Specifications / Further Reading

- [docs/需求清單.md](../docs/需求清單.md) — 人類可讀需求與決策紀錄
- [docs/handoff.md](../docs/handoff.md) — 專案交接與檔案地圖
- [docs/handoff-prompt.md](../docs/handoff-prompt.md) — 新 session 接手提示詞
- [docs/ui-ux-plan.md](../docs/ui-ux-plan.md) — UI/UX 細節（次要）
- [supabase/schema.sql](../supabase/schema.sql) — 現有表結構
- [api/index.py](../api/index.py) — 報價抓取實作
