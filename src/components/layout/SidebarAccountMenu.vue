<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { KeyRound, LogOut, MoreVertical } from 'lucide-vue-next'

const emit = defineEmits<{
  changePassword: []
  logout: []
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function toggleMenu() {
  open.value = !open.value
}

function closeMenu() {
  open.value = false
}

function onChangePassword() {
  closeMenu()
  emit('changePassword')
}

function onLogout() {
  closeMenu()
  emit('logout')
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return
  const root = rootRef.value
  if (root && !root.contains(event.target as Node)) {
    closeMenu()
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="rootRef" class="sidebar-footer">
    <div class="sidebar-footer-desktop">
      <button type="button" class="sidebar-logout" @click="emit('changePassword')">
        <KeyRound class="sidebar-icon" :size="15" :stroke-width="1.8" />
        修改密碼
      </button>
      <button type="button" class="sidebar-logout" @click="emit('logout')">
        <LogOut class="sidebar-icon" :size="15" :stroke-width="1.8" />
        登出
      </button>
    </div>

    <div class="sidebar-footer-mobile">
      <button
        type="button"
        class="sidebar-menu-trigger"
        aria-haspopup="menu"
        :aria-expanded="open"
        aria-label="帳號選單"
        @click.stop="toggleMenu"
      >
        <MoreVertical class="sidebar-icon" :size="18" :stroke-width="1.8" aria-hidden="true" />
      </button>

      <Transition name="sidebar-menu">
        <div v-if="open" class="sidebar-menu-panel" role="menu" @click.stop>
          <button type="button" role="menuitem" class="sidebar-menu-item" @click="onChangePassword">
            <KeyRound class="sidebar-icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
            修改密碼
          </button>
          <button type="button" role="menuitem" class="sidebar-menu-item" @click="onLogout">
            <LogOut class="sidebar-icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
            登出
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>
