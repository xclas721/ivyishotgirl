<script setup lang="ts">
import type { LedgerSummaryResult } from '@/composables/ledgerSummary'

defineProps<{
  summary: LedgerSummaryResult
  recordCount: number
}>()

const emit = defineEmits<{ exportCsv: [] }>()

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })
</script>

<template>
  <section class="panel">
    <div class="section-head">
      <h2>篩選範圍總覽</h2>
      <div class="tool-row">
        <button class="secondary" type="button" @click="emit('exportCsv')">匯出 CSV</button>
      </div>
    </div>
    <div class="totals">
      <div class="total primary">
        <span>發放總獎金</span>
        <strong>{{ money.format(summary.totals.final) }}</strong>
        <small v-if="summary.totals.uncomputableCount > 0" class="total-note">
          未含 {{ summary.totals.uncomputableCount }} 筆無倍率季度（無法計算）
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
  </section>
</template>
