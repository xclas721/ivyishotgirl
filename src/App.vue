<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

type CustomerType = 'company' | 'personal' | 'unknown'
type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

interface QuarterInfo {
  year: number
  quarter: Quarter | ''
  key: string
  range: string
  order: number
}

interface QuarterMultiplier {
  rocket: number
  repurchase: number
  avgOrder: number
  yieldRate: number
}

interface BonusRecord {
  id: string
  quoteUrl: string
  orderNo: string
  customerName: string
  customerType: CustomerType
  taxExcludedAmount: number
  taxIncludedAmount: number
  signedMonth: string
  paidMonth: string
  baseCommissionRate: number
  amountInferred: boolean
  amountDebug: Record<string, unknown>
  signatureDebug: Record<string, unknown>
  signedAtText: string
  parsedSignedMonth: string
  parsedSignedQuarterKey: string
  updatedAt: string
}

interface QuoteResponse {
  quoteUrl?: string
  orderNo?: string
  customerName?: string
  customerType?: CustomerType
  taxExcludedAmount?: number
  taxIncludedAmount?: number
  defaultCommissionRate?: number
  amountInferred?: boolean
  amountDebug?: Record<string, unknown>
  signatureDebug?: Record<string, unknown>
  signedAtText?: string
  signedMonth?: string
  signedQuarterKey?: string
}

interface QuarterSummary extends QuarterInfo {
  count: number
  final: number
  base: number
  taxExcludedAmount: number
}

const recordsKey = 'saiens-bonus-records-node-proxy-v2'
const multipliersKey = 'saiens-bonus-quarter-multipliers-v1'
const multiplierFields: (keyof QuarterMultiplier)[] = [
  'rocket',
  'repurchase',
  'avgOrder',
  'yieldRate',
]
const multiplierFieldLabels: Record<keyof QuarterMultiplier, string> = {
  rocket: '業績火箭倍率',
  repurchase: '回購倍率',
  avgOrder: '客單價倍率',
  yieldRate: '成材率倍率',
}
const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })

const quoteUrl = ref('')
const signedMonth = ref('')
const paidMonth = ref(currentMonth())
const status = reactive({ message: '', tone: '' })
const isFetching = ref(false)
const apiOk = ref(false)
const importFile = ref<HTMLInputElement | null>(null)
const records = ref<BonusRecord[]>(loadRecords())
const quarterMultipliers = ref<Record<string, QuarterMultiplier>>(loadMultipliers())

const isFileMode = computed(() => window.location.protocol === 'file:')
const multiplierYears = computed(() => {
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
const summary = computed(() => summarize())

onMounted(() => {
  if (isFileMode.value) {
    showStatus('請先用 http://localhost:3000 開啟後再抓取報價單。', '')
    return
  }
  void checkApiHealth()
})

async function checkApiHealth() {
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) {
      throw new Error(data?.detail || data?.message || `HTTP ${response.status}`)
    }
    apiOk.value = true
    console.log('API OK')
  } catch (error) {
    console.error(error)
    showStatus(`API 連線失敗：${networkDiagnostic(error)}`, 'error')
  }
}

