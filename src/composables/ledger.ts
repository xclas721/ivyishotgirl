// Shared ledger state + persistence, consumed by both the calculator page and
// the quarter-multiplier settings page so they stay in sync.
import { computed, ref } from 'vue'
import { getFiscalQuarter } from '@/shared/fiscalQuarter'
import type { Quarter } from '@/shared/fiscalQuarter'
import * as db from '@/lib/db'
import type { BonusRecord, QuarterMultiplier } from '@/lib/db'

export const records = ref<BonusRecord[]>([])
export const quarterMultipliers = ref<Record<string, QuarterMultiplier>>({})
export const isLoading = ref(true)
export const dbError = ref('')

export const isFileMode = typeof window !== 'undefined' && window.location.protocol === 'file:'

let loadPromise: Promise<void> | null = null

// Load once, shared across pages. Subsequent navigations reuse the cached data.
export function ensureLoaded() {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    if (isFileMode) {
      isLoading.value = false
      return
    }
    isLoading.value = true
    try {
      const [recs, mults] = await Promise.all([db.fetchRecords(), db.fetchMultipliers()])
      records.value = recs
      quarterMultipliers.value = mults
    } catch (err) {
      loadPromise = null
      console.error('[db] load failed', err)
      dbError.value = '無法讀取資料庫，請確認 Supabase 設定（.env.local）正確。'
      throw err
    } finally {
      isLoading.value = false
    }
  })()
  return loadPromise
}

export function persistToDb(fn: () => Promise<void>) {
  fn().catch((err) => {
    console.error('[db]', err)
    dbError.value = '資料同步失敗，請確認網路連線。'
  })
}

// ---------- pure helpers ----------

export function toNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export function canonicalUrl(value: unknown) {
  try {
    const u = new URL(String(value || '').trim())
    return (u.hostname + u.pathname).replace(/\/+$/, '')
  } catch {
    return String(value || '').trim()
  }
}

export function defaultMultiplier(): QuarterMultiplier {
  return { rocket: 1, repurchase: 1, avgOrder: 1, yieldRate: 1 }
}

export function normalizeMultiplier(value: Partial<QuarterMultiplier> = {}) {
  return {
    rocket: toNumber(value.rocket ?? 1) || 1,
    repurchase: toNumber(value.repurchase ?? 1) || 1,
    avgOrder: toNumber(value.avgOrder ?? 1) || 1,
    yieldRate: toNumber(value.yieldRate ?? 1) || 1,
  }
}

export function normalizeMultipliers(source: Record<string, Partial<QuarterMultiplier>>) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, normalizeMultiplier(value)]),
  )
}

export function formatNumber(value: number) {
  return Number(value || 0)
    .toFixed(2)
    .replace(/\.00$/, '')
}

export function formatMultiplier(multiplier: QuarterMultiplier) {
  return `火箭 ${formatNumber(multiplier.rocket)} x 回購 ${formatNumber(multiplier.repurchase)} x 客單 ${formatNumber(multiplier.avgOrder)} x 成材 ${formatNumber(multiplier.yieldRate)}`
}

export function multiplierSummary(key: string, multiplier: QuarterMultiplier) {
  return `${key || '未選回簽季度'}：${formatMultiplier(multiplier)}`
}

export function isDefaultMultiplier(multiplier: QuarterMultiplier) {
  return (
    multiplier.rocket === 1 &&
    multiplier.repurchase === 1 &&
    multiplier.avgOrder === 1 &&
    multiplier.yieldRate === 1
  )
}

// ---------- derived ----------

export const multiplierYears = computed(() => {
  const years = new Set<number>()
  Object.keys(quarterMultipliers.value).forEach((key) => {
    const year = key.match(/^(\d{4})-Q[1-4]$/)?.[1]
    if (year) years.add(Number(year))
  })
  records.value.forEach((record) => {
    const year = getFiscalQuarter(record.signedMonth).year
    if (year) years.add(year)
  })
  return Array.from(years).sort((a, b) => b - a)
})

// ---------- multipliers ----------

export function ensureMultiplier(key: string): boolean {
  if (!key) return false
  if (quarterMultipliers.value[key]) return false
  quarterMultipliers.value[key] = normalizeMultiplier()
  return true
}

