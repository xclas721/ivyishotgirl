<script setup lang="ts">
import { computed } from 'vue'
import { searchHighlightParts } from '@/composables/useRecordSearch'

const props = defineProps<{
  text: string
  query: string
}>()

const parts = computed(() => searchHighlightParts(props.text, props.query))
</script>

<template>
  <span class="search-highlight">
    <template v-for="(part, index) in parts" :key="index">
      <mark v-if="part.match" class="search-highlight-mark">{{ part.text }}</mark>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
