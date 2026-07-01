<script setup lang="ts">
import { MULTIPLIER_START_KEY } from '@/shared/fiscalQuarter'
import type { BonusRecord } from '@/lib/db'
import RecordsTable from '@/components/ledger/RecordsTable.vue'
import RecordsCardList from '@/components/ledger/RecordsCardList.vue'

defineProps<{
  records: BonusRecord[]
  allRecordsCount: number
  highlightId: string
  isFileMode: boolean
  isLoading: boolean
  isSyncingAll: boolean
  syncingIds: Set<string>
}>()

const emit = defineEmits<{
  exportCsv: []
  resyncAll: []
  resync: [record: BonusRecord]
  delete: [id: string]
}>()
</script>

<template>
  <section class="panel">
    <div class="section-head">
      <h2>報價單紀錄</h2>
      <div v-if="records.length > 0" class="tool-row">
        <button
          class="secondary"
          type="button"
          title="匯出目前篩選範圍的案件明細"
          :disabled="isLoading"
          @click="emit('exportCsv')"
        >
          匯出 CSV（{{ records.length }} 筆）
        </button>
        <button
          class="secondary"
          type="button"
          title="用報價單網址重新抓最新資料（只限目前篩選範圍）"
          :disabled="isFileMode || isLoading || isSyncingAll"
          @click="emit('resyncAll')"
        >
          {{ isSyncingAll ? '抓取中…' : `全部再同步（${records.length}）` }}
        </button>
      </div>
    </div>
    <div v-if="records.length === 0" class="empty">
      {{
        allRecordsCount === 0
          ? '還沒有報價單紀錄。貼上網址，按「抓取報價單」就能新增。'
          : '這個篩選範圍下沒有紀錄。換上面的工作季度，或選「全部」看看。'
      }}
    </div>
    <template v-else>
      <RecordsCardList
        class="records-cards-mobile"
        :records="records"
        :highlight-id="highlightId"
        :is-file-mode="isFileMode"
        :is-syncing-all="isSyncingAll"
        :syncing-ids="syncingIds"
        @resync="emit('resync', $event)"
        @delete="emit('delete', $event)"
      />
      <RecordsTable
        :records="records"
        :highlight-id="highlightId"
        :is-file-mode="isFileMode"
        :is-loading="isLoading"
        :is-syncing-all="isSyncingAll"
        :syncing-ids="syncingIds"
        @resync="emit('resync', $event)"
        @delete="emit('delete', $event)"
      />
    </template>
    <div class="notice">
      <ul class="notice-list">
        <li>1 月算前一年度的 Q4。</li>
        <li>同一個網址重複新增，會更新原本那筆。</li>
        <li>倍率和最終獎金從 {{ MULTIPLIER_START_KEY }} 才開始算，更早的季度算不出來。</li>
      </ul>
    </div>
  </section>
</template>
