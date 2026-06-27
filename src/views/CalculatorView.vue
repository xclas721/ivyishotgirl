<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ExternalLink } from 'lucide-vue-next'
import { getFiscalQuarter } from '@/shared/fiscalQuarter'
import type { QuarterInfo } from '@/shared/fiscalQuarter'
import type { BonusRecord, CustomerType } from '@/lib/db'
import {
  records,
  quarterMultipliers,
  isLoading,
  dbError,
  isFileMode,
  ensureLoaded,
  upsertRecord,
  updateRecord,
  removeRecord,
  clearAll,
  multiplierFor,
  defaultMultiplier,
  isDefaultMultiplier,
  formatNumber,
  formatMultiplier,
  multiplierSummary,
  combinedMultiplier,
  toNumber,
  canonicalUrl,
  currentMonth,
} from '@/composables/ledger'

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

interface QuarterSummary extends QuarterInfo {
  count: number
  final: number
  base: number
  taxExcludedAmount: number
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
const syncingIds = ref<Set<string>>(new Set())

const summary = computed(() => summarize())

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

async function fetchQuote() {
  if (isFileMode) {
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
    const quote = await requestQuote(inputUrl)
    const finalSignedMonth = signedMonth.value || quote.signedMonth || ''
    upsertRecord(
      applyQuoteToRecord(quote, {
        id: canonicalUrl(quote.quoteUrl || inputUrl),
        quoteUrl: quote.quoteUrl || inputUrl,
        signedMonth: finalSignedMonth,
        paidMonth: paidMonth.value,
      }),
    )

    quoteUrl.value = ''
    signedMonth.value = ''
    showStatus(...quoteResultMessage(quote, finalSignedMonth, '已新增'))
  } catch (error) {
    showStatus(`抓取失敗：${friendlyFetchError(error)}`, 'error')
  } finally {
    isFetching.value = false
  }
}

// Re-fetch an existing record from its stored URL, refreshing the quote data
// while keeping the user-set 回簽/收款月份.
async function resyncRecord(record: BonusRecord) {
  if (isFileMode) {
    showStatus('請先用 http://localhost:3000 開啟後再同步。', '')
    return
  }
  const inputUrl = record.quoteUrl?.trim()
  if (!inputUrl) return showStatus('此紀錄沒有可同步的網址。', 'error')

  setSyncing(record.id, true)
  showStatus(`正在同步 ${record.orderNo || inputUrl}...`)

  try {
    const quote = await requestQuote(inputUrl)
    const finalSignedMonth = record.signedMonth || quote.signedMonth || ''
    upsertRecord(
      applyQuoteToRecord(quote, {
        id: record.id,
        quoteUrl: record.quoteUrl,
        signedMonth: finalSignedMonth,
        paidMonth: record.paidMonth,
      }),
    )
    showStatus(...quoteResultMessage(quote, finalSignedMonth, '已重新同步'))
  } catch (error) {
    showStatus(`同步失敗：${friendlyFetchError(error)}`, 'error')
  } finally {
    setSyncing(record.id, false)
  }
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
  base: { id: string; quoteUrl: string; signedMonth: string; paidMonth: string },
): BonusRecord {
  return {
    id: base.id,
    quoteUrl: quote.quoteUrl || base.quoteUrl,
    orderNo: quote.orderNo || '',
    customerName: quote.customerName || '',
    customerType: quote.customerType || 'unknown',
    taxExcludedAmount: Number(quote.taxExcludedAmount || 0),
    taxIncludedAmount: Number(quote.taxIncludedAmount || 0),
    signedMonth: base.signedMonth,
    paidMonth: base.paidMonth,
    baseCommissionRate: Number(quote.defaultCommissionRate || 4),
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
  if (quote.customerType === 'unknown') warnings.push('客戶類型無法判斷，請確認獎金%')
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

function isSyncing(id: string) {
  return syncingIds.value.has(id)
}

function deleteRecord(id: string) {
  if (!confirm('確定刪除這筆紀錄？')) return
  removeRecord(id)
}

function clearRecords() {
  if (!confirm('確定清空全部紀錄與季度倍率設定？')) return
  clearAll()
  showStatus('已清空紀錄。', 'ok')
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
    '簽約依據',
    '金額來源',
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
      amountDebugText(record.amountDebug),
    ]
  })
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  downloadFile('saiens-bonus-records.csv', `﻿${csv}`, 'text/csv;charset=utf-8')
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
    <div v-if="isLoading" class="db-loading">資料讀取中…</div>
    <div v-if="dbError" class="db-error-banner">
      {{ dbError }}
      <button type="button" class="db-error-close" @click="dbError = ''">×</button>
    </div>
    <header class="page-head">
      <div>
        <h1>季度獎金帳本</h1>
        <p>
          回簽月份決定獎金%與倍率，收款月份決定實際發放季度。金額以報價單「未連稅金額」與「總計」為準。
        </p>
      </div>
      <span v-if="apiOk" class="badge ok">API 已連線</span>
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
        <button type="button" :disabled="isFetching || isFileMode || isLoading" @click="fetchQuote">
          {{ isFetching ? '抓取中...' : '抓取報價單' }}
        </button>
      </div>
      <p class="status" :class="status.tone">{{ status.message }}</p>
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>總覽</h2>
        <div class="tool-row">
          <button class="secondary" type="button" @click="exportCsv">匯出 CSV</button>
          <button class="danger" type="button" @click="clearRecords">清空紀錄</button>
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
              <th>套用倍率</th>
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
              <td class="order-cell">
                <a
                  v-if="record.quoteUrl"
                  :href="record.quoteUrl"
                  target="_blank"
                  rel="noreferrer"
                  :title="record.quoteUrl"
                >
                  {{ record.orderNo || '報價單' }}
                  <ExternalLink :size="12" :stroke-width="2" />
                </a>
                <span v-else>{{ record.orderNo || '-' }}</span>
              </td>
              <td>{{ record.customerName || '-' }}</td>
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
              <td class="mult-cell">
                <span
                  :title="
                    multiplierSummary(
                      getFiscalQuarter(record.signedMonth).key,
                      multiplierFor(getFiscalQuarter(record.signedMonth).key),
                    )
                  "
                  >×{{
                    formatNumber(
                      combinedMultiplier(multiplierFor(getFiscalQuarter(record.signedMonth).key)),
                    )
                  }}</span
                >
                <div
                  v-if="
                    getFiscalQuarter(record.signedMonth).key &&
                    isDefaultMultiplier(multiplierFor(getFiscalQuarter(record.signedMonth).key))
                  "
                  class="hint"
                >
                  尚未設定，暫以 1
                </div>
              </td>
              <td class="bonus">{{ money.format(finalCommissionFor(record)) }}</td>
              <td class="actions-cell">
                <button
                  class="secondary"
                  type="button"
                  :disabled="isFileMode || isSyncing(record.id)"
                  @click="resyncRecord(record)"
                >
                  {{ isSyncing(record.id) ? '同步中…' : '再同步' }}
                </button>
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
