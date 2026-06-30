<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import QuarterFilter from '@/components/ui/QuarterFilter.vue'
import { filterContextLabel } from '@/composables/ledger'

const route = useRoute()

const showBar = computed(() => route.path === '/' || route.path === '/multipliers')
</script>

<template>
  <div v-if="showBar" class="quarter-context-bar">
    <div class="quarter-context-main">
      <p class="quarter-context-label">工作季度</p>
      <p class="quarter-context-title">{{ filterContextLabel }}</p>
      <p class="quarter-context-hint">篩選看回簽月份，實領看收款月份</p>
    </div>
    <QuarterFilter />
  </div>
</template>
