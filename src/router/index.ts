import { createRouter, createWebHistory } from 'vue-router'
import CalculatorView from '@/views/CalculatorView.vue'

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: CalculatorView },
    { path: '/rules', component: () => import('@/views/RulesView.vue') },
  ],
})
