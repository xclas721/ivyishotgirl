<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { multipliersApply, MULTIPLIER_START_KEY } from '@/shared/fiscalQuarter'
import type { Quarter } from '@/shared/fiscalQuarter'
import type { QuarterMultiplier } from '@/lib/db'
import {
  dbError,
  isLoading,
  multiplierYears,
  displayedYears,
  selectedYear,
  ensureLoaded,
  multiplierFor,
  updateMultiplier,
  addYear,
} from '@/composables/ledger'

const multiplierFields: (keyof QuarterMultiplier)[] = [
  'rocket',
  'repurchase',
  'avgOrder',
  'yieldRate',
]
const multiplierFieldLabels: Record<keyof QuarterMultiplier, string> = {
  rocket: '業績火箭倍率',
  repurchase: '回購倍率',
  avgOrder: '客單價倍率',
  yieldRate: '成材率倍率',
}

const newYear = ref('')
const status = reactive({ message: '', tone: '' })

onMounted(() => {
  void ensureLoaded()
})

function commitAddYear() {
  const result = addYear(newYear.value)
  status.message = result.message
  status.tone = result.ok ? 'ok' : 'error'
  if (result.ok) newYear.value = ''
}
</script>

<template>
  <main class="app-shell">
    <div v-if="isLoading" class="db-loading">資料讀取中…</div>
    <div v-if="dbError" class="db-error-banner">
      {{ dbError }}
      <button type="button" class="db-error-close" @click="dbError = ''">×</button>
    </div>
    <header class="page-head">
      <div>
        <h1>季度倍率設定</h1>
        <p>
          同一回簽季度的案件共用同一組倍率。倍率存在資料庫的 quarter_multipliers，不存在每筆案件裡。
        </p>
      </div>
    </header>

    <section class="panel">
      <div class="section-head">
        <h2>各季度倍率</h2>
        <div class="tool-row">
          <label v-if="multiplierYears.length" class="year-filter">
            年度
            <select v-model="selectedYear">
              <option value="all">全部</option>
              <option v-for="year in multiplierYears" :key="year" :value="year">{{ year }}</option>
            </select>
          </label>
          <input
            v-model="newYear"
            type="text"
            placeholder="YYYY"
            style="width: 90px"
            @keydown.enter="commitAddYear"
          />
          <button class="secondary" type="button" @click="commitAddYear">新增年份</button>
        </div>
      </div>
      <p v-if="status.message" class="status" :class="status.tone">{{ status.message }}</p>
      <div v-if="multiplierYears.length === 0" class="empty">
        尚無年份設定。新增報價單後會依回簽季度自動出現，也可輸入年份按「新增年份」。
      </div>
      <div v-for="year in displayedYears" v-else :key="year" class="year-block">
        <h3>{{ year }}</h3>
        <div
          v-for="quarter in ['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]"
          :key="`${year}-${quarter}`"
          class="quarter-setting"
          :class="{ 'no-multiplier': !multipliersApply(`${year}-${quarter}`) }"
        >
          <strong>
            {{ `${year}-${quarter}` }}
            <span v-if="!multipliersApply(`${year}-${quarter}`)" class="no-mult-tag">無倍率</span>
          </strong>
          <p v-if="!multipliersApply(`${year}-${quarter}`)" class="hint">
            此季度只計基礎獎金，不套用倍率（倍率自 {{ MULTIPLIER_START_KEY }} 起適用）。
          </p>
          <div v-else class="multiplier-grid">
            <label v-for="field in multiplierFields" :key="field">
              {{ multiplierFieldLabels[field] }}
              <input
                :value="multiplierFor(`${year}-${quarter}`)[field]"
                type="number"
                min="0"
                step="0.01"
                @input="
                  updateMultiplier(
                    `${year}-${quarter}`,
                    field,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
