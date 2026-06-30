import { supabase } from './supabase'
import type { CustomerType } from '@/shared/customerType'
import { normalizeCustomerType } from '@/shared/customerType'

export type { CustomerType } from '@/shared/customerType'
export interface QuarterMultiplier {
  rocket: number
  repurchase: number
  avgOrder: number
  yieldRate: number
}

export interface BonusRecord {
  id: string
  quoteUrl: string
  orderNo: string
  customerName: string
  customerType: CustomerType
  salesRep: string
  taxExcludedAmount: number
  taxIncludedAmount: number
  signedMonth: string
  paidMonth: string
  amountInferred: boolean
  amountDebug: Record<string, unknown>
  signedAtText: string
  updatedAt: string
}

// ---------- mappers ----------

function recordToRow(r: BonusRecord) {
  return {
    id: r.id,
    quote_url: r.quoteUrl,
    order_no: r.orderNo,
    customer_name: r.customerName,
    customer_type: r.customerType,
    sales_rep: r.salesRep,
    tax_excluded_amount: Math.round(r.taxExcludedAmount),
    tax_included_amount: Math.round(r.taxIncludedAmount),
    signed_month: r.signedMonth,
    paid_month: r.paidMonth,
    amount_inferred: r.amountInferred,
    amount_debug: r.amountDebug,
    signed_at_text: r.signedAtText,
    updated_at: r.updatedAt,
  }
}

function rowToRecord(row: Record<string, unknown>): BonusRecord {
  const ct = normalizeCustomerType(String(row.customer_type ?? 'unknown'))
  return {
    id: String(row.id ?? ''),
    quoteUrl: String(row.quote_url ?? ''),
    orderNo: String(row.order_no ?? ''),
    customerName: String(row.customer_name ?? ''),
    customerType: ct,
    salesRep: String(row.sales_rep ?? ''),
    taxExcludedAmount: Number(row.tax_excluded_amount ?? 0),
    taxIncludedAmount: Number(row.tax_included_amount ?? 0),
    signedMonth: String(row.signed_month ?? ''),
    paidMonth: String(row.paid_month ?? ''),
    amountInferred: Boolean(row.amount_inferred),
    amountDebug: (row.amount_debug as Record<string, unknown>) ?? {},
    signedAtText: String(row.signed_at_text ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function multiplierToRow(key: string, m: QuarterMultiplier) {
  return {
    key,
    rocket: m.rocket,
    repurchase: m.repurchase,
    avg_order: m.avgOrder,
    yield_rate: m.yieldRate,
    updated_at: new Date().toISOString(),
  }
}

function rowToMultiplier(row: Record<string, unknown>): QuarterMultiplier {
  return {
    rocket: Number(row.rocket ?? 1),
    repurchase: Number(row.repurchase ?? 1),
    avgOrder: Number(row.avg_order ?? 1),
    yieldRate: Number(row.yield_rate ?? 1),
  }
}

// ---------- bonus_records ----------

export async function fetchRecords(): Promise<BonusRecord[]> {
  const { data, error } = await supabase
    .from('bonus_records')
    .select('*')
    .order('paid_month', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => rowToRecord(row as Record<string, unknown>))
}

export async function upsertRecord(record: BonusRecord): Promise<void> {
  const { error } = await supabase
    .from('bonus_records')
    .upsert(recordToRow(record), { onConflict: 'id' })
  if (error) throw error
}

export async function deleteRecord(id: string): Promise<void> {
  const { error } = await supabase.from('bonus_records').delete().eq('id', id)
  if (error) throw error
}

// ---------- quarter_multipliers ----------

export async function fetchMultipliers(): Promise<Record<string, QuarterMultiplier>> {
  const { data, error } = await supabase.from('quarter_multipliers').select('*')
  if (error) throw error
  return Object.fromEntries(
    (data ?? []).map((row) => [row.key, rowToMultiplier(row as Record<string, unknown>)]),
  )
}

export async function upsertMultiplier(key: string, m: QuarterMultiplier): Promise<void> {
  const { error } = await supabase
    .from('quarter_multipliers')
    .upsert(multiplierToRow(key, m), { onConflict: 'key' })
  if (error) throw error
}

export async function upsertMultipliers(
  multipliers: Record<string, QuarterMultiplier>,
): Promise<void> {
  const rows = Object.entries(multipliers).map(([key, m]) => multiplierToRow(key, m))
  if (!rows.length) return
  const { error } = await supabase.from('quarter_multipliers').upsert(rows, { onConflict: 'key' })
  if (error) throw error
}
