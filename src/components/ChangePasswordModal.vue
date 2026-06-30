<script setup lang="ts">
import { ref } from 'vue'
import { KeyRound, X } from 'lucide-vue-next'
import { changePassword } from '@/composables/gate'
import { validatePasswordChange } from '@/lib/passwordChange'

const open = defineModel<boolean>({ required: true })

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref('')
const busy = ref(false)

function resetForm() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  error.value = ''
  success.value = ''
}

function close() {
  if (busy.value) return
  open.value = false
  resetForm()
}

async function submit() {
  if (busy.value) return
  error.value = ''
  success.value = ''

  const validationError = validatePasswordChange(
    currentPassword.value,
    newPassword.value,
    confirmPassword.value,
  )
  if (validationError) {
    error.value = validationError
    return
  }

  busy.value = true
  try {
    await changePassword(currentPassword.value, newPassword.value)
    success.value = '密碼已更新'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    window.setTimeout(() => {
      if (open.value) close()
    }, 900)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '密碼更新失敗，請稍後再試。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fx-auth">
      <div v-if="open" class="password-modal-backdrop" @click.self="close">
        <form class="password-modal" @submit.prevent="submit">
          <div class="password-modal-head">
            <span class="password-modal-icon">
              <KeyRound :size="18" :stroke-width="1.6" />
            </span>
            <div>
              <h2 class="password-modal-title">修改密碼</h2>
              <p class="password-modal-sub">需輸入目前密碼以確認身分</p>
            </div>
            <button type="button" class="password-modal-close" aria-label="關閉" @click="close">
              <X :size="16" :stroke-width="2" />
            </button>
          </div>

          <label class="password-modal-field">
            目前密碼
            <input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              :disabled="busy"
            />
          </label>
          <label class="password-modal-field">
            新密碼
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              placeholder="至少 6 個字元"
              :disabled="busy"
            />
          </label>
          <label class="password-modal-field">
            確認新密碼
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              :disabled="busy"
            />
          </label>

          <p v-if="error" class="password-modal-message password-modal-message--error">
            {{ error }}
          </p>
          <p v-if="success" class="password-modal-message password-modal-message--ok">
            {{ success }}
          </p>

          <div class="password-modal-actions">
            <button type="button" class="secondary" :disabled="busy" @click="close">取消</button>
            <button type="submit" :disabled="busy">
              {{ busy ? '更新中…' : '更新密碼' }}
            </button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
