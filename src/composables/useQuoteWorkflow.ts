import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { filterRecordsBySearch } from '@/composables/useRecordSearch'
import type { BonusRecord, CustomerType } from '@/lib/db'
import { defaultCustomerType } from '@/shared/customerType'
import { exportVisibleRecordsCsv } from '@/lib/csvExport'
import { friendlyFetchError, networkDiagnostic } from '@/lib/apiErrors'
import {
  applyQuoteToRecord,
  isValidQuoteUrl,
  quoteResultMessage,
  requestQuote,
} from '@/lib/quoteApi'
import {
  applyFilterForSignedMonth,
  canonicalUrl,
  currentMonth,
  ensureLoaded,
  isFileMode,
  isLoading,
  records,
  removeRecord,
  selectedQuarter,
  selectedYear,
  upsertRecord,
  visibleRecords,
} from '@/composables/ledger'
import { useLedgerSections } from '@/composables/ledgerSections'

export interface QuoteDraftRow {
  url: string
  paidMonth: string
  customerType: CustomerType
}

function newQuoteDraftRow(): QuoteDraftRow {
  return { url: '', paidMonth: currentMonth(), customerType: defaultCustomerType() }
}

export function useQuoteWorkflow() {
  const { isSectionVisible, ensureSectionVisible } = useLedgerSections()
  const quoteDrafts = ref<QuoteDraftRow[]>([newQuoteDraftRow()])
  const status = reactive({ message: '', tone: '' })
  const isFetching = ref(false)
  const isSyncingAll = ref(false)
  const apiOk = ref(false)
  const syncingIds = ref<Set<string>>(new Set())
  const highlightedRecordId = ref('')
  const recordSearchQuery = ref('')

  const displayRecords = computed(() =>
    filterRecordsBySearch(visibleRecords.value, recordSearchQuery.value),
  )

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
    } catch (error) {
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
    recordSearchQuery.value = ''
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

    const targets = displayRecords.value.filter((record) => record.quoteUrl?.trim())
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
    if (displayRecords.value.length === 0) {
      showStatus('這個篩選範圍沒有資料可以匯出。', 'error')
      return
    }
    exportVisibleRecordsCsv(displayRecords.value, {
      selectedYear: selectedYear.value,
      selectedQuarter: selectedQuarter.value,
    })
  }

  function showStatus(message: string, tone = '') {
    status.message = message
    status.tone = tone
  }

  return {
    quoteDrafts,
    status,
    isFetching,
    isSyncingAll,
    apiOk,
    syncingIds,
    highlightedRecordId,
    isFileMode,
    isLoading,
    records,
    visibleRecords,
    displayRecords,
    recordSearchQuery,
    fetchQuotes,
    addQuoteDraftRow,
    removeQuoteDraftRow,
    fetchButtonLabel,
    isSectionVisible,
    resyncRecord,
    resyncAllVisible,
    deleteRecord,
    exportCsv,
  }
}
