<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import QuarterFilter from '@/components/ui/QuarterFilter.vue'
import LedgerTabs from '@/components/ledger/LedgerTabs.vue'
import { filterContextLabel } from '@/composables/ledger'
import { useLedgerSections } from '@/composables/ledgerSections'

const route = useRoute()
const { visibleSections } = useLedgerSections()

const showBar = computed(() => route.path === '/')
const showLedgerTabs = computed(() => route.path === '/')
</script>

<template>
  <div v-if="showBar" class="quarter-context-shell">
    <div class="quarter-context-bar">
      <p class="quarter-context-title">
        <span class="quarter-context-label">工作季度</span>
        {{ filterContextLabel }}
      </p>
      <QuarterFilter />
    </div>
    <LedgerTabs v-if="showLedgerTabs" v-model="visibleSections" layout="bar" />
  </div>
</template>
