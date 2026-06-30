<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { LayoutDashboard, LogOut, ScrollText, SlidersHorizontal } from 'lucide-vue-next'
import QuarterContextBar from '@/components/layout/QuarterContextBar.vue'
import PasswordGate from '@/components/PasswordGate.vue'
import { isUnlocked, authReady, lock } from '@/composables/gate'

async function handleLogout() {
  await lock()
}
</script>

<template>
  <template v-if="!authReady" />
  <Transition v-else name="fx-auth" mode="out-in">
    <PasswordGate v-if="!isUnlocked" key="gate" />
    <div v-else key="app" class="site-layout">
      <nav class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-brand">Ivy的獎金</span>
          <span class="sidebar-sub">季度獎金帳本</span>
        </div>
        <ul class="sidebar-nav">
          <li>
            <RouterLink class="sidebar-link" to="/">
              <LayoutDashboard class="sidebar-icon" :size="15" :stroke-width="1.8" />
              <span class="sidebar-link-label sidebar-link-label--long">帳本計算機</span>
              <span class="sidebar-link-label sidebar-link-label--short">帳本</span>
            </RouterLink>
          </li>
          <li>
            <RouterLink class="sidebar-link" to="/multipliers">
              <SlidersHorizontal class="sidebar-icon" :size="15" :stroke-width="1.8" />
              <span class="sidebar-link-label sidebar-link-label--long">季度倍率</span>
              <span class="sidebar-link-label sidebar-link-label--short">倍率</span>
            </RouterLink>
          </li>
          <li>
            <RouterLink class="sidebar-link" to="/rules">
              <ScrollText class="sidebar-icon" :size="15" :stroke-width="1.8" />
              <span class="sidebar-link-label sidebar-link-label--long">獎金規則</span>
              <span class="sidebar-link-label sidebar-link-label--short">規則</span>
            </RouterLink>
          </li>
        </ul>
        <div class="sidebar-footer">
          <button type="button" class="sidebar-logout" @click="handleLogout">
            <LogOut class="sidebar-icon" :size="15" :stroke-width="1.8" />
            登出
          </button>
        </div>
      </nav>
      <div class="site-main">
        <QuarterContextBar />
        <RouterView v-slot="{ Component, route }">
          <Transition name="fx-page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </div>
    </div>
  </Transition>
</template>
