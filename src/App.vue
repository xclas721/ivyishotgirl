<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { LayoutDashboard, ScrollText, SlidersHorizontal } from 'lucide-vue-next'
import QuarterContextBar from '@/components/layout/QuarterContextBar.vue'
import PasswordGate from '@/components/PasswordGate.vue'
import { isUnlocked } from '@/composables/gate'
</script>

<template>
  <PasswordGate v-if="!isUnlocked" />
  <div v-else class="site-layout">
    <nav class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-brand">Ivy的獎金</span>
        <span class="sidebar-sub">季度獎金帳本</span>
      </div>
      <ul class="sidebar-nav">
        <li>
          <RouterLink class="sidebar-link" to="/">
            <LayoutDashboard class="sidebar-icon" :size="15" :stroke-width="1.8" />
            帳本計算機
          </RouterLink>
        </li>
        <li>
          <RouterLink class="sidebar-link" to="/multipliers">
            <SlidersHorizontal class="sidebar-icon" :size="15" :stroke-width="1.8" />
            季度倍率
          </RouterLink>
        </li>
        <li>
          <RouterLink class="sidebar-link" to="/rules">
            <ScrollText class="sidebar-icon" :size="15" :stroke-width="1.8" />
            獎金規則
          </RouterLink>
        </li>
      </ul>
    </nav>
    <div class="site-main">
      <QuarterContextBar />
      <RouterView />
    </div>
  </div>
</template>
