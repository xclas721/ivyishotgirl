<script setup lang="ts">
import { computed } from 'vue'
import type { BonusRecord } from '@/lib/db'
import RecordCard from '@/components/ledger/RecordCard.vue'

const props = defineProps<{
  records: BonusRecord[]
  searchQuery?: string
  highlightId?: string
  isFileMode: boolean
  isSyncingAll: boolean
  syncingIds: Set<string>
}>()

const emit = defineEmits<{
  resync: [record: BonusRecord]
  delete: [id: string]
}>()

const sortedRecords = computed(() =>
  [...props.records].sort((a, b) => (b.paidMonth || '').localeCompare(a.paidMonth || '')),
)

function isSyncing(id: string) {
  return props.syncingIds.has(id)
}
</script>

<template>
  <div class="records-card-list">
    <RecordCard
      v-for="record in sortedRecords"
      :id="`record-row-${record.id}`"
      :key="record.id"
      :record="record"
      :search-query="searchQuery"
      :highlighted="record.id === highlightId"
      :is-file-mode="isFileMode"
      :is-syncing="isSyncing(record.id)"
      :is-syncing-all="isSyncingAll"
      @resync="emit('resync', record)"
      @delete="emit('delete', record.id)"
    />
  </div>
</template>
