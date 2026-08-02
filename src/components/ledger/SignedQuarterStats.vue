<script setup lang="ts">
import { multipliersApply, MULTIPLIER_START_KEY } from '@/shared/fiscalQuarter'
import {
  combinedMultiplier,
  formatMultiplier,
  formatNumber,
  multiplierFor,
} from '@/composables/ledger'
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
        <p class="quarter-section-tag">依回簽月份</p>
        <h2>回簽季度試算</h2>
        <p class="quarter-section-desc">
          在目前發放篩選範圍內，依<strong>回簽季度</strong>拆開的應計獎金（獎金%和倍率仍看各案回簽季度）。
        </p>
      </div>
    </div>
    <div v-if="summary.signed.length === 0" class="empty">尚無回簽季度資料</div>
    <div v-else class="quarter-grid">
      <article
        v-for="item in summary.signed"
        :key="item.key"
        class="quarter-card quarter-card--signed"
      >
        <div class="quarter-card-top">
          <span class="quarter-badge">{{ item.key }}</span>
          <span class="quarter-meta">{{ item.range }} · {{ item.count }} 筆回簽</span>
        </div>
        <div class="quarter-hero">
          <span class="quarter-hero-label">應計獎金</span>
          <strong class="quarter-hero-amount">
            {{ money.format(item.final) }}
          </strong>
          <p v-if="!multipliersApply(item.key)" class="quarter-hero-note">
            固定 3.5%、無倍率（倍率自 {{ MULTIPLIER_START_KEY }} 起適用）
          </p>
        </div>
        <div class="quarter-breakdown">
          <div class="quarter-breakdown-row">
            <span>簽約未連稅合計</span>
            <b>{{ money.format(item.taxExcludedAmount) }}</b>
          </div>
          <div class="quarter-breakdown-row">
            <span>{{ multipliersApply(item.key) ? '基礎獎金小計' : '獎金小計（3.5%）' }}</span>
            <b>{{ money.format(item.base) }}</b>
          </div>
          <div v-if="multipliersApply(item.key)" class="quarter-breakdown-row">
            <span>季度倍率</span>
            <b class="quarter-mult" :title="formatMultiplier(multiplierFor(item.key))">
              ×{{ formatNumber(combinedMultiplier(multiplierFor(item.key))) }}
            </b>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
