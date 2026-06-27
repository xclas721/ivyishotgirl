<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { getFiscalQuarter, multipliersApply, MULTIPLIER_START_KEY } from '@/shared/fiscalQuarter'
import type { Quarter } from '@/shared/fiscalQuarter'
import type { CustomerType } from '@/lib/db'
import {
  CUSTOMER_TYPE_OPTIONS,
  commissionRateFor,
  customerTypeLabel,
  defaultCustomerType,
} from '@/shared/customerType'
import type { BonusRecord } from '@/lib/db'
import DbStatusBanner from '@/components/layout/DbStatusBanner.vue'
import LedgerTabs from '@/components/ledger/LedgerTabs.vue'
import type { LedgerTabId } from '@/components/ledger/LedgerTabs.vue'
import RecordsTable from '@/components/ledger/RecordsTable.vue'
import {
  records,
  visibleRecords,
  selectedYear,
  selectedQuarter,
  isLoading,
  isFileMode,
  ensureLoaded,
  upsertRecord,
  removeRecord,
  applyFilterForSignedMonth,
  multiplierFor,
  formatNumber,
  formatMultiplier,
  multiplierSummary,
  combinedMultiplier,
  canonicalUrl,
  currentMonth,
} from '@/composables/ledger'
import { finalCommissionDisplay, ledgerSummary } from '@/composables/ledgerSummary'

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })

interface QuoteDraftRow {
  url: string
  paidMonth: string
  customerType: CustomerType
}

function newQuoteDraftRow(): QuoteDraftRow {
  return { url: '', paidMonth: currentMonth(), customerType: defaultCustomerType() }
}

const visibleSections = ref<LedgerTabId[]>(['overview', 'records'])
const quoteDrafts = ref<QuoteDraftRow[]>([newQuoteDraftRow()])
const status = reactive({ message: '', tone: '' })
const isFetching = ref(false)
const isSyncingAll = ref(false)
const apiOk = ref(false)
const syncingIds = ref<Set<string>>(new Set())
const highlightedRecordId = ref('')

const summary = ledgerSummary

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
  signedAtText?: string
  signedMonth?: string
  signedQuarterKey?: string
}

