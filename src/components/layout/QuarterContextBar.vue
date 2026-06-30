<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import QuarterFilter from '@/components/ui/QuarterFilter.vue'
import { filterContextLabel, paidVisibleRecords, visibleRecords } from '@/composables/ledger'
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

const accrualFlash = ref(false)
const payoutFlash = ref(false)

function triggerFlash(target: { value: boolean }) {
  target.value = false
  window.requestAnimationFrame(() => {
    target.value = true
    window.setTimeout(() => {
      target.value = false
    }, 560)
  })
}

watch(accrualTotal, (next, prev) => {
  if (prev === undefined || next === prev) return
  triggerFlash(accrualFlash)
})

watch(payoutTotal, (next, prev) => {
  if (prev === undefined || next === prev) return
  triggerFlash(payoutFlash)
})
</script>

<template>
  <div v-if="showBar" class="quarter-context-bar">
    <div class="quarter-context-main">
      <p class="quarter-context-label">工作季度</p>
      <p class="quarter-context-title">{{ filterContextLabel }}</p>
      <p class="quarter-context-hint">篩選看回簽月份，實領看收款月份</p>
    </div>
    <QuarterFilter />
    <div class="quarter-context-kpis">
      <div class="context-kpi context-kpi--accrual">
        <span class="context-kpi-label context-kpi-label--long">應計獎金</span>
        <span class="context-kpi-label context-kpi-label--short">應計</span>
        <strong class="context-kpi-value" :class="{ 'fx-kpi-flash': accrualFlash }">{{
          money.format(accrualTotal)
        }}</strong>
        <span class="context-kpi-meta">{{ signedCount }} 筆回簽</span>
      </div>
      <div class="context-kpi context-kpi--payout">
        <span class="context-kpi-label context-kpi-label--long">實領（本季收款）</span>
        <span class="context-kpi-label context-kpi-label--short">實領</span>
        <strong class="context-kpi-value" :class="{ 'fx-kpi-flash': payoutFlash }">{{
          money.format(payoutTotal)
        }}</strong>
        <span class="context-kpi-meta">{{ paidCount }} 筆收款</span>
      </div>
    </div>
  </div>
</template>
