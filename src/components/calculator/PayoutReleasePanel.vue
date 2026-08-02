<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { usePayoutRelease } from '@/composables/payoutRelease'

const { payoutWave, payoutTotals, goPrevWave, goNextWave, resetToLatest } = usePayoutRelease()

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })
</script>

<template>
  <section class="panel payout-release-panel">
    <div class="section-head">
      <div class="payout-release-title">
        <h2>上季獎金發放</h2>
        <p class="payout-release-sub">
          （{{ payoutWave.payoutMonthLabel }}）· 對應業績
          {{ payoutWave.workQuarterKey }}（{{ payoutWave.workQuarterRange }}）
        </p>
      </div>
      <div class="tool-row payout-release-nav">
        <button class="secondary" type="button" title="上一波發放" @click="goPrevWave">
          <ChevronLeft :size="16" :stroke-width="2" aria-hidden="true" />
          上一波
        </button>
        <button class="secondary" type="button" title="回到最近一波發放" @click="resetToLatest">
          最近
        </button>
        <button class="secondary" type="button" title="下一波發放" @click="goNextWave">
          下一波
          <ChevronRight :size="16" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p class="payout-release-hint">
      統計收款月份為 {{ payoutWave.paidMonth }} 的案件（公司領錢月：5／8／11／2）。獎金仍依各案回簽季度計算。
    </p>

    <div class="totals">
      <div class="total primary">
        <span>本波發放獎金</span>
        <strong>{{ money.format(payoutTotals.final) }}</strong>
        <small v-if="payoutTotals.uncomputableCount > 0" class="total-note">
          未含 {{ payoutTotals.uncomputableCount }} 筆缺回簽月份
        </small>
      </div>
      <div class="total">
        <span>簽約未連稅金額</span>
        <strong>{{ money.format(payoutTotals.taxExcludedAmount) }}</strong>
      </div>
      <div class="total">
        <span>總計</span>
        <strong>{{ money.format(payoutTotals.taxIncludedAmount) }}</strong>
      </div>
      <div class="total">
        <span>紀錄筆數</span>
        <strong>{{ integer.format(payoutTotals.count) }}</strong>
      </div>
    </div>
  </section>
</template>