onMounted(async () => {
  if (isFileMode) {
    showStatus('請先用 http://localhost:3000 開啟後再抓取報價單。', '')
    void ensureLoaded()
    return
  }
  try {
    await ensureLoaded()
  } catch {
    showStatus('資料庫讀取失敗。', 'error')
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
    // Surface this quietly: the real error is shown when the user actually
    // tries to fetch a quote. Avoid a red banner on page load.
    apiOk.value = false
    console.error('[api] health check failed:', networkDiagnostic(error))
  }
}

async function fetchQuotes() {
  if (isFileMode) {
    showStatus('請先用 http://localhost:3000 開啟後再抓取報價單。', '')
    return
  }

  const entries = quoteDrafts.value
    .map((row) => ({
      url: row.url.trim(),
      paidMonth: row.paidMonth,
      customerType: row.customerType,
    }))
    .filter((row) => row.url)
  if (entries.length === 0) return showStatus('請先輸入報價單網址。', 'error')
  if (entries.some((entry) => !isValidQuoteUrl(entry.url))) {
    return showStatus('每筆網址都需為 quote.saiens.tw 的有效連結。', 'error')
  }
  if (entries.some((entry) => !entry.paidMonth)) {
    return showStatus('每筆都需選擇收款月份。', 'error')
  }

  isFetching.value = true
  let ok = 0
  let fail = 0
  let lastRecordId = ''
  let lastSignedMonth = ''

  for (const [i, entry] of entries.entries()) {
    const label = entries.length > 1 ? ` ${i + 1}/${entries.length}` : ''
    showStatus(`正在抓取報價單${label}...`)

    try {
      const quote = await requestQuote(entry.url)
      const recordId = canonicalUrl(quote.quoteUrl || entry.url)
      const finalSignedMonth = quote.signedMonth || ''
      upsertRecord(
        applyQuoteToRecord(quote, {
          id: recordId,
          quoteUrl: quote.quoteUrl || entry.url,
          signedMonth: finalSignedMonth,
          paidMonth: entry.paidMonth,
          customerType: entry.customerType,
        }),
      )
      ok += 1
      lastRecordId = recordId
      lastSignedMonth = finalSignedMonth
    } catch (error) {
      fail += 1
      console.error('[fetch-quotes]', entry.url, error)
    }
  }

  isFetching.value = false
  quoteDrafts.value = [newQuoteDraftRow()]

  if (ok === 0) {
    showStatus(`${fail} 筆抓取失敗。`, 'error')
    return
  }

  if (fail === 0) {
    showStatus(ok === 1 ? '已新增報價單。' : `已新增 ${ok} 筆報價單。`, 'ok')
  } else {
    showStatus(`新增完成：${ok} 筆成功、${fail} 筆失敗。`, 'error')
  }

  if (lastRecordId) await revealRecord(lastRecordId, lastSignedMonth)
}

function isValidQuoteUrl(inputUrl: string) {
  try {
    return new URL(inputUrl).hostname === 'quote.saiens.tw'
  } catch {
    return false
  }
}

function addQuoteDraftRow() {
  quoteDrafts.value.push(newQuoteDraftRow())
}

function removeQuoteDraftRow(index: number) {
  if (quoteDrafts.value.length <= 1) {
    quoteDrafts.value[0] = newQuoteDraftRow()
    return
  }
  quoteDrafts.value.splice(index, 1)
}

function fetchButtonLabel() {
  const count = quoteDrafts.value.filter((row) => row.url.trim()).length
  if (isFetching.value) return '抓取中...'
  if (count > 1) return `抓取 ${count} 筆`
  return '抓取報價單'
}

async function revealRecord(recordId: string, signedMonth: string) {
  applyFilterForSignedMonth(signedMonth)
  ensureSectionVisible('records')
  highlightedRecordId.value = recordId
  await nextTick()
  document.getElementById(`record-row-${recordId}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  })
  window.setTimeout(() => {
    if (highlightedRecordId.value === recordId) highlightedRecordId.value = ''
  }, 4000)
}

function isSectionVisible(id: LedgerTabId) {
  return visibleSections.value.includes(id)
}

function ensureSectionVisible(id: LedgerTabId) {
  if (!visibleSections.value.includes(id)) {
    visibleSections.value = [...visibleSections.value, id]
  }
}

// Re-fetch quote data for one record, keeping user-set 回簽/收款月份.
async function syncRecordFromQuote(record: BonusRecord) {
  const inputUrl = record.quoteUrl?.trim()
  if (!inputUrl) throw new Error('此紀錄沒有可同步的網址。')
  const quote = await requestQuote(inputUrl)
  const finalSignedMonth = record.signedMonth || quote.signedMonth || ''
  upsertRecord(
    applyQuoteToRecord(
      quote,
      {
        id: record.id,
        quoteUrl: record.quoteUrl,
        signedMonth: finalSignedMonth,
        paidMonth: record.paidMonth,
        customerType: record.customerType,
      },
      { preserveCustomerFields: true },
    ),
  )
  return { quote, finalSignedMonth }
}

async function resyncRecord(record: BonusRecord) {
  if (isFileMode) {
    showStatus('請先用 http://localhost:3000 開啟後再同步。', '')
    return
  }

  setSyncing(record.id, true)
  showStatus(`正在同步 ${record.orderNo || record.quoteUrl}...`)

  try {
    const { quote, finalSignedMonth } = await syncRecordFromQuote(record)
    showStatus(...quoteResultMessage(quote, finalSignedMonth, '已重新同步'))
  } catch (error) {
    showStatus(`同步失敗：${friendlyFetchError(error)}`, 'error')
  } finally {
    setSyncing(record.id, false)
  }
}

async function resyncAllVisible() {
  if (isFileMode) {
    showStatus('請先用 http://localhost:3000 開啟後再同步。', '')
    return
  }

  const targets = visibleRecords.value.filter((record) => record.quoteUrl?.trim())
  if (targets.length === 0) return showStatus('目前沒有可同步的紀錄。', 'error')
  if (isSyncingAll.value) return

  isSyncingAll.value = true
  let ok = 0
  let fail = 0

  for (const [i, record] of targets.entries()) {
    showStatus(`正在同步 ${i + 1}/${targets.length}：${record.orderNo || record.quoteUrl}...`)
    setSyncing(record.id, true)
    try {
      await syncRecordFromQuote(record)
      ok += 1
    } catch (error) {
      fail += 1
      console.error('[sync-all]', record.id, error)
    } finally {
      setSyncing(record.id, false)
    }
  }

  isSyncingAll.value = false
  if (fail === 0) showStatus(`已同步 ${ok} 筆報價單。`, 'ok')
  else if (ok === 0) showStatus(`${fail} 筆同步失敗。`, 'error')
  else showStatus(`同步完成：${ok} 筆成功、${fail} 筆失敗。`, 'error')
}

async function requestQuote(inputUrl: string): Promise<QuoteResponse> {
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
  return data.quote as QuoteResponse
}

function applyQuoteToRecord(
  quote: QuoteResponse,
  base: {
    id: string
    quoteUrl: string
    signedMonth: string
    paidMonth: string
    customerType?: CustomerType
  },
  options?: { preserveCustomerFields?: boolean },
): BonusRecord {
  const preserveCustomer = options?.preserveCustomerFields ?? false
  const customerType = preserveCustomer
    ? base.customerType || 'unknown'
    : base.customerType || defaultCustomerType()

  return {
    id: base.id,
    quoteUrl: quote.quoteUrl || base.quoteUrl,
    orderNo: quote.orderNo || '',
    customerName: quote.customerName || '',
    customerType,
    taxExcludedAmount: Number(quote.taxExcludedAmount || 0),
    taxIncludedAmount: Number(quote.taxIncludedAmount || 0),
    signedMonth: base.signedMonth,
    paidMonth: base.paidMonth,
    amountInferred: Boolean(quote.amountInferred),
    amountDebug: quote.amountDebug || {},
    signedAtText: quote.signedAtText || '',
    updatedAt: new Date().toISOString(),
  }
}

function quoteResultMessage(
  quote: QuoteResponse,
  finalSignedMonth: string,
  verb: string,
): [string, string] {
  const warnings = []
  if (!finalSignedMonth) warnings.push('未抓到回簽月份，請手動選擇')
  if (quote.amountInferred) warnings.push('金額為系統反推，請確認')
  return warnings.length
    ? [`${verb}，但${warnings.join('、')}。`, 'error']
    : [`${verb}報價單。`, 'ok']
}

function setSyncing(id: string, on: boolean) {
  const next = new Set(syncingIds.value)
  if (on) next.add(id)
  else next.delete(id)
  syncingIds.value = next
}

function deleteRecord(id: string) {
  if (!confirm('確定刪除這筆紀錄？')) return
  removeRecord(id)
}

function exportCsv() {
  if (visibleRecords.value.length === 0) {
    showStatus('此篩選條件下無資料可匯出。', 'error')
    return
  }

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
    '簽約依據',
    '金額來源',
  ]
  const rows = [...visibleRecords.value]
    .sort((a, b) => (b.paidMonth || '').localeCompare(a.paidMonth || ''))
    .map((record) => {
    const signedQuarter = getFiscalQuarter(record.signedMonth)
    const paidQuarter = getFiscalQuarter(record.paidMonth)
    const multiplierText = multipliersApply(signedQuarter.key)
      ? multiplierSummary(signedQuarter.key, multiplierFor(signedQuarter.key))
      : '無倍率'
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
      commissionRateFor(record.customerType),
      multiplierText,
      finalCommissionDisplay(record),
      record.signedAtText,
      amountDebugText(record.amountDebug),
    ]
  })
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  downloadFile('saiens-bonus-records.csv', `﻿${csv}`, 'text/csv;charset=utf-8')
}

function amountDebugText(debug: Record<string, unknown> = {}) {
  const parts = []
  if (debug.taxExcludedLabel)
    parts.push(`未連稅: ${debug.taxExcludedLabel} ${debug.taxExcludedRaw || ''}`.trim())
  if (debug.taxIncludedLabel)
    parts.push(`總計: ${debug.taxIncludedLabel} ${debug.taxIncludedRaw || ''}`.trim())
  return parts.join('；')
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

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function isFilteredQuarter(key: string) {
  if (!key || (selectedYear.value === 'all' && selectedQuarter.value === 'all')) return false
  const match = /^(\d{4})-(Q[1-4])$/.exec(key)
  if (!match) return false
  const year = Number(match[1])
  const quarter = match[2] as Quarter
  const yearOk = selectedYear.value === 'all' || selectedYear.value === year
  const quarterOk = selectedQuarter.value === 'all' || selectedQuarter.value === quarter
  return yearOk && quarterOk
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
    <DbStatusBanner />

    <header class="page-head page-head--compact">
      <div>
        <h1>季度獎金帳本</h1>
        <p>
          回簽月份決定獎金%與倍率，收款月份決定實際發放季度。金額以報價單「未連稅金額」與「總計」為準。
        </p>
      </div>
      <span v-if="apiOk" class="badge ok">API 已連線</span>
    </header>

    <LedgerTabs v-model="visibleSections" />

    <section v-show="isSectionVisible('overview')" class="panel">
      <h2>新增報價單</h2>
      <div v-if="isFileMode" class="server-notice">
        <strong>此工具需要透過本機伺服器啟動，請不要直接點 HTML 檔。</strong>
        <pre>
npm install
npm start
打開 http://localhost:3000</pre>
      </div>
      <div class="add-url-list">
        <div v-for="(draft, index) in quoteDrafts" :key="index" class="add-url-row">
          <label class="add-url-field add-url-field--url">
            報價單網址
            <span v-if="quoteDrafts.length > 1" class="add-url-index">#{{ index + 1 }}</span>
            <input
              v-model="draft.url"
              type="url"
              placeholder="貼上 quote.saiens.tw/my/orders/... 網址"
              @keydown.enter.prevent="fetchQuotes"
            />
          </label>
          <label class="add-url-field add-url-field--type">
            客戶類型
            <select v-model="draft.customerType">
              <option
                v-for="option in CUSTOMER_TYPE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}（{{ option.rate }}%）
              </option>
            </select>
          </label>
          <label class="add-url-field add-url-field--paid">
            收款月份
            <input v-model="draft.paidMonth" type="month" />
          </label>
          <button
            v-if="quoteDrafts.length > 1"
            class="add-url-remove"
            type="button"
            title="移除此列"
            :disabled="isFetching"
            @click="removeQuoteDraftRow(index)"
          >
            <X :size="14" :stroke-width="2" />
          </button>
        </div>
        <div class="add-url-actions">
          <button
            class="secondary add-url-add"
            type="button"
            :disabled="isFetching || isFileMode || isLoading"
            @click="addQuoteDraftRow"
          >
            <Plus :size="14" :stroke-width="2" />
            再加一筆
          </button>
          <button
            type="button"
            :disabled="isFetching || isFileMode || isLoading"
            @click="fetchQuotes"
          >
            {{ fetchButtonLabel() }}
          </button>
        </div>
      </div>
      <p class="hint">回簽月份由報價單自動帶入；每列請選擇客戶類型與收款月份。</p>
      <p class="status" :class="status.tone">{{ status.message }}</p>
    </section>

    <section v-show="isSectionVisible('overview')" class="panel">
      <div class="section-head">
        <h2>篩選範圍總覽</h2>
        <div class="tool-row">
          <button class="secondary" type="button" @click="exportCsv">匯出 CSV</button>
        </div>
      </div>
      <div class="totals">
        <div class="total primary">
          <span>發放總獎金</span>
          <strong>{{ money.format(summary.totals.final) }}</strong>
          <small v-if="summary.totals.uncomputableCount > 0" class="total-note">
            未含 {{ summary.totals.uncomputableCount }} 筆無倍率季度（無法計算）
          </small>
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
          <strong>{{ integer.format(visibleRecords.length) }}</strong>
        </div>
      </div>
    </section>

    <section v-show="isSectionVisible('records')" class="panel">
      <div class="section-head">
        <h2>報價單紀錄</h2>
        <div v-if="visibleRecords.length > 0" class="tool-row">
          <button
            class="secondary"
            type="button"
            title="從報價單網址重新抓取最新資料（僅目前篩選範圍內的紀錄）"
            :disabled="isFileMode || isLoading || isSyncingAll"
            @click="resyncAllVisible"
          >
            {{ isSyncingAll ? '抓取中…' : `全部再同步（${visibleRecords.length}）` }}
          </button>
        </div>
      </div>
      <div v-if="visibleRecords.length === 0" class="empty">
        {{
          records.length === 0
            ? '尚無報價單紀錄。貼上報價單網址後，按「抓取報價單」新增。'
            : '此篩選條件下尚無報價單紀錄。可切換上方工作季度篩選，或選「全部」。'
        }}
      </div>
      <RecordsTable
        v-else
        :records="visibleRecords"
        :highlight-id="highlightedRecordId"
        :is-file-mode="isFileMode"
        :is-loading="isLoading"
        :is-syncing-all="isSyncingAll"
        :syncing-ids="syncingIds"
        @resync="resyncRecord"
        @delete="deleteRecord"
      />
      <div class="notice">
        <ul class="notice-list">
          <li>1 月會歸到前一年度 Q4。</li>
          <li>若同一網址重複新增，會更新原本那筆資料。</li>
          <li>
            倍率與最終獎金自 {{ MULTIPLIER_START_KEY }} 起適用，此前季度無法計算。
          </li>
        </ul>
      </div>
    </section>

    <section v-show="isSectionVisible('signed')" class="panel">
      <div class="quarter-section-head">
        <div>
          <p class="quarter-section-tag">依回簽月份</p>
          <h2>回簽季度試算</h2>
          <p class="quarter-section-desc">
            這一季<strong>簽了哪些案</strong>、業績與倍率加總後的<strong>應計獎金</strong>。獎金%與倍率都看回簽季度。
          </p>
        </div>
      </div>
      <div v-if="summary.signed.length === 0" class="empty">尚無回簽季度資料</div>
      <div v-else class="quarter-grid">
        <article
          v-for="item in summary.signed"
          :key="item.key"
          class="quarter-card quarter-card--signed"
          :class="{ 'is-filtered': isFilteredQuarter(item.key) }"
        >
          <div class="quarter-card-top">
            <span class="quarter-badge">{{ item.key }}</span>
            <span class="quarter-meta">{{ item.range }} · {{ item.count }} 筆回簽</span>
          </div>
          <div class="quarter-hero">
            <span class="quarter-hero-label">應計獎金</span>
            <strong
              class="quarter-hero-amount"
              :class="{ 'is-muted': !multipliersApply(item.key) }"
            >
              {{ multipliersApply(item.key) ? money.format(item.final) : '無法計算' }}
            </strong>
            <p v-if="!multipliersApply(item.key)" class="quarter-hero-note">
              倍率自 {{ MULTIPLIER_START_KEY }} 起適用
            </p>
          </div>
          <div v-if="multipliersApply(item.key)" class="quarter-breakdown">
            <div class="quarter-breakdown-row">
              <span>簽約未連稅合計</span>
              <b>{{ money.format(item.taxExcludedAmount) }}</b>
            </div>
            <div class="quarter-breakdown-row">
              <span>基礎獎金小計</span>
              <b>{{ money.format(item.base) }}</b>
            </div>
            <div class="quarter-breakdown-row">
              <span>季度倍率</span>
              <b
                class="quarter-mult"
                :title="formatMultiplier(multiplierFor(item.key))"
              >
                ×{{ formatNumber(combinedMultiplier(multiplierFor(item.key))) }}
              </b>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-show="isSectionVisible('paid')" class="panel">
      <div class="quarter-section-head">
        <div>
          <p class="quarter-section-tag">依收款月份</p>
          <h2>發放季度實領</h2>
          <p class="quarter-section-desc">
            這一季<strong>實際入帳</strong>會領到多少。金額仍依各案的回簽季度計算，只是按收款時間歸類。
          </p>
        </div>
      </div>
      <div v-if="summary.paid.length === 0" class="empty">尚無發放季度資料</div>
      <div v-else class="quarter-grid">
        <article
          v-for="item in summary.paid"
          :key="item.key"
          class="quarter-card quarter-card--paid"
          :class="{ 'is-filtered': isFilteredQuarter(item.key) }"
        >
          <div class="quarter-card-top">
            <span class="quarter-badge">{{ item.key }}</span>
            <span class="quarter-meta">{{ item.range }} · {{ item.count }} 筆收款</span>
          </div>
          <div class="quarter-hero">
            <span class="quarter-hero-label">實領獎金</span>
            <strong
              class="quarter-hero-amount"
              :class="{ 'is-muted': item.computableCount === 0 }"
            >
              {{ item.computableCount > 0 ? money.format(item.final) : '無法計算' }}
            </strong>
          </div>
          <p class="quarter-footnote">
            <template v-if="item.computableCount > 0">{{ item.computableCount }} 筆計入</template>
            <template v-if="item.count > item.computableCount">
              <span v-if="item.computableCount > 0"> · </span>
              {{ item.count - item.computableCount }} 筆無倍率未計入
            </template>
            <template v-if="item.computableCount === 0 && item.count > 0"> 皆為無倍率季度</template>
          </p>
        </article>
      </div>
    </section>
  </main>
</template>
