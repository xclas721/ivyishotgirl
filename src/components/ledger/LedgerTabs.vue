<script setup lang="ts">
import { Eye, EyeOff } from 'lucide-vue-next'

export type LedgerTabId = 'overview' | 'records' | 'signed' | 'paid'

const model = defineModel<LedgerTabId[]>({ required: true })

const tabs: { id: LedgerTabId; label: string; hint: string }[] = [
  { id: 'overview', label: '總覽', hint: 'KPI 與新增' },
  { id: 'records', label: '案件明細', hint: '表格編輯' },
  { id: 'signed', label: '回簽試算', hint: '依回簽季度' },
  { id: 'paid', label: '發放實領', hint: '依收款季度' },
]

function isActive(id: LedgerTabId) {
  return model.value.includes(id)
}

function toggleTab(id: LedgerTabId) {
  if (isActive(id)) {
    model.value = model.value.filter((section) => section !== id)
    return
  }
  model.value = [...model.value, id]
}
</script>

<template>
  <nav class="ledger-tabs" role="tablist" aria-label="帳本區塊">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      class="ledger-tab"
      :class="{ 'is-active': isActive(tab.id) }"
      :aria-selected="isActive(tab.id)"
      :aria-label="`${tab.label}${isActive(tab.id) ? '，已顯示' : '，已隱藏'}`"
      @click="toggleTab(tab.id)"
    >
      <span class="ledger-tab-head">
        <Eye
          v-if="isActive(tab.id)"
          class="ledger-tab-icon ledger-tab-icon--on"
          :size="14"
          :stroke-width="2"
          aria-hidden="true"
        />
        <EyeOff
          v-else
          class="ledger-tab-icon ledger-tab-icon--off"
          :size="14"
          :stroke-width="2"
          aria-hidden="true"
        />
        <span class="ledger-tab-label">{{ tab.label }}</span>
      </span>
      <span class="ledger-tab-hint">{{ tab.hint }}</span>
    </button>
  </nav>
</template>
