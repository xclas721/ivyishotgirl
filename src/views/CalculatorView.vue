<script setup lang="ts">
import DbStatusBanner from '@/components/layout/DbStatusBanner.vue'
import QuoteAddForm from '@/components/calculator/QuoteAddForm.vue'
import LedgerOverviewPanel from '@/components/calculator/LedgerOverviewPanel.vue'
import RecordsSection from '@/components/calculator/RecordsSection.vue'
import SignedQuarterStats from '@/components/ledger/SignedQuarterStats.vue'
import PaidQuarterStats from '@/components/ledger/PaidQuarterStats.vue'
import { useQuoteWorkflow } from '@/composables/useQuoteWorkflow'
import { ledgerSummary } from '@/composables/ledgerSummary'

const {
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
} = useQuoteWorkflow()
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
      <span v-if="apiOk" class="badge ok fx-badge-enter">API 已連線</span>
    </header>

    <LedgerOverviewPanel
      v-if="isSectionVisible('overview')"
      :summary="ledgerSummary"
      :record-count="visibleRecords.length"
    />

    <template v-if="isSectionVisible('records')">
      <QuoteAddForm
        :quote-drafts="quoteDrafts"
        :is-fetching="isFetching"
        :is-file-mode="isFileMode"
        :is-loading="isLoading"
        :status-message="status.message"
        :status-tone="status.tone"
        :fetch-button-label="fetchButtonLabel()"
        @fetch="fetchQuotes"
        @add-row="addQuoteDraftRow"
        @remove-row="removeQuoteDraftRow"
      />

      <RecordsSection
        v-model:search-query="recordSearchQuery"
        :records="displayRecords"
        :all-records-count="records.length"
        :quarter-filtered-count="visibleRecords.length"
        :highlight-id="highlightedRecordId"
        :is-file-mode="isFileMode"
        :is-loading="isLoading"
        :is-syncing-all="isSyncingAll"
        :syncing-ids="syncingIds"
        @export-csv="exportCsv"
        @resync-all="resyncAllVisible"
        @resync="resyncRecord"
        @delete="deleteRecord"
      />
    </template>

    <SignedQuarterStats v-if="isSectionVisible('signed')" />

    <PaidQuarterStats v-if="isSectionVisible('paid')" />
  </main>
</template>
