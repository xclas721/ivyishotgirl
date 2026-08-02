import { describe, expect, it } from 'vitest'
import type { BonusRecord } from '@/lib/db'
import { formatFinalCommission, quarterLabel, recordWarnings } from '@/composables/useRecordDisplay'

const baseRecord: BonusRecord = {
  id: '1',
  quoteUrl: '',
  orderNo: '',
  customerName: '',
  customerType: 'designer',
  salesRep: '',
  signedMonth: '2026-03',
  paidMonth: '2026-05',
  taxExcludedAmount: 100000,
  taxIncludedAmount: 105000,
  signedAtText: '',
  amountDebug: {},
}

describe('recordWarnings', () => {
  it('flags missing signed month and unknown customer type', () => {
    expect(
      recordWarnings({ ...baseRecord, signedMonth: '', customerType: 'unknown' }),
    ).toContain('回簽月份')
  })
})

describe('quarterLabel', () => {
  it('returns fiscal quarter key', () => {
    expect(quarterLabel('2026-03')).toBe('2026-Q1')
  })
})

describe('formatFinalCommission', () => {
  it('formats legacy flat-rate quarters as money', () => {
    // 100000 × 3.5% = 3500
    expect(formatFinalCommission({ ...baseRecord, signedMonth: '2026-03' })).toMatch(/3,?500/)
  })

  it('returns label when signed month is missing', () => {
    expect(formatFinalCommission({ ...baseRecord, signedMonth: '' })).toBe('無法計算')
  })
})
