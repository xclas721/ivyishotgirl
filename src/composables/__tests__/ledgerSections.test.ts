import { describe, expect, it } from 'vitest'
import { useLedgerSections } from '@/composables/ledgerSections'

describe('useLedgerSections', () => {
  it('shows overview and records by default', () => {
    const { isSectionVisible } = useLedgerSections()
    expect(isSectionVisible('overview')).toBe(true)
    expect(isSectionVisible('records')).toBe(true)
    expect(isSectionVisible('signed')).toBe(false)
  })
})
