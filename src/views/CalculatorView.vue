<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { getFiscalQuarter, multipliersApply, MULTIPLIER_START_KEY } from '@/shared/fiscalQuarter'
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
import SignedQuarterStats from '@/components/ledger/SignedQuarterStats.vue'
import PaidQuarterStats from '@/components/ledger/PaidQuarterStats.vue'
import {
  records,
  visibleRecords,
  isLoading,
  isFileMode,
  ensureLoaded,
  upsertRecord,
  removeRecord,
  applyFilterForSignedMonth,
  multiplierFor,
  multiplierSummary,
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
  salesRep?: string
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
    return showStatus('每筆網址都需為有效的報價單連結。', 'error')
  }
  if (entries.some((entry) => !entry.paidMonth)) {
    return showStatus('每一列都要選收款月份。', 'error')
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
  if (!inputUrl) throw new Error('這筆沒有可同步的網址。')
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
        salesRep: record.salesRep,
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
    salesRep?: string
  },
  options?: { preserveCustomerFields?: boolean },
): BonusRecord {
  const preserveCustomer = options?.preserveCustomerFields ?? false
  const customerType = preserveCustomer
    ? base.customerType || 'unknown'
    : base.customerType || defaultCustomerType()
  const salesRep = quote.salesRep || (preserveCustomer ? base.salesRep || '' : '')

  return {
    id: base.id,
    quoteUrl: quote.quoteUrl || base.quoteUrl,
    orderNo: quote.orderNo || '',
    customerName: quote.customerName || '',
    customerType,
    salesRep,
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
    showStatus('這個篩選範圍沒有資料可以匯出。', 'error')
    return
  }

  const headers = [
    '報價單網址',
    '案件編號',
    '客戶名稱',
    '客戶類型',
    '業務',
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
      record.salesRep,
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
  downloadFile('ivy-bonus-records.csv', `﻿${csv}`, 'text/csv;charset=utf-8')
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
    return '連不到後端 API。本機開發請確認 npm start 已啟動；線上版請稍後再試。'
  }
  if (/HTTP 404/.test(message)) return 'API 404：找不到 /api/fetch-quote，請確認後端已部署。'
  if (/403/.test(message)) return 'quote 網站回 403，可能 access_token 無效、權限不足或需要登入。'
  return message
}

function networkDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (location.protocol === 'file:') {
    return `目前是從 file:// 開啟，請改用 http://localhost:3000（本機）或線上網址。原始錯誤：${message}`
  }
  if (/Load failed|Failed to fetch|NetworkError/i.test(message)) {
    return `連不到 API。本機請確認 npm start 已啟動；線上版稍後再試。原始錯誤：${message}`
  }
  if (/HTTP 404/.test(message)) return '404：找不到 /api/health，請確認後端已部署或本機已啟動。'
  if (/HTTP 500/.test(message)) return '500：後端出錯，本機看 npm start 的 console，線上看 Vercel logs。'
  return message
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
    <DbStatusBanner />

    <header class="page-head page-head--compact">
      <div>
        <h1>季度獎金帳本</h1>
        <p>
          回簽月份決定獎金%和倍率，收款月份決定哪一季發放。金額看報價單的「未連稅金額」和「總計」。
        </p>
      </div>
      <span v-if="apiOk" class="badge ok">API 已連線</span>
    </header>

    <LedgerTabs v-model="visibleSections" />

    <section v-show="isSectionVisible('overview')" class="panel">
      <h2>新增報價單</h2>
      <div v-if="isFileMode" class="server-notice">
        <strong>這個工具要從本機伺服器開，別直接點 HTML 檔。</strong>
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
              placeholder="貼上報價單網址（…/my/orders/...）"
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
            title="移除這列"
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
      <p class="hint">回簽月份與案件業務會從報價單自動帶入；每列再選客戶類型與收款月份。</p>
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
            title="用報價單網址重新抓最新資料（只限目前篩選範圍）"
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
            ? '還沒有報價單紀錄。貼上網址，按「抓取報價單」就能新增。'
            : '這個篩選範圍下沒有紀錄。換上面的工作季度，或選「全部」看看。'
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
          <li>1 月算前一年度的 Q4。</li>
          <li>同一個網址重複新增，會更新原本那筆。</li>
          <li>
            倍率和最終獎金從 {{ MULTIPLIER_START_KEY }} 才開始算，更早的季度算不出來。
          </li>
        </ul>
      </div>
    </section>

    <SignedQuarterStats v-show="isSectionVisible('signed')" />

    <PaidQuarterStats v-show="isSectionVisible('paid')" />
  </main>
</template>