export function multiplierFor(key: string): QuarterMultiplier {
  if (!key) return defaultMultiplier()
  return quarterMultipliers.value[key] || defaultMultiplier()
}

export function updateMultiplier(
  key: string,
  field: keyof QuarterMultiplier,
  value: string | number,
) {
  ensureMultiplier(key)
  const multiplier = quarterMultipliers.value[key] || defaultMultiplier()
  multiplier[field] = Math.max(0, toNumber(value))
  quarterMultipliers.value[key] = multiplier
  persistToDb(() => db.upsertMultiplier(key, multiplier))
}

export function addYear(yearInput: string): { ok: boolean; message: string } {
  const year = yearInput.trim()
  if (!/^\d{4}$/.test(year)) return { ok: false, message: '年份格式需為 YYYY。' }
  const newMults: Record<string, QuarterMultiplier> = {}
  ;(['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]).forEach((quarter) => {
    const key = `${year}-${quarter}`
    ensureMultiplier(key)
    newMults[key] = quarterMultipliers.value[key] ?? defaultMultiplier()
  })
  persistToDb(() => db.upsertMultipliers(newMults))
  return { ok: true, message: `已新增 ${year} 年 Q1-Q4 倍率設定。` }
}

// ---------- records ----------

export function normalizeRecord(record: Partial<BonusRecord>): BonusRecord | null {
  if (!record || !record.quoteUrl) return null
  return {
    id: record.id || canonicalUrl(record.quoteUrl),
    quoteUrl: String(record.quoteUrl || '').trim(),
    orderNo: String(record.orderNo || ''),
    customerName: String(record.customerName || ''),
    customerType: ['company', 'personal', 'unknown'].includes(String(record.customerType))
      ? record.customerType || 'unknown'
      : 'unknown',
    taxExcludedAmount: toNumber(record.taxExcludedAmount),
    taxIncludedAmount: toNumber(record.taxIncludedAmount),
    signedMonth: String(record.signedMonth || '').slice(0, 7),
    paidMonth: String(record.paidMonth || currentMonth()).slice(0, 7),
    baseCommissionRate: toNumber(record.baseCommissionRate || 4),
    amountInferred: Boolean(record.amountInferred),
    amountDebug: record.amountDebug || {},
    signedAtText: String(record.signedAtText || ''),
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
}

export function upsertRecord(record: BonusRecord) {
  const normalized = normalizeRecord(record)
  if (!normalized) return
  const qKey = getFiscalQuarter(normalized.signedMonth).key
  const isNewKey = ensureMultiplier(qKey)
  const index = records.value.findIndex(
    (item) => canonicalUrl(item.quoteUrl) === canonicalUrl(normalized.quoteUrl),
  )
  if (index >= 0) records.value[index] = { ...records.value[index], ...normalized }
  else records.value.push(normalized)
  persistToDb(() => db.upsertRecord(normalized))
  if (qKey && isNewKey)
    persistToDb(() => db.upsertMultiplier(qKey, quarterMultipliers.value[qKey] ?? defaultMultiplier()))
}

export function updateRecord(
  record: BonusRecord,
  field: keyof BonusRecord,
  value: string | number,
) {
  if (['taxIncludedAmount', 'taxExcludedAmount', 'baseCommissionRate'].includes(field)) {
    ;(record[field] as number) = Math.max(0, toNumber(value))
  } else {
    ;(record[field] as string) = String(value)
  }
  if (field === 'signedMonth') {
    const qKey = getFiscalQuarter(record.signedMonth).key
    const isNewKey = ensureMultiplier(qKey)
    if (qKey && isNewKey)
      persistToDb(() =>
        db.upsertMultiplier(qKey, quarterMultipliers.value[qKey] ?? defaultMultiplier()),
      )
  }
  record.updatedAt = new Date().toISOString()
  persistToDb(() => db.upsertRecord(record))
}

export function removeRecord(id: string) {
  records.value = records.value.filter((record) => record.id !== id)
  persistToDb(() => db.deleteRecord(id))
}

export function clearAll() {
  records.value = []
  quarterMultipliers.value = {}
  persistToDb(() => db.clearAllRecords())
  persistToDb(() => db.clearAllMultipliers())
}
