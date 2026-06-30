<script setup lang="ts">
import { ref } from 'vue'
import { Lock } from 'lucide-vue-next'
import { tryUnlock } from '@/composables/gate'

const password = ref('')
const error = ref('')
const busy = ref(false)
const shake = ref(false)

function triggerShake() {
  shake.value = false
  requestAnimationFrame(() => {
    shake.value = true
    window.setTimeout(() => {
      shake.value = false
    }, 480)
  })
}

async function submit() {
  if (busy.value || !password.value) return
  error.value = ''
  busy.value = true
  try {
    const ok = await tryUnlock(password.value)
    if (!ok) {
      error.value = '密碼錯誤'
      password.value = ''
      triggerShake()
    }
  } catch (err) {
    error.value = (err as Error).message || '驗證失敗，請稍後再試。'
    triggerShake()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="gate">
    <form class="gate-card" :class="{ 'fx-shake': shake }" @submit.prevent="submit">
      <span class="gate-icon">
        <Lock :size="20" :stroke-width="1.6" />
      </span>
      <h1 class="gate-title">Ivy的獎金</h1>
      <p class="gate-sub">請輸入密碼進入</p>
      <input
        v-model="password"
        class="gate-input"
        type="password"
        inputmode="numeric"
        placeholder="密碼"
        autocomplete="current-password"
        :disabled="busy"
      />
      <button
        class="gate-btn"
        :class="{ 'fx-btn-loading': busy }"
        type="submit"
        :disabled="busy || !password"
      >
        {{ busy ? '驗證中…' : '進入' }}
      </button>
      <Transition name="fx-status">
        <p v-if="error" class="gate-error">{{ error }}</p>
      </Transition>
    </form>
  </main>
</template>

<style scoped>
.gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.gate-card {
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 28px 30px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 18px 50px -20px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.gate-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--color-copper);
  background: rgba(168, 113, 46, 0.1);
  border: 1px solid rgba(168, 113, 46, 0.2);
}

.gate-title {
  margin: 6px 0 0;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--color-ink);
}

.gate-sub {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--color-muted);
}

.gate-input {
  width: 100%;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
  font-size: 15px;
  text-align: center;
  letter-spacing: 0.2em;
  color: var(--color-ink);
}

.gate-input:focus {
  outline: none;
  border-color: var(--color-copper);
  box-shadow: 0 0 0 3px rgba(168, 113, 46, 0.15);
}

.gate-btn {
  width: 100%;
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  background: var(--color-copper);
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.gate-btn:hover:not(:disabled) {
  background: var(--color-copper-dark);
}

.gate-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.gate-error {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--color-danger);
}
</style>
