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

// Year/quarter filter, shared across pages. 'all' shows everything; otherwise
// only the data whose 回簽 (signed) fiscal year/quarter matches. Defaults to the
// current fiscal quarter so the view opens on 本季度.
const currentFiscal = getFiscalQuarter(new Date().toISOString().slice(0, 7))
export const selectedYear = ref<number | 'all'>(currentFiscal.year || 'all')
export const selectedQuarter = ref<Quarter | 'all'>(currentFiscal.quarter || 'all')

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

// The four multipliers collapsed into a single factor (rocket × repurchase × …),
// used for a compact table display.
export function combinedMultiplier(multiplier: QuarterMultiplier) {
  return (
    (multiplier.rocket || 1) *
    (multiplier.repurchase || 1) *
    (multiplier.avgOrder || 1) *
    (multiplier.yieldRate || 1)
  )
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

function recordMatchesFilter(
  monthString: string,
  year: number | 'all',
  quarter: Quarter | 'all',
): boolean {
  const q = getFiscalQuarter(monthString)
  if (year !== 'all' && q.year !== year) return false
  if (quarter !== 'all' && q.quarter !== quarter) return false
  return true
}

// Records limited to the selected 回簽 year and quarter (or all of them).
export const visibleRecords = computed(() =>
  records.value.filter((r) =>
    recordMatchesFilter(r.signedMonth, selectedYear.value, selectedQuarter.value),
  ),
)

// Same filter dimensions applied to 收款月份 — used for context-bar 實領 KPI.
export const paidVisibleRecords = computed(() =>
  records.value.filter((r) =>
    recordMatchesFilter(r.paidMonth, selectedYear.value, selectedQuarter.value),
  ),
)

const QUARTER_REP_MONTH: Record<Quarter, string> = {
  Q1: '02',
  Q2: '05',
  Q3: '08',
  Q4: '11',
}

export const filterContextLabel = computed(() => {
  if (selectedYear.value === 'all' && selectedQuarter.value === 'all') return '全部季度'
  if (typeof selectedYear.value === 'number' && selectedQuarter.value !== 'all') {
    const info = getFiscalQuarter(
      `${selectedYear.value}-${QUARTER_REP_MONTH[selectedQuarter.value]}`,
    )
    return `${info.key} · ${info.range}`
  }
  const yearPart = selectedYear.value === 'all' ? '全部年度' : String(selectedYear.value)
  const quarterPart = selectedQuarter.value === 'all' ? '全部季度' : selectedQuarter.value
  return `${yearPart} · ${quarterPart}`
})

// Years offered in the filter — data years plus the current default, so the
// 預設本季度 year always appears even before any data exists for it.
export const filterYears = computed(() => {
  const years = new Set(multiplierYears.value)
  if (typeof selectedYear.value === 'number') years.add(selectedYear.value)
  return Array.from(years).sort((a, b) => b - a)
})

// Year blocks to render on the multipliers page given the year filter.
export const displayedYears = computed(() => {
  if (selectedYear.value === 'all') return multiplierYears.value
  if (multiplierYears.value.includes(selectedYear.value)) {
    return multiplierYears.value.filter((y) => y === selectedYear.value)
  }
  // Keep the selected year visible even before any records exist for it.
  return [selectedYear.value]
})

// Quarters to render on the multipliers page given the quarter filter.
const ALL_QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4']
export const displayedQuarters = computed(() =>
  selectedQuarter.value === 'all' ? ALL_QUARTERS : [selectedQuarter.value],
)

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
    persistToDb(() =>
      db.upsertMultiplier(qKey, quarterMultipliers.value[qKey] ?? defaultMultiplier()),
    )
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