async function fetchQuote() {
  if (isFileMode.value) {
    showStatus('請先用 http://localhost:3000 開啟後再抓取報價單。', '')
    return
  }

  const inputUrl = quoteUrl.value.trim()
  if (!inputUrl) return showStatus('請先輸入報價單網址。', 'error')
  if (!paidMonth.value) return showStatus('請選擇收款月份。', 'error')

  try {
    const url = new URL(inputUrl)
    if (url.hostname !== 'quote.saiens.tw')
      return showStatus('只能抓取 quote.saiens.tw 的報價單網址。', 'error')
  } catch {
    return showStatus('報價單網址格式不正確。', 'error')
  }

  isFetching.value = true
  showStatus('正在抓取報價單...')

  try {
    const response = await fetch('/api/fetch-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: inputUrl }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) {
      const detail = data?.detail || data?.message || `HTTP ${response.status}`
      const type = data?.errorType ? `（${data.errorType}）` : ''
      throw new Error(`${detail}${type}`)
    }

    const quote = data.quote as QuoteResponse
    const finalSignedMonth = signedMonth.value || quote.signedMonth || ''
    upsertRecord({
      id: canonicalUrl(quote.quoteUrl || inputUrl),
      quoteUrl: quote.quoteUrl || inputUrl,
      orderNo: quote.orderNo || '',
      customerName: quote.customerName || '',
      customerType: quote.customerType || 'unknown',
      taxExcludedAmount: Number(quote.taxExcludedAmount || 0),
      taxIncludedAmount: Number(quote.taxIncludedAmount || 0),
      signedMonth: finalSignedMonth,
      paidMonth: paidMonth.value,
      baseCommissionRate: Number(quote.defaultCommissionRate || 4),
      amountInferred: Boolean(quote.amountInferred),
      amountDebug: quote.amountDebug || {},
      signatureDebug: quote.signatureDebug || {},
      signedAtText: quote.signedAtText || '',
      parsedSignedMonth: quote.signedMonth || '',
      parsedSignedQuarterKey: quote.signedQuarterKey || '',
      updatedAt: new Date().toISOString(),
    })

    quoteUrl.value = ''
    signedMonth.value = ''
    const warnings = []
    if (!finalSignedMonth) warnings.push('未抓到回簽月份，請手動選擇')
    if (quote.customerType === 'unknown') warnings.push('客戶類型無法判斷，請確認獎金%')
    if (quote.amountInferred) warnings.push('金額為系統反推，請確認')
    showStatus(
      warnings.length ? `已新增，但${warnings.join('、')}。` : '已新增或更新報價單。',
      warnings.length ? 'error' : 'ok',
    )
  } catch (error) {
    showStatus(`抓取失敗：${friendlyFetchError(error)}`, 'error')
  } finally {
    isFetching.value = false
  }
}

function upsertRecord(record: BonusRecord) {
  const normalized = normalizeRecord(record)
  if (!normalized) return
  ensureMultiplier(getFiscalQuarter(normalized.signedMonth).key)
  const index = records.value.findIndex(
    (item) => canonicalUrl(item.quoteUrl) === canonicalUrl(normalized.quoteUrl),
  )
  if (index >= 0) records.value[index] = { ...records.value[index], ...normalized }
  else records.value.push(normalized)
  saveRecords()
  saveMultipliers()
}

