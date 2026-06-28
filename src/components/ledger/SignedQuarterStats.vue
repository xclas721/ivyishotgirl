<script setup lang="ts">
import { multipliersApply, MULTIPLIER_START_KEY } from '@/shared/fiscalQuarter'
import {
  combinedMultiplier,
  formatMultiplier,
  formatNumber,
  isFilteredQuarter,
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
          這一季<strong>簽了哪些案</strong>、業績與倍率加總後的<strong>應計獎金</strong>。獎金%與倍率都看回簽季度。
        </p>
      </div>
    </div>
    <div v-if="summary.signed.length === 0" class="empty">尚無回簽季度資料</div>
    <div v-else class="quarter-grid">
      <article
        v-for="item in summary.signed"
        :key="item.key"
        class="quarter-card quarter-card--signed"
        :class="{ 'is-filtered': isFilteredQuarter(item.key) }"
      >
        <div class="quarter-card-top">
          <span class="quarter-badge">{{ item.key }}</span>
          <span class="quarter-meta">{{ item.range }} · {{ item.count }} 筆回簽</span>
        </div>
        <div class="quarter-hero">
          <span class="quarter-hero-label">應計獎金</span>
          <strong class="quarter-hero-amount" :class="{ 'is-muted': !multipliersApply(item.key) }">
            {{ multipliersApply(item.key) ? money.format(item.final) : '無法計算' }}
          </strong>
          <p v-if="!multipliersApply(item.key)" class="quarter-hero-note">
            倍率自 {{ MULTIPLIER_START_KEY }} 起適用
          </p>
        </div>
        <div v-if="multipliersApply(item.key)" class="quarter-breakdown">
          <div class="quarter-breakdown-row">
            <span>簽約未連稅合計</span>
            <b>{{ money.format(item.taxExcludedAmount) }}</b>
          </div>
          <div class="quarter-breakdown-row">
            <span>基礎獎金小計</span>
            <b>{{ money.format(item.base) }}</b>
          </div>
          <div class="quarter-breakdown-row">
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
