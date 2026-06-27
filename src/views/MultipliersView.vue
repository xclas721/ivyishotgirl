<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { Quarter } from '@/shared/fiscalQuarter'
import type { QuarterMultiplier } from '@/lib/db'
import {
  dbError,
  isLoading,
  multiplierYears,
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
      <div v-for="year in multiplierYears" v-else :key="year" class="year-block">
        <h3>{{ year }}</h3>
        <div
          v-for="quarter in ['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]"
          :key="`${year}-${quarter}`"
          class="quarter-setting"
        >
          <strong>{{ `${year}-${quarter}` }}</strong>
          <div class="multiplier-grid">
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
