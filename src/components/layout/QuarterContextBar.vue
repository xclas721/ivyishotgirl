<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import QuarterFilter from '@/components/ui/QuarterFilter.vue'
import {
  filterContextLabel,
  paidVisibleRecords,
  visibleRecords,
} from '@/composables/ledger'
import { accrualTotal, payoutTotal } from '@/composables/ledgerSummary'

const route = useRoute()

const showBar = computed(() => route.path === '/' || route.path === '/multipliers')

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})

const signedCount = computed(() => visibleRecords.value.length)
const paidCount = computed(() => paidVisibleRecords.value.length)
</script>

<template>
  <div v-if="showBar" class="quarter-context-bar">
    <div class="quarter-context-main">
      <p class="quarter-context-label">工作季度</p>
      <p class="quarter-context-title">{{ filterContextLabel }}</p>
      <p class="quarter-context-hint">篩選依回簽月份；實領 KPI 依收款月份</p>
    </div>
    <QuarterFilter />
    <div class="quarter-context-kpis">
      <div class="context-kpi context-kpi--accrual">
        <span class="context-kpi-label">應計獎金</span>
        <strong class="context-kpi-value">{{ money.format(accrualTotal) }}</strong>
        <span class="context-kpi-meta">{{ signedCount }} 筆回簽</span>
      </div>
      <div class="context-kpi context-kpi--payout">
        <span class="context-kpi-label">實領（本季收款）</span>
        <strong class="context-kpi-value">{{ money.format(payoutTotal) }}</strong>
        <span class="context-kpi-meta">{{ paidCount }} 筆收款</span>
      </div>
    </div>
  </div>
</template>
