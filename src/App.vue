<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { LayoutDashboard, ScrollText } from 'lucide-vue-next'
</script>

<template>
  <div class="site-layout">
    <nav class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-brand">季度獎金帳本</span>
        <span class="sidebar-sub">Saiens AM</span>
      </div>
      <ul class="sidebar-nav">
        <li>
          <RouterLink class="sidebar-link" to="/">
            <LayoutDashboard class="sidebar-icon" :size="15" :stroke-width="1.8" />
            帳本計算機
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
      <RouterView />
    </div>
  </div>
</template>
