<script setup lang="ts">
import { dbError, isLoading } from '@/composables/ledger'
</script>

<template>
  <div v-if="isLoading" class="db-loading">資料讀取中…</div>
  <div v-if="dbError" class="db-error-banner">
    {{ dbError }}
    <button type="button" class="db-error-close" @click="dbError = ''">×</button>
  </div>
</template>
