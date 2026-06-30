import { describe, expect, it } from 'vitest'
import { getFiscalQuarter, multipliersApply, MULTIPLIER_START_KEY } from '@/shared/fiscalQuarter'

describe('getFiscalQuarter', () => {
  it('maps calendar months to fiscal quarters', () => {
    expect(getFiscalQuarter('2026-03')).toMatchObject({ year: 2026, quarter: 'Q1', key: '2026-Q1' })
    expect(getFiscalQuarter('2026-06')).toMatchObject({ year: 2026, quarter: 'Q2', key: '2026-Q2' })
    expect(getFiscalQuarter('2026-09')).toMatchObject({ year: 2026, quarter: 'Q3', key: '2026-Q3' })
    expect(getFiscalQuarter('2026-11')).toMatchObject({ year: 2026, quarter: 'Q4', key: '2026-Q4' })
  })

  it('assigns January to previous year Q4', () => {
    expect(getFiscalQuarter('2027-01')).toMatchObject({ year: 2026, quarter: 'Q4', key: '2026-Q4' })
  })

  it('returns empty info for invalid month strings', () => {
    expect(getFiscalQuarter('')).toMatchObject({ year: 0, quarter: '', key: '' })
    expect(getFiscalQuarter('2026')).toMatchObject({ year: 0, quarter: '', key: '' })
  })
})

describe('multipliersApply', () => {
  it('applies multipliers from MULTIPLIER_START_KEY onward', () => {
    expect(MULTIPLIER_START_KEY).toBe('2026-Q2')
    expect(multipliersApply('2026-Q1')).toBe(false)
    expect(multipliersApply('2026-Q2')).toBe(true)
    expect(multipliersApply('2027-Q1')).toBe(true)
  })
})