function normalizeRecord(record: Partial<BonusRecord>): BonusRecord | null {
  if (!record || !record.quoteUrl) return null
  const taxExcludedAmount = toNumber(record.taxExcludedAmount)
  const taxIncludedAmount = toNumber(record.taxIncludedAmount)
  return {
    id: record.id || canonicalUrl(record.quoteUrl),
    quoteUrl: String(record.quoteUrl || '').trim(),
    orderNo: String(record.orderNo || ''),
    customerName: String(record.customerName || ''),
    customerType: ['company', 'personal', 'unknown'].includes(String(record.customerType))
      ? record.customerType || 'unknown'
      : 'unknown',
    taxExcludedAmount: taxExcludedAmount || Math.round(taxIncludedAmount / 1.05),
    taxIncludedAmount: taxIncludedAmount || Math.round(taxExcludedAmount * 1.05),
    signedMonth: String(record.signedMonth || record.parsedSignedMonth || '').slice(0, 7),
    paidMonth: String(record.paidMonth || currentMonth()).slice(0, 7),
    baseCommissionRate: toNumber(record.baseCommissionRate || 4),
    amountInferred: Boolean(record.amountInferred),
    amountDebug: record.amountDebug || {},
    signatureDebug: record.signatureDebug || {},
    signedAtText: String(record.signedAtText || ''),
    parsedSignedMonth: String(record.parsedSignedMonth || record.signedMonth || '').slice(0, 7),
    parsedSignedQuarterKey: String(record.parsedSignedQuarterKey || ''),
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
}

function ensureMultiplier(key: string) {
  if (!key) return
  quarterMultipliers.value[key] = normalizeMultiplier(quarterMultipliers.value[key])
}

function multiplierFor(key: string): QuarterMultiplier {
  if (!key) return defaultMultiplier()
  ensureMultiplier(key)
  return quarterMultipliers.value[key] || defaultMultiplier()
}

function updateMultiplier(key: string, field: keyof QuarterMultiplier, value: string | number) {
  ensureMultiplier(key)
  const multiplier = quarterMultipliers.value[key] || defaultMultiplier()
  multiplier[field] = Math.max(0, toNumber(value))
  quarterMultipliers.value[key] = multiplier
  saveMultipliers()
}

function addMultiplierYear() {
  const year = prompt('請輸入要新增設定的年份，例如 2026：', String(new Date().getFullYear()))
  if (!/^\d{4}$/.test(String(year || ''))) return showStatus('年份格式需為 YYYY。', 'error')
  ;(['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]).forEach((quarter) =>
    ensureMultiplier(`${year}-${quarter}`),
  )
  saveMultipliers()
  showStatus(`已新增 ${year} 年 Q1-Q4 倍率設定。`, 'ok')
}

function updateRecord(record: BonusRecord, field: keyof BonusRecord, value: string | number) {
  if (['taxIncludedAmount', 'taxExcludedAmount', 'baseCommissionRate'].includes(field)) {
    ;(record[field] as number) = Math.max(0, toNumber(value))
  } else {
    ;(record[field] as string) = String(value)
  }
  if (field === 'signedMonth') ensureMultiplier(getFiscalQuarter(record.signedMonth).key)
  record.updatedAt = new Date().toISOString()
  saveRecords()
  saveMultipliers()
}

function deleteRecord(id: string) {
  if (!confirm('確定刪除這筆紀錄？')) return
  records.value = records.value.filter((record) => record.id !== id)
  saveRecords()
}

function clearRecords() {
  if (!confirm('確定清空全部紀錄與季度倍率設定？')) return
  records.value = []
  quarterMultipliers.value = {}
  saveRecords()
  saveMultipliers()
  showStatus('已清空紀錄。', 'ok')
}

function exportJson() {
  downloadFile(
    'saiens-bonus-records.json',
    JSON.stringify(
      { quotes: records.value, quarterMultipliers: quarterMultipliers.value },
      null,
      2,
    ),
    'application/json;charset=utf-8',
  )
}

async function importJson(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return

  try {
    const parsed = JSON.parse(await file.text())
    const importedRecords = Array.isArray(parsed) ? parsed : parsed.quotes || parsed.records
    if (!Array.isArray(importedRecords)) throw new Error('JSON 格式不正確。')
    importedRecords.forEach((record) => {
      const normalized = normalizeRecord(record)
      if (!normalized) return
      const index = records.value.findIndex(
        (item) => canonicalUrl(item.quoteUrl) === canonicalUrl(normalized.quoteUrl),
      )
      if (index >= 0) records.value[index] = { ...records.value[index], ...normalized }
      else records.value.push(normalized)
      ensureMultiplier(getFiscalQuarter(normalized.signedMonth).key)
    })
    if (parsed.quarterMultipliers && typeof parsed.quarterMultipliers === 'object') {
      quarterMultipliers.value = {
        ...quarterMultipliers.value,
        ...normalizeMultipliers(parsed.quarterMultipliers),
      }
    }
    saveRecords()
    saveMultipliers()
    showStatus('JSON 已匯入。', 'ok')
  } catch (error) {
    showStatus((error as Error).message || '匯入 JSON 失敗。', 'error')
  }
}

function exportCsv() {
  const headers = [
    '報價單網址',
    '案件編號',
    '客戶名稱',
    '客戶類型',
    '回簽月份',
    '收款月份',
    '回簽季度',
    '發放季度',
    '未連稅金額',
    '總計',
    '基礎獎金%',
    '套用倍率摘要',
    '最終獎金',
    'signedAtText',
    'amountDebug',
    'signatureDebug',
  ]
  const rows = records.value.map((record) => {
    const signedQuarter = getFiscalQuarter(record.signedMonth)
    const paidQuarter = getFiscalQuarter(record.paidMonth)
    const multiplier = signedQuarter.key ? multiplierFor(signedQuarter.key) : defaultMultiplier()
    return [
      record.quoteUrl,
      record.orderNo,
      record.customerName,
      customerTypeLabel(record.customerType),
      record.signedMonth,
      record.paidMonth,
      signedQuarter.key,
      paidQuarter.key,
      Math.round(record.taxExcludedAmount),
      Math.round(record.taxIncludedAmount),
      record.baseCommissionRate,
      multiplierSummary(signedQuarter.key, multiplier),
      finalCommissionFor(record),
      record.signedAtText,
      JSON.stringify(record.amountDebug || {}),
      JSON.stringify(record.signatureDebug || {}),
    ]
  })
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  downloadFile('saiens-bonus-records.csv', `\ufeff${csv}`, 'text/csv;charset=utf-8')
}

function summarize() {
  const signed = new Map<string, QuarterSummary>()
  const paid = new Map<string, QuarterSummary>()
  const totals = { final: 0, taxExcludedAmount: 0, taxIncludedAmount: 0 }

  records.value.forEach((record) => {
    const final = finalCommissionFor(record)
    const signedQuarter = getFiscalQuarter(record.signedMonth)
    const paidQuarter = getFiscalQuarter(record.paidMonth)
    totals.final += final
    totals.taxExcludedAmount += toNumber(record.taxExcludedAmount)
    totals.taxIncludedAmount += toNumber(record.taxIncludedAmount)

    if (signedQuarter.key) {
      ensureSummary(signed, signedQuarter)
      const item = signed.get(signedQuarter.key)
      if (item) {
        item.count += 1
        item.taxExcludedAmount += toNumber(record.taxExcludedAmount)
        item.base += baseCommissionFor(record)
        item.final += final
      }
    }

    if (paidQuarter.key) {
      ensureSummary(paid, paidQuarter)
      const item = paid.get(paidQuarter.key)
      if (item) {
        item.count += 1
        item.final += final
      }
    }
  })

  return {
    totals,
    signed: Array.from(signed.values()).sort((a, b) => b.order - a.order),
    paid: Array.from(paid.values()).sort((a, b) => b.order - a.order),
  }
}

function ensureSummary(map: Map<string, QuarterSummary>, quarter: QuarterInfo) {
  if (!map.has(quarter.key)) {
    map.set(quarter.key, { ...quarter, count: 0, final: 0, base: 0, taxExcludedAmount: 0 })
  }
}

function getFiscalQuarter(monthString: string): QuarterInfo {
  if (!/^\d{4}-\d{2}$/.test(String(monthString || '')))
    return { year: 0, quarter: '', key: '', range: '', order: 0 }
  const [yearText, monthText] = monthString.split('-')
  const rawYear = Number(yearText)
  const month = Number(monthText)
  let year = rawYear
  let quarter: Quarter
  if ([2, 3, 4].includes(month)) quarter = 'Q1'
  else if ([5, 6, 7].includes(month)) quarter = 'Q2'
  else if ([8, 9, 10].includes(month)) quarter = 'Q3'
  else {
    quarter = 'Q4'
    if (month === 1) year = rawYear - 1
  }
  return {
    year,
    quarter,
    key: `${year}-${quarter}`,
    range: quarterRange(year, quarter),
    order: year * 10 + Number(quarter.slice(1)),
  }
}

function quarterRange(year: number, quarter: Quarter) {
  return {
    Q1: `${year}/02-${year}/04`,
    Q2: `${year}/05-${year}/07`,
    Q3: `${year}/08-${year}/10`,
    Q4: `${year}/11-${year + 1}/01`,
  }[quarter]
}

function loadRecords() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(recordsKey) ||
        localStorage.getItem('saiens-bonus-records-node-proxy-v1') ||
        '[]',
    )
    return Array.isArray(parsed)
      ? parsed.map(normalizeRecord).filter((record): record is BonusRecord => Boolean(record))
      : []
  } catch {
    return []
  }
}

