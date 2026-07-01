<script setup lang="ts">
import { computed } from 'vue'
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
import { finalCommissionDisplay } from '@/composables/ledgerSummary'

const props = withDefaults(
  defineProps<{
    records: BonusRecord[]
    highlightId?: string
    isFileMode: boolean
    isLoading: boolean
    isSyncingAll: boolean
    syncingIds: Set<string>
    showQuarterColumns?: boolean
  }>(),
  {
    showQuarterColumns: false,
  },
)

const emit = defineEmits<{
  resync: [record: BonusRecord]
  delete: [id: string]
  resyncAll: []
}>()

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})

const sortedRecords = computed(() =>
  [...props.records].sort((a, b) => (b.paidMonth || '').localeCompare(a.paidMonth || '')),
)

function recordWarnings(record: BonusRecord) {
  const warnings = []
  if (!record.signedMonth) warnings.push('未抓到回簽月份，請手動選擇')
  if (record.customerType === 'unknown') warnings.push('請選擇客戶類型')
  if (record.amountInferred) warnings.push('金額為系統反推，請確認')
  return warnings.join('；')
}

function formatFinalCommission(record: BonusRecord) {
  const value = finalCommissionDisplay(record)
  return value === '無法計算' ? '無法計算' : money.format(value)
}

function quarterTitle(month: string) {
  const key = getFiscalQuarter(month).key
  return key ? `季度：${key}` : ''
}

function isSyncing(id: string) {
  return props.syncingIds.has(id)
}
</script>

<template>
  <div
    class="table-wrap records-table"
    :class="{ 'records-table--compact': !showQuarterColumns }"
  >
    <table>
      <thead>
        <tr class="colgroup-row">
          <th colspan="4" class="colgroup-head">案件</th>
          <th colspan="2" class="colgroup-head">月份</th>
          <th v-if="showQuarterColumns" colspan="2" class="colgroup-head">季度</th>
          <th colspan="2" class="colgroup-head">金額</th>
          <th colspan="2" class="colgroup-head">獎金</th>
          <th rowspan="2" class="colgroup-head colgroup-actions">操作</th>
        </tr>
        <tr>
          <th class="sticky-col sticky-col-1">案件編號</th>
          <th class="sticky-col sticky-col-2">客戶名稱</th>
          <th class="sticky-col sticky-col-3">客戶類型</th>
          <th>業務</th>
          <th>回簽月份</th>
          <th>收款月份</th>
          <th v-if="showQuarterColumns">回簽季度</th>
          <th v-if="showQuarterColumns">發放季度</th>
          <th>未連稅金額</th>
          <th>總計</th>
          <th>套用倍率</th>
          <th>最終獎金</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="record in sortedRecords"
          :id="`record-row-${record.id}`"
          :key="record.id"
          :class="{ 'is-highlighted': record.id === highlightId }"
        >
          <td class="order-cell sticky-col sticky-col-1">
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
          <td class="sticky-col sticky-col-2">{{ record.customerName || '-' }}</td>
          <td class="sticky-col sticky-col-3 type-cell">
            <div class="type-cell-inner">
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
              <span
                v-if="recordWarnings(record)"
                class="record-warning-dot"
                :title="recordWarnings(record)"
                aria-label="此列有待確認項目"
              />
            </div>
          </td>
          <td class="rep-cell">
            <input
              class="rep-input"
              :value="record.salesRep"
              type="text"
              placeholder="—"
              @change="updateRecord(record, 'salesRep', ($event.target as HTMLInputElement).value)"
            />
          </td>
          <td :title="quarterTitle(record.signedMonth)">
            <input
              :value="record.signedMonth"
              type="month"
              :title="quarterTitle(record.signedMonth)"
              @input="
                updateRecord(record, 'signedMonth', ($event.target as HTMLInputElement).value)
              "
            />
          </td>
          <td :title="quarterTitle(record.paidMonth)">
            <input
              :value="record.paidMonth"
              type="month"
              :title="quarterTitle(record.paidMonth)"
              @input="updateRecord(record, 'paidMonth', ($event.target as HTMLInputElement).value)"
            />
          </td>
          <td v-if="showQuarterColumns">{{ getFiscalQuarter(record.signedMonth).key || '-' }}</td>
          <td v-if="showQuarterColumns">{{ getFiscalQuarter(record.paidMonth).key || '-' }}</td>
          <td class="money">
            <input
              :value="record.taxExcludedAmount"
              type="number"
              min="0"
              step="1"
              @input="
                updateRecord(record, 'taxExcludedAmount', ($event.target as HTMLInputElement).value)
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
                updateRecord(record, 'taxIncludedAmount', ($event.target as HTMLInputElement).value)
              "
            />
          </td>
          <td class="mult-cell">
            <template v-if="multipliersApply(getFiscalQuarter(record.signedMonth).key)">
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
                v-if="isDefaultMultiplier(multiplierFor(getFiscalQuarter(record.signedMonth).key))"
                class="hint"
              >
                尚未設定，暫以 1
              </div>
            </template>
            <span v-else class="muted-cell">無倍率</span>
          </td>
          <td class="bonus">
            {{ formatFinalCommission(record) }}
          </td>
          <td class="actions-cell">
            <div class="table-actions">
              <button
                class="table-action"
                type="button"
                :disabled="isFileMode || isSyncing(record.id) || isSyncingAll"
                @click="emit('resync', record)"
              >
                <RefreshCw
                  :size="13"
                  :stroke-width="2"
                  :class="{ spinning: isSyncing(record.id) }"
                />
                <span>{{ isSyncing(record.id) ? '同步中…' : '再同步' }}</span>
              </button>
              <button
                class="table-action table-action-danger"
                type="button"
                :disabled="isSyncingAll"
                @click="emit('delete', record.id)"
              >
                <Trash2 :size="13" :stroke-width="2" />
                <span>刪除</span>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
