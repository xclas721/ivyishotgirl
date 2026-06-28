-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table if not exists bonus_records (
  id                   text        primary key,
  quote_url            text        not null default '',
  order_no             text        not null default '',
  customer_name        text        not null default '',
  customer_type        text        not null default 'unknown',
  sales_rep            text        not null default '',
  tax_excluded_amount  integer     not null default 0,
  tax_included_amount  integer     not null default 0,
  signed_month         text        not null default '',
  paid_month           text        not null default '',
  amount_inferred      boolean     not null default false,
  amount_debug         jsonb       not null default '{}',
  signed_at_text       text        not null default '',
  updated_at           timestamptz not null default now()
);

create table if not exists quarter_multipliers (
  key        text         primary key,
  rocket     numeric(8,4) not null default 1,
  repurchase numeric(8,4) not null default 1,
  avg_order  numeric(8,4) not null default 1,
  yield_rate numeric(8,4) not null default 1,
  updated_at timestamptz  not null default now()
);

-- Auth gate: only an authenticated session (the shared account) can read/write.
-- The anon key alone is blocked at the database layer.
alter table bonus_records       enable row level security;
alter table quarter_multipliers enable row level security;

drop policy if exists "authenticated full access" on bonus_records;
create policy "authenticated full access" on bonus_records
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on quarter_multipliers;
create policy "authenticated full access" on quarter_multipliers
  for all to authenticated using (true) with check (true);

-- 升級既有資料庫：移除已廢棄欄位
alter table bonus_records drop column if exists base_commission_rate;

-- 升級既有資料庫：新增「業務」欄位
alter table bonus_records add column if not exists sales_rep text not null default '';
