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
    <p class="quarter-context-title">
      <span class="quarter-context-label">工作季度</span>
      {{ filterContextLabel }}
    </p>
    <QuarterFilter />
  </div>
</template>