function loadMultipliers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(multipliersKey) || '{}')
    return parsed && typeof parsed === 'object' ? normalizeMultipliers(parsed) : {}
  } catch {
    return {}
  }
}

function saveRecords() {
  localStorage.setItem(recordsKey, JSON.stringify(records.value))
}

function saveMultipliers() {
  localStorage.setItem(multipliersKey, JSON.stringify(quarterMultipliers.value))
}

function defaultMultiplier(): QuarterMultiplier {
  return { rocket: 1, repurchase: 1, avgOrder: 1, yieldRate: 1 }
}

function normalizeMultiplier(value: Partial<QuarterMultiplier> = {}) {
  return {
    rocket: toNumber(value.rocket ?? 1) || 1,
    repurchase: toNumber(value.repurchase ?? 1) || 1,
    avgOrder: toNumber(value.avgOrder ?? 1) || 1,
    yieldRate: toNumber(value.yieldRate ?? 1) || 1,
  }
}

function normalizeMultipliers(source: Record<string, Partial<QuarterMultiplier>>) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, normalizeMultiplier(value)]),
  )
}

function baseCommissionFor(record: BonusRecord) {
  return (toNumber(record.taxExcludedAmount) * toNumber(record.baseCommissionRate)) / 100
}

function finalCommissionFor(record: BonusRecord) {
  const signedQuarter = getFiscalQuarter(record.signedMonth).key
  const multiplier = signedQuarter ? multiplierFor(signedQuarter) : defaultMultiplier()
  return Math.round(
    baseCommissionFor(record) *
      toNumber(multiplier.rocket || 1) *
      toNumber(multiplier.repurchase || 1) *
      toNumber(multiplier.avgOrder || 1) *
      toNumber(multiplier.yieldRate || 1),
  )
}

