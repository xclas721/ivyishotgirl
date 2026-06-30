<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { CUSTOMER_TYPE_OPTIONS } from '@/shared/customerType'
import type { QuoteDraftRow } from '@/composables/useQuoteWorkflow'

defineProps<{
  quoteDrafts: QuoteDraftRow[]
  isFetching: boolean
  isFileMode: boolean
  isLoading: boolean
  statusMessage: string
  statusTone: string
  fetchButtonLabel: string
}>()

const emit = defineEmits<{
  fetch: []
  addRow: []
  removeRow: [index: number]
}>()
</script>

<template>
  <section class="panel">
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
            @keydown.enter.prevent="emit('fetch')"
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
          @click="emit('removeRow', index)"
        >
          <X :size="14" :stroke-width="2" />
        </button>
      </div>
      <div class="add-url-actions">
        <button
          class="secondary add-url-add"
          type="button"
          :disabled="isFetching || isFileMode || isLoading"
          @click="emit('addRow')"
        >
          <Plus :size="14" :stroke-width="2" />
          再加一筆
        </button>
        <button
          type="button"
          :disabled="isFetching || isFileMode || isLoading"
          @click="emit('fetch')"
        >
          {{ fetchButtonLabel }}
        </button>
      </div>
    </div>
    <p class="hint">回簽月份與案件業務會從報價單自動帶入；每列再選客戶類型與收款月份。</p>
    <p class="status" :class="statusTone">{{ statusMessage }}</p>
  </section>
</template>
