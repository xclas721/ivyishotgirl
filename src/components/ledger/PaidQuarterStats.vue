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
          這一季<strong>實際入帳</strong>會領到多少。金額還是按各案的回簽季度算，只是改用收款時間歸類。
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
            {{ item.count - item.computableCount }} 筆無倍率未計入
          </template>
          <template v-if="item.computableCount === 0 && item.count > 0"> 皆為無倍率季度</template>
        </p>
      </article>
    </div>
  </section>
</template>
