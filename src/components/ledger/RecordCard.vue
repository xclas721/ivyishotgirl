<script setup lang="ts">
import { ExternalLink, RefreshCw, Trash2 } from 'lucide-vue-next'
import { getFiscalQuarter, multipliersApply } from '@/shared/fiscalQuarter'
import type { BonusRecord } from '@/lib/db'
import { CUSTOMER_TYPE_OPTIONS } from '@/shared/customerType'
import {
  combinedMultiplier,
  formatNumber,
  isDefaultMultiplier,
  multiplierFor,
  multiplierSummary,
  updateRecord,
} from '@/composables/ledger'
import {
  formatFinalCommission,
  quarterLabel,
  recordWarnings,
} from '@/composables/useRecordDisplay'

defineProps<{
  id?: string
  record: BonusRecord
  highlighted: boolean
  isFileMode: boolean
  isSyncing: boolean
  isSyncingAll: boolean
}>()

const emit = defineEmits<{
  resync: []
  delete: []
}>()

const signedQuarterKey = (record: BonusRecord) => getFiscalQuarter(record.signedMonth).key
</script>

<template>
  <article
    :id="id"
    class="record-card"
    :class="{ 'record-card--highlighted': highlighted }"
  >
    <header class="record-card-head">
      <div class="record-card-identity">
        <a
          v-if="record.quoteUrl"
          class="record-card-order"
          :href="record.quoteUrl"
          target="_blank"
          rel="noreferrer"
          :title="record.quoteUrl"
        >
          {{ record.orderNo || '報價單' }}
          <ExternalLink :size="13" :stroke-width="2" aria-hidden="true" />
        </a>
        <span v-else class="record-card-order">{{ record.orderNo || '—' }}</span>
        <p class="record-card-customer">{{ record.customerName || '—' }}</p>
      </div>
      <div class="record-card-actions">
        <button
          class="record-card-action"
          type="button"
          :disabled="isFileMode || isSyncing || isSyncingAll"
          @click="emit('resync')"
        >
          <RefreshCw :size="14" :stroke-width="2" :class="{ spinning: isSyncing }" />
          {{ isSyncing ? '同步中' : '再同步' }}
        </button>
        <button
          class="record-card-action record-card-action--danger"
          type="button"
          :disabled="isSyncingAll"
          @click="emit('delete')"
        >
          <Trash2 :size="14" :stroke-width="2" />
          刪除
        </button>
      </div>
    </header>

    <p v-if="recordWarnings(record)" class="record-card-warning">
      {{ recordWarnings(record) }}
    </p>

    <div class="record-card-body">
      <label class="record-card-field record-card-field--full">
        客戶類型
        <select
          class="type-select"
          :class="{ unknown: record.customerType === 'unknown' }"
          :value="record.customerType"
          @change="
            updateRecord(record, 'customerType', ($event.target as HTMLSelectElement).value)
          "
        >
          <option v-if="record.customerType === 'unknown'" value="unknown" disabled>
            請選擇
          </option>
          <option
            v-for="option in CUSTOMER_TYPE_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}（{{ option.rate }}%）
          </option>
        </select>
      </label>

      <label class="record-card-field record-card-field--full">
        業務
        <input
          class="rep-input"
          :value="record.salesRep"
          type="text"
          placeholder="—"
          @change="updateRecord(record, 'salesRep', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="record-card-field">
        回簽月份
        <input
          :value="record.signedMonth"
          type="month"
          @input="updateRecord(record, 'signedMonth', ($event.target as HTMLInputElement).value)"
        />
        <span class="record-card-meta">季度 {{ quarterLabel(record.signedMonth) }}</span>
      </label>

      <label class="record-card-field">
        收款月份
        <input
          :value="record.paidMonth"
          type="month"
          @input="updateRecord(record, 'paidMonth', ($event.target as HTMLInputElement).value)"
        />
        <span class="record-card-meta">季度 {{ quarterLabel(record.paidMonth) }}</span>
      </label>

      <label class="record-card-field">
        未連稅金額
        <input
          :value="record.taxExcludedAmount"
          type="number"
          min="0"
          step="1"
          @input="
            updateRecord(record, 'taxExcludedAmount', ($event.target as HTMLInputElement).value)
          "
        />
      </label>

      <label class="record-card-field">
        總計
        <input
          :value="record.taxIncludedAmount"
          type="number"
          min="0"
          step="1"
          @input="
            updateRecord(record, 'taxIncludedAmount', ($event.target as HTMLInputElement).value)
          "
        />
      </label>
    </div>

    <footer class="record-card-foot">
      <div class="record-card-stat">
        <span class="record-card-stat-label">套用倍率</span>
        <template v-if="multipliersApply(signedQuarterKey(record))">
          <strong
            class="record-card-stat-value"
            :title="
              multiplierSummary(signedQuarterKey(record), multiplierFor(signedQuarterKey(record)))
            "
          >
            ×{{
              formatNumber(combinedMultiplier(multiplierFor(signedQuarterKey(record))))
            }}
          </strong>
          <span
            v-if="isDefaultMultiplier(multiplierFor(signedQuarterKey(record)))"
            class="record-card-meta"
          >
            尚未設定，暫以 1
          </span>
        </template>
        <strong v-else class="record-card-stat-value record-card-stat-value--muted">無倍率</strong>
      </div>
      <div class="record-card-stat record-card-stat--bonus">
        <span class="record-card-stat-label">最終獎金</span>
        <strong class="record-card-bonus">{{ formatFinalCommission(record) }}</strong>
      </div>
    </footer>
  </article>
</template>