function recordWarnings(record: BonusRecord) {
  const warnings = []
  if (!record.signedMonth) warnings.push('未抓到回簽月份，請手動選擇')
  if (record.customerType === 'unknown') warnings.push('請確認獎金%')
  if (record.amountInferred) warnings.push('金額為系統反推，請確認')
  return warnings.join('；')
}

function amountDebugText(debug: Record<string, unknown> = {}) {
  const parts = []
  if (debug.taxExcludedLabel)
    parts.push(`未連稅: ${debug.taxExcludedLabel} ${debug.taxExcludedRaw || ''}`.trim())
  if (debug.taxIncludedLabel)
    parts.push(`總計: ${debug.taxIncludedLabel} ${debug.taxIncludedRaw || ''}`.trim())
  return parts.join('；')
}

function canonicalUrl(value: unknown) {
  return String(value || '').trim()
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function toNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function customerTypeLabel(type: CustomerType) {
  return type === 'company' ? '公司 / 設計師' : type === 'personal' ? '個人業主' : '未知'
}

function showStatus(message: string, tone = '') {
  status.message = message
  status.tone = tone
}

function friendlyFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/Load failed|Failed to fetch|NetworkError/i.test(message)) {
    return '無法連到本機 API。請確認後端已啟動，並從 http://localhost:3000 開啟頁面。'
  }
  if (/HTTP 404/.test(message))
    return 'API 404，請確認 server.js 有 POST /api/fetch-quote 並已重新啟動。'
  if (/403/.test(message)) return 'quote 網站回 403，可能 access_token 無效、權限不足或需要登入。'
  return message
}

function networkDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (location.protocol === 'file:') {
    return `Network Error：目前是從 file:// 開啟，請改用 http://localhost:3000。原始錯誤：${message}`
  }
  if (/Load failed|Failed to fetch|NetworkError/i.test(message)) {
    return `Network Error / ECONNREFUSED：可能後端沒有啟動或 localhost:3000 無法連線。原始錯誤：${message}`
  }
  if (/HTTP 404/.test(message)) return '404：找不到 /api/health，請確認 server.js 已重新啟動。'
  if (/HTTP 500/.test(message)) return '500：後端發生錯誤，請查看 npm start 的 console。'
  return message
}

function formatNumber(value: number) {
  return Number(value || 0)
    .toFixed(2)
    .replace(/\.00$/, '')
}

function formatMultiplier(multiplier: QuarterMultiplier) {
  return `火箭 ${formatNumber(multiplier.rocket)} x 回購 ${formatNumber(multiplier.repurchase)} x 客單 ${formatNumber(multiplier.avgOrder)} x 成材 ${formatNumber(multiplier.yieldRate)}`
}

function multiplierSummary(key: string, multiplier: QuarterMultiplier) {
  return `${key || '未選回簽季度'}：${formatMultiplier(multiplier)}`
}

