<script setup lang="ts">
import { ref } from 'vue'
import { dbError, isLoading, reloadLedger } from '@/composables/ledger'

const retrying = ref(false)

async function retryLoad() {
  if (retrying.value || isLoading.value) return
  retrying.value = true
  try {
    await reloadLedger()
  } catch {
    // ensureLoaded sets dbError
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <div v-if="isLoading" class="db-loading">資料讀取中…</div>
  <div v-if="dbError" class="db-error-banner">
    <span class="db-error-text">{{ dbError }}</span>
    <div class="db-error-actions">
      <button
        type="button"
        class="db-error-retry"
        :disabled="retrying || isLoading"
        @click="retryLoad"
      >
        {{ retrying ? '重試中…' : '重試' }}
      </button>
      <button type="button" class="db-error-close" aria-label="關閉" @click="dbError = ''">
        ×
      </button>
    </div>
  </div>
</template>
