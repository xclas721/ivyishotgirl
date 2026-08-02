import { describe, expect, it } from 'vitest'
import {
  buildPayoutWave,
  getLatestPayoutWave,
  recordMatchesPayoutWave,
  shiftPayoutWave,
} from '@/shared/payoutSchedule'

describe('buildPayoutWave', () => {
  it('maps company payout months to collection quarters', () => {
    expect(buildPayoutWave(2026, 5)).toMatchObject({
      collectionQuarterKey: '2026-Q1',
      payoutMonthLabel: '5 月發放',
    })
    expect(buildPayoutWave(2026, 8)).toMatchObject({
      collectionQuarterKey: '2026-Q2',
      collectionQuarterRange: '2026/05-2026/07',
    })
    expect(buildPayoutWave(2026, 11)).toMatchObject({
      collectionQuarterKey: '2026-Q3',
    })
    expect(buildPayoutWave(2027, 2)).toMatchObject({
      collectionQuarterKey: '2026-Q4',
    })
  })
})

describe('recordMatchesPayoutWave', () => {
  const q2Wave = buildPayoutWave(2026, 8)

  it('includes May–July paid months for August payout (Q2)', () => {
    expect(recordMatchesPayoutWave('2026-05', q2Wave)).toBe(true)
    expect(recordMatchesPayoutWave('2026-06', q2Wave)).toBe(true)
    expect(recordMatchesPayoutWave('2026-07', q2Wave)).toBe(true)
  })

  it('excludes August paid month from August company payout wave', () => {
    expect(recordMatchesPayoutWave('2026-08', q2Wave)).toBe(false)
  })
})

describe('getLatestPayoutWave', () => {
  it('picks August wave in early August', () => {
    expect(getLatestPayoutWave(new Date(2026, 7, 2))).toMatchObject({
      payoutMonth: 8,
      collectionQuarterKey: '2026-Q2',
    })
  })

  it('picks May wave in June', () => {
    expect(getLatestPayoutWave(new Date(2026, 5, 15))).toMatchObject({
      payoutMonth: 5,
      collectionQuarterKey: '2026-Q1',
    })
  })
})

describe('shiftPayoutWave', () => {
  it('walks across year boundary', () => {
    const feb = buildPayoutWave(2027, 2)
    expect(shiftPayoutWave(feb, -1)).toMatchObject({
      payoutMonth: 11,
      payoutYear: 2026,
    })
    expect(shiftPayoutWave(feb, 1)).toMatchObject({
      payoutMonth: 5,
      payoutYear: 2027,
    })
  })
})