function isDefaultMultiplier(multiplier: QuarterMultiplier) {
  return (
    multiplier.rocket === 1 &&
    multiplier.repurchase === 1 &&
    multiplier.avgOrder === 1 &&
    multiplier.yieldRate === 1
  )
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <main class="app-shell">
    <header class="page-head">
      <div>
        <h1>季度獎金帳本</h1>
        <p>
          回簽月份決定獎金%與倍率，收款月份決定實際發放季度。金額以報價單「未連稅金額」與「總計」為準。
        </p>
      </div>
      <span class="badge" :class="{ ok: apiOk }">{{ apiOk ? 'API ready' : 'Vue + Express' }}</span>
    </header>

    <section class="panel">
      <h2>新增報價單</h2>
      <div v-if="isFileMode" class="server-notice">
        <strong>此工具需要透過本機伺服器啟動，請不要直接點 HTML 檔。</strong>
        <pre>
npm install
npm start
打開 http://localhost:3000</pre
        >
      </div>
      <div class="add-grid">
        <label>
          報價單網址
          <input
            v-model="quoteUrl"
            type="url"
            placeholder="貼上 quote.saiens.tw/my/orders/... 網址"
          />
        </label>
        <label>
          回簽月份
          <input v-model="signedMonth" type="month" />
        </label>
        <label>
          收款月份
          <input v-model="paidMonth" type="month" />
        </label>
        <button type="button" :disabled="isFetching || isFileMode" @click="fetchQuote">
          {{ isFetching ? '抓取中...' : '抓取報價單' }}
        </button>
      </div>
      <p class="status" :class="status.tone">{{ status.message }}</p>
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>總覽</h2>
        <div class="tool-row">
          <button class="secondary" type="button" @click="exportJson">匯出 JSON</button>
          <button class="secondary" type="button" @click="importFile?.click()">匯入 JSON</button>
          <button class="secondary" type="button" @click="exportCsv">匯出 CSV</button>
          <button class="danger" type="button" @click="clearRecords">清空紀錄</button>
          <input
            ref="importFile"
            class="hidden"
            type="file"
            accept="application/json,.json"
            @change="importJson"
          />
        </div>
      </div>
      <div class="totals">
        <div class="total primary">
          <span>發放總獎金</span>
          <strong>{{ money.format(summary.totals.final) }}</strong>
        </div>
        <div class="total">
          <span>簽約未連稅金額</span>
          <strong>{{ money.format(summary.totals.taxExcludedAmount) }}</strong>
        </div>
        <div class="total">
          <span>總計</span>
          <strong>{{ money.format(summary.totals.taxIncludedAmount) }}</strong>
        </div>
        <div class="total">
          <span>紀錄筆數</span>
          <strong>{{ integer.format(records.length) }}</strong>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>季度倍率設定</h2>
        <button class="secondary" type="button" @click="addMultiplierYear">新增年份</button>
      </div>
      <div v-if="multiplierYears.length === 0" class="empty">
        尚無年份設定。新增報價單後會依回簽季度自動出現，也可按「新增年份」。
      </div>
      <div v-for="year in multiplierYears" v-else :key="year" class="year-block">
        <h3>{{ year }}</h3>
        <div
          v-for="quarter in ['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]"
          :key="`${year}-${quarter}`"
          class="quarter-setting"
        >
          <strong>{{ `${year}-${quarter}` }}</strong>
          <div class="multiplier-grid">
            <label v-for="field in multiplierFields" :key="field">
              {{ multiplierFieldLabels[field] }}
              <input
                :value="multiplierFor(`${year}-${quarter}`)[field]"
                type="number"
                min="0"
                step="0.01"
                @input="
                  updateMultiplier(
                    `${year}-${quarter}`,
                    field,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>
        </div>
      </div>
      <p class="hint">
        同一回簽季度的案件共用同一組倍率；倍率存在 quarterMultipliers，不存在每筆案件裡。
      </p>
    </section>

    <section class="panel">
      <h2>A. 回簽季度試算統計</h2>
      <div v-if="summary.signed.length === 0" class="empty">尚無回簽季度資料</div>
      <div v-else class="quarter-grid">
        <article v-for="item in summary.signed" :key="item.key" class="quarter-card">
          <header>
            <div>
              <h3>{{ item.key }}</h3>
              <p>{{ item.range }}，{{ item.count }} 筆回簽</p>
            </div>
            <strong>{{ money.format(item.final) }}</strong>
          </header>
          <div class="quarter-lines">
            <div>
              <span>簽約總未連稅金額</span><b>{{ money.format(item.taxExcludedAmount) }}</b>
            </div>
            <div>
              <span>基礎獎金小計</span><b>{{ money.format(item.base) }}</b>
            </div>
            <div>
              <span>倍率</span><b>{{ formatMultiplier(multiplierFor(item.key)) }}</b>
            </div>
            <div>
              <span>應計獎金試算</span><b>{{ money.format(item.final) }}</b>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <h2>B. 發放季度實領統計</h2>
      <div v-if="summary.paid.length === 0" class="empty">尚無發放季度資料</div>
      <div v-else class="quarter-grid">
        <article v-for="item in summary.paid" :key="item.key" class="quarter-card">
          <header>
            <div>
              <h3>{{ item.key }}</h3>
              <p>{{ item.range }}，{{ item.count }} 筆收款</p>
            </div>
            <strong>{{ money.format(item.final) }}</strong>
          </header>
          <div class="quarter-lines">
            <div>
              <span>實際領取獎金總額</span><b>{{ money.format(item.final) }}</b>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <h2>報價單紀錄</h2>
      <div v-if="records.length === 0" class="empty">
        尚無報價單紀錄。輸入網址、回簽月份與收款月份後，按「抓取報價單」新增。
      </div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>報價單網址</th>
              <th>案件編號</th>
              <th>客戶名稱</th>
              <th>客戶類型</th>
              <th>回簽月份</th>
              <th>收款月份</th>
              <th>回簽季度</th>
              <th>發放季度</th>
              <th>未連稅金額</th>
              <th>總計</th>
              <th>基礎獎金%</th>
              <th>套用倍率摘要</th>
              <th>最終獎金</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in [...records].sort((a, b) =>
                (b.paidMonth || '').localeCompare(a.paidMonth || ''),
              )"
              :key="record.id"
            >
              <td class="url-cell">
                <a :href="record.quoteUrl" target="_blank" rel="noreferrer">{{
                  record.quoteUrl
                }}</a>
              </td>
              <td>{{ record.orderNo || '-' }}</td>
              <td>
                {{ record.customerName || '-' }}
                <div v-if="amountDebugText(record.amountDebug)" class="hint">
                  {{ amountDebugText(record.amountDebug) }}
                </div>
              </td>
              <td>
                <span class="type-pill" :class="{ unknown: record.customerType === 'unknown' }">{{
                  customerTypeLabel(record.customerType)
                }}</span>
                <div v-if="recordWarnings(record)" class="status error">
                  {{ recordWarnings(record) }}
                </div>
              </td>
              <td>
                <input
                  :value="record.signedMonth"
                  type="month"
                  @input="
                    updateRecord(record, 'signedMonth', ($event.target as HTMLInputElement).value)
                  "
                />
              </td>
              <td>
                <input
                  :value="record.paidMonth"
                  type="month"
                  @input="
                    updateRecord(record, 'paidMonth', ($event.target as HTMLInputElement).value)
                  "
                />
              </td>
              <td>{{ getFiscalQuarter(record.signedMonth).key || '-' }}</td>
              <td>{{ getFiscalQuarter(record.paidMonth).key || '-' }}</td>
              <td class="money">
                <input
                  :value="record.taxExcludedAmount"
                  type="number"
                  min="0"
                  step="1"
                  @input="
                    updateRecord(
                      record,
                      'taxExcludedAmount',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </td>
              <td class="money">
                <input
                  :value="record.taxIncludedAmount"
                  type="number"
                  min="0"
                  step="1"
                  @input="
                    updateRecord(
                      record,
                      'taxIncludedAmount',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </td>
              <td class="rate">
                <input
                  :value="record.baseCommissionRate"
                  type="number"
                  min="0"
                  step="0.1"
                  @input="
                    updateRecord(
                      record,
                      'baseCommissionRate',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </td>
              <td>
                {{
                  multiplierSummary(
                    getFiscalQuarter(record.signedMonth).key,
                    multiplierFor(getFiscalQuarter(record.signedMonth).key),
                  )
                }}
                <div
                  v-if="
                    getFiscalQuarter(record.signedMonth).key &&
                    isDefaultMultiplier(multiplierFor(getFiscalQuarter(record.signedMonth).key))
                  "
                  class="status error"
                >
                  尚未設定該季度倍率，暫以 1 計算
                </div>
              </td>
              <td class="bonus">{{ money.format(finalCommissionFor(record)) }}</td>
              <td class="actions-cell">
                <button class="danger" type="button" @click="deleteRecord(record.id)">刪除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="notice">1 月會歸到前一年度 Q4。若同一網址重複新增，會更新原本那筆資料。</div>
    </section>
  </main>
</template>
