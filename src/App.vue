<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
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
            <svg
              class="sidebar-icon"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" opacity=".7" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity=".7" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity=".7" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" opacity=".7" />
            </svg>
            帳本計算機
          </RouterLink>
        </li>
        <li>
          <RouterLink class="sidebar-link" to="/rules">
            <svg
              class="sidebar-icon"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
                stroke="currentColor"
                stroke-width="1.2"
              />
              <path
                d="M5 5.5h6M5 8h6M5 10.5h4"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
              />
            </svg>
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
