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
import { formatFinalCommission, recordWarnings } from '@/composables/useRecordDisplay'
import SearchHighlight from '@/components/ui/SearchHighlight.vue'

const props = defineProps<{
  records: BonusRecord[]
  searchQuery?: string
  highlightId?: string
  isFileMode: boolean
  isLoading: boolean
  isSyncingAll: boolean
  syncingIds: Set<string>
}>()

const emit = defineEmits<{
  resync: [record: BonusRecord]
  delete: [id: string]
  resyncAll: []
}>()

const sortedRecords = computed(() =>
  [...props.records].sort((a, b) => (b.paidMonth || '').localeCompare(a.paidMonth || '')),
)

function isSyncing(id: string) {
  return props.syncingIds.has(id)
}
</script>

<template>
  <div class="table-wrap records-table records-table--desktop">
    <table>
      <thead>
        <tr class="colgroup-row">
          <th colspan="4" class="colgroup-head">案件</th>
          <th colspan="2" class="colgroup-head">月份</th>
          <th colspan="2" class="colgroup-head">季度</th>
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
          <th>回簽季度</th>
          <th>發放季度</th>
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
              <SearchHighlight :text="record.orderNo || '報價單'" :query="searchQuery ?? ''" />
              <ExternalLink :size="12" :stroke-width="2" />
            </a>
            <span v-else>
              <SearchHighlight :text="record.orderNo || '-'" :query="searchQuery ?? ''" />
            </span>
          </td>
          <td class="sticky-col sticky-col-2">
            <SearchHighlight :text="record.customerName || '-'" :query="searchQuery ?? ''" />
          </td>
          <td class="sticky-col sticky-col-3 type-cell">
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
            <div v-if="recordWarnings(record)" class="status error">
              {{ recordWarnings(record) }}
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
              @input="updateRecord(record, 'paidMonth', ($event.target as HTMLInputElement).value)"
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
