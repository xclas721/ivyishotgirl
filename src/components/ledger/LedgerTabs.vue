<script setup lang="ts">
export type LedgerTabId = 'overview' | 'records' | 'signed' | 'paid'

const model = defineModel<LedgerTabId>({ required: true })

const tabs: { id: LedgerTabId; label: string; hint: string }[] = [
  { id: 'overview', label: '總覽', hint: 'KPI 與新增' },
  { id: 'records', label: '案件明細', hint: '表格編輯' },
  { id: 'signed', label: '回簽試算', hint: '依回簽季度' },
  { id: 'paid', label: '發放實領', hint: '依收款季度' },
]
</script>

<template>
  <nav class="ledger-tabs" aria-label="帳本分頁">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="ledger-tab"
      :class="{ 'is-active': model === tab.id }"
      :aria-selected="model === tab.id"
      @click="model = tab.id"
    >
      <span class="ledger-tab-label">{{ tab.label }}</span>
      <span class="ledger-tab-hint">{{ tab.hint }}</span>
    </button>
  </nav>
</template>
