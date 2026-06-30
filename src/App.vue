<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  SlidersHorizontal,
  X,
} from 'lucide-vue-next'
import QuarterContextBar from '@/components/layout/QuarterContextBar.vue'
import PasswordGate from '@/components/PasswordGate.vue'
import ChangePasswordModal from '@/components/ChangePasswordModal.vue'
import { isUnlocked, authReady, lock } from '@/composables/gate'

const route = useRoute()
const sidebarOpen = ref(false)
const showChangePassword = ref(false)

function closeSidebar() {
  sidebarOpen.value = false
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function onChangePassword() {
  closeSidebar()
  showChangePassword.value = true
}

async function handleLogout() {
  closeSidebar()
  await lock()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeSidebar()
  }
}

function syncBodyScrollLock(open: boolean) {
  if (!window.matchMedia('(max-width: 768px)').matches) return
  document.body.style.overflow = open ? 'hidden' : ''
}

watch(
  () => route.path,
  () => {
    closeSidebar()
  },
)

watch(sidebarOpen, (open) => {
  syncBodyScrollLock(open)
})

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <template v-if="!authReady" />
  <Transition v-else name="fx-auth" mode="out-in">
    <PasswordGate v-if="!isUnlocked" key="gate" />
    <div v-else key="app" class="site-layout">
      <button
        type="button"
        class="sidebar-toggle"
        :aria-label="sidebarOpen ? '關閉選單' : '開啟選單'"
        :aria-expanded="sidebarOpen"
        @click="toggleSidebar"
      >
        <X v-if="sidebarOpen" :size="20" :stroke-width="1.8" aria-hidden="true" />
        <Menu v-else :size="20" :stroke-width="1.8" aria-hidden="true" />
      </button>

      <Transition name="sidebar-backdrop">
        <div
          v-if="sidebarOpen"
          class="sidebar-backdrop"
          aria-hidden="true"
          @click="closeSidebar"
        />
      </Transition>

      <nav class="sidebar" :class="{ 'is-open': sidebarOpen }" aria-label="主要導覽">
        <div class="sidebar-header">
          <span class="sidebar-brand">Ivy的獎金</span>
          <span class="sidebar-sub">季度獎金帳本</span>
        </div>
        <ul class="sidebar-nav">
          <li>
            <RouterLink class="sidebar-link" to="/" @click="closeSidebar">
              <LayoutDashboard class="sidebar-icon" :size="15" :stroke-width="1.8" />
              帳本計算機
            </RouterLink>
          </li>
          <li>
            <RouterLink class="sidebar-link" to="/multipliers" @click="closeSidebar">
              <SlidersHorizontal class="sidebar-icon" :size="15" :stroke-width="1.8" />
              季度倍率
            </RouterLink>
          </li>
          <li>
            <RouterLink class="sidebar-link" to="/rules" @click="closeSidebar">
              <ScrollText class="sidebar-icon" :size="15" :stroke-width="1.8" />
              獎金規則
            </RouterLink>
          </li>
        </ul>
        <div class="sidebar-footer">
          <button type="button" class="sidebar-logout" @click="onChangePassword">
            <KeyRound class="sidebar-icon" :size="15" :stroke-width="1.8" />
            修改密碼
          </button>
          <button type="button" class="sidebar-logout" @click="handleLogout">
            <LogOut class="sidebar-icon" :size="15" :stroke-width="1.8" />
            登出
          </button>
        </div>
      </nav>
      <div class="site-main">
        <QuarterContextBar />
        <RouterView v-slot="{ Component, route: activeRoute }">
          <Transition name="fx-page" mode="out-in">
            <component :is="Component" :key="activeRoute.path" />
          </Transition>
        </RouterView>
      </div>
      <ChangePasswordModal v-model="showChangePassword" />
    </div>
  </Transition>
</template>
