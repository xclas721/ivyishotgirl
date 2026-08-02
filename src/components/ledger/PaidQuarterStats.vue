<script setup lang="ts">
import { isFilteredQuarter } from '@/composables/ledger'
import { ledgerSummary } from '@/composables/ledgerSummary'

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})

const summary = ledgerSummary
</script>

<template>
  <section class="panel">
    <div class="quarter-section-head">
      <div>
        <p class="quarter-section-tag">依收款月份</p>
        <h2>發放季度實領</h2>
        <p class="quarter-section-desc">
          在目前發放篩選範圍內，依<strong>收款／發放季度</strong>歸類的實領獎金（金額仍按各案回簽季度計算）。
        </p>
      </div>
    </div>
    <div v-if="summary.paid.length === 0" class="empty">尚無發放季度資料</div>
    <div v-else class="quarter-grid">
      <article
        v-for="item in summary.paid"
        :key="item.key"
        class="quarter-card quarter-card--paid"
        :class="{ 'is-filtered': isFilteredQuarter(item.key) }"
      >
        <div class="quarter-card-top">
          <span class="quarter-badge">{{ item.key }}</span>
          <span class="quarter-meta">{{ item.range }} · {{ item.count }} 筆收款</span>
        </div>
        <div class="quarter-hero">
          <span class="quarter-hero-label">實領獎金</span>
          <strong class="quarter-hero-amount" :class="{ 'is-muted': item.computableCount === 0 }">
            {{ item.computableCount > 0 ? money.format(item.final) : '無法計算' }}
          </strong>
        </div>
        <p class="quarter-footnote">
          <template v-if="item.computableCount > 0">{{ item.computableCount }} 筆計入</template>
          <template v-if="item.count > item.computableCount">
            <span v-if="item.computableCount > 0"> · </span>
            {{ item.count - item.computableCount }} 筆缺回簽月份未計入
          </template>
          <template v-if="item.computableCount === 0 && item.count > 0">
            皆缺回簽月份，無法計算
          </template>
        </p>
      </article>
    </div>
  </section>
</template>
