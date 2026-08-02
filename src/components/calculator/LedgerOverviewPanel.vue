<script setup lang="ts">
import { computed } from 'vue'
import type { BonusRecord } from '@/lib/db'
import type { LedgerSummaryResult } from '@/composables/ledgerSummary'

const props = defineProps<{
  summary: LedgerSummaryResult
  records: BonusRecord[]
  recordCount: number
}>()

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })

/** 篩選範圍內，依回簽月份分組筆數（新→舊） */
const signedMonthStats = computed(() => {
  const counts = new Map<string, number>()
  for (const record of props.records) {
    const month = record.signedMonth?.trim() || '未填'
    counts.set(month, (counts.get(month) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => {
      if (a.month === '未填') return 1
      if (b.month === '未填') return -1
      return b.month.localeCompare(a.month)
    })
})
</script>

<template>
  <section class="panel">
    <div class="section-head">
      <h2>發放篩選總覽</h2>
    </div>
    <div class="totals">
      <div class="total primary">
        <span>發放總獎金</span>
        <strong>{{ money.format(summary.totals.final) }}</strong>
        <small v-if="summary.totals.uncomputableCount > 0" class="total-note">
          未含 {{ summary.totals.uncomputableCount }} 筆缺回簽月份（無法計算）
        </small>
      </div>
      <div class="total">
        <span>簽約未連稅金額</span>
        <strong>{{ money.format(summary.totals.taxExcludedAmount) }}</strong>
      </div>
      <div class="total">
        <span>總計</span>
        <strong>{{ money.format(summary.totals.taxIncludedAmount) }}</strong>
      </div>
      <div class="total">
        <span>紀錄筆數</span>
        <strong>{{ integer.format(recordCount) }}</strong>
      </div>
    </div>

    <div v-if="signedMonthStats.length > 0" class="overview-signed-months">
      <p class="overview-signed-months-label">時間區間內 · 回簽月份統計</p>
      <ul class="overview-signed-months-list">
        <li v-for="item in signedMonthStats" :key="item.month">
          <span class="overview-signed-month">{{ item.month }}</span>
          <span class="overview-signed-label">回簽月份</span>
          <span class="overview-signed-count">{{ item.count }} 筆</span>
        </li>
      </ul>
    </div>
  </section>
</template>
