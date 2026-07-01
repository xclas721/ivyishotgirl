import { ref } from 'vue'
import type { LedgerTabId } from '@/components/ledger/LedgerTabs.vue'

const visibleSections = ref<LedgerTabId[]>(['overview', 'records'])

export function useLedgerSections() {
  function isSectionVisible(id: LedgerTabId) {
    return visibleSections.value.includes(id)
  }

  function ensureSectionVisible(id: LedgerTabId) {
    if (!visibleSections.value.includes(id)) {
      visibleSections.value = [...visibleSections.value, id]
    }
  }

  return { visibleSections, isSectionVisible, ensureSectionVisible }
}
