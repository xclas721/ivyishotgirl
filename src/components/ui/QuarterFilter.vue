<script setup lang="ts">
import type { Quarter } from '@/shared/fiscalQuarter'
import { filterYears, selectedQuarter, selectedYear } from '@/composables/ledger'
</script>

<template>
  <div class="quarter-filter">
    <label v-if="filterYears.length" class="year-filter">
      年度
      <select v-model="selectedYear">
        <option value="all">全部</option>
        <option v-for="year in filterYears" :key="year" :value="year">{{ year }}</option>
      </select>
    </label>
    <label class="year-filter">
      季度
      <select v-model="selectedQuarter">
        <option value="all">全部</option>
        <option v-for="q in ['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]" :key="q" :value="q">
          {{ q }}
        </option>
      </select>
    </label>
  </div>
</template>
