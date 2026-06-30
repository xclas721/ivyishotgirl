# 接手提示詞（複製貼給 Cursor / Claude）

將下方整段複製到新對話的第一則訊息。

---

```
你是 Ivy的獎金（ivyishotgirl）的開發助手。維護者：Kyson Wang。請用繁體中文回覆。

## 專案
Repo: https://github.com/xclas721/ivyishotgirl（main）
AM 季度獎金試算：貼 quote.saiens.tw URL 抓報價 → 依回簽季度算應計、收款季度看實領 → Supabase 持久化。

## 必讀文件（按順序）
1. docs/handoff.md — 架構、現況、協作慣例
2. docs/需求清單.md — 登入/多帳號/業務隔離規格（§1 已完成，§2–§5 待實作；§12 不必追求）
3. spec/spec-architecture-auth-multi-account-rls.md — AI 可讀實作 spec（REQ/AC/API/RLS）
4. docs/ui-ux-plan.md — UX 規劃（1440px RWD、手機側欄、視覺特效）

## 技術棧
Vue 3 + TS + Tailwind v4 | FastAPI api/index.py | Supabase | Vercel
啟動：npm start → http://localhost:3000（需 .env.local 的 VITE_SUPABASE_*）
登入實作後後端另需 SUPABASE_SERVICE_ROLE_KEY（僅 Vercel env，不可進前端）
不要自動 build/test，除非我明確要求。commit/push 需我指示。

## 關鍵檔案
- src/composables/gate.ts — 過渡：單一共用 Auth 閘（gate@ivy.app）
- src/composables/ledger.ts — 全域狀態、篩選、Supabase 讀寫
- src/composables/ledgerSummary.ts — 獎金計算
- src/shared/fiscalQuarter.ts — 財務季度；倍率自 2026-Q2 起（MULTIPLIER_START_KEY）
- src/shared/customerType.ts — 四類客戶 2–5%，同步不覆寫客戶類型
- src/views/CalculatorView.vue — 帳本主頁
- api/index.py — 抓報價；extract_sales_rep()；正式版待加 auth/admin API、rate limit
- supabase/schema.sql — 含 sales_rep、RLS（authenticated 全開，過渡用）

## 業務規則（勿搞錯）
- 客戶類型：biz 2% / kitchen 3% / designer 4% / personal 5%
- 新增時自選客戶類型；再同步 preserveCustomerFields 不覆寫類型
- sales_rep 從報價單自動帶入；再同步會更新（抓不到保留原值）
- 2026-Q2 前季度最終獎金「無法計算」，不計入發放總計

## 安全與登入

**線上（過渡）**：單一共用帳號 + RLS 已開；無訪客試算。見 docs/需求清單.md §0。

**正式版（待實作／是否採用未定）**：
- 方案 B：多帳號 Supabase Auth + 業務隔離 RLS（§7.1）；須替換現有 policy
- POST /api/auth/login + admin routes（service role，§2.9）
- 訪客試算不寫 DB；fetch-quote 訪客 20 次/分/IP，登入不限（§2.8）
- ivy 與業務皆 must_change_password 首次改密（§4.4）
- 徹底移除 clearAll（UI + 程式 + README）
- 不必追求：MFA、稽核、SSO、BFF、sales_rep_id FK（§12）
- 詳細：spec v1.2 §3.6–§3.7、§4.8

## 當前進度
✅ 案件業務 sales_rep 已上線
✅ 簡易登入閘 + Supabase Auth + RLS
✅ 修改密碼、手機側欄 drawer、閃爍/捲軸修正、type-select 統一（2026-06-30）
✅ 需求清單 / spec 已對齊正式版（§2–§5 待實作）
⏳ 若做正式版：需求清單 §8 第 2 步起 — 新表 + 業務隔離 RLS + seed ivy + 後端 API
實作順序見 §8；衝突以 §11 為準；驗收見 §9。

## 實作前需我提供
- ivy 超管真實 email（Supabase Auth）
- 一般帳號 Auth 網域 {login}@???

## 你的任務
[在這裡寫你要做的事，例如：「照需求清單 §8 從第 2 步開始實作登入與 RLS」]
```

---

## 範例任務（可替換最後一行）

- `照 spec/spec-architecture-auth-multi-account-rls.md §3.6 從第 1 步開始實作`
- `只做訪客試算模式（in-memory）+ fetch-quote rate limit，登入下一輪再做`
- `commit 前先幫我對照需求清單 §9 驗收標準列 checklist`
- `實作 §8 第 8 步：刪除 clearAll 並更新 README`
