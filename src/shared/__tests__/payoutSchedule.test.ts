import { describe, expect, it } from 'vitest'
import {
  buildPayoutWave,
  getLatestPayoutWave,
  shiftPayoutWave,
} from '@/shared/payoutSchedule'

describe('buildPayoutWave', () => {
  it('maps payout months to work quarters', () => {
    expect(buildPayoutWave(2026, 5)).toMatchObject({
      paidMonth: '2026-05',
      workQuarterKey: '2026-Q1',
      payoutMonthLabel: '5 月發放',
    })
    expect(buildPayoutWave(2026, 8)).toMatchObject({
      paidMonth: '2026-08',
      workQuarterKey: '2026-Q2',
    })
    expect(buildPayoutWave(2026, 11)).toMatchObject({
      paidMonth: '2026-11',
      workQuarterKey: '2026-Q3',
    })
    expect(buildPayoutWave(2027, 2)).toMatchObject({
      paidMonth: '2027-02',
      workQuarterKey: '2026-Q4',
    })
  })
})

describe('getLatestPayoutWave', () => {
  it('picks August wave in early August', () => {
    expect(getLatestPayoutWave(new Date(2026, 7, 2))).toMatchObject({
      paidMonth: '2026-08',
      workQuarterKey: '2026-Q2',
    })
  })

  it('picks May wave in June', () => {
    expect(getLatestPayoutWave(new Date(2026, 5, 15))).toMatchObject({
      paidMonth: '2026-05',
      workQuarterKey: '2026-Q1',
    })
  })

  it('picks previous November in January', () => {
    expect(getLatestPayoutWave(new Date(2026, 0, 10))).toMatchObject({
      paidMonth: '2025-11',
      workQuarterKey: '2025-Q3',
    })
  })
})

describe('shiftPayoutWave', () => {
  it('walks across year boundary', () => {
    const feb = buildPayoutWave(2027, 2)
    expect(shiftPayoutWave(feb, -1)).toMatchObject({ paidMonth: '2026-11' })
    expect(shiftPayoutWave(feb, 1)).toMatchObject({ paidMonth: '2027-05' })
  })
})
