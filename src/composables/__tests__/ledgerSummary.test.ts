import { beforeEach, describe, expect, it } from 'vitest'
import type { BonusRecord } from '@/lib/db'
import {
  baseCommissionFor,
  commissionRateForRecord,
  finalCommissionFor,
  isCommissionComputable,
  summarizeRecords,
} from '@/composables/ledgerSummary'
import { quarterMultipliers } from '@/composables/ledger'

function sampleRecord(overrides: Partial<BonusRecord> = {}): BonusRecord {
  return {
    id: 'rec-1',
    quoteUrl: 'https://quote.saiens.tw/x',
    orderNo: 'Q-001',
    customerName: '客戶',
    customerType: 'designer',
    salesRep: 'Ivy',
    taxExcludedAmount: 100_000,
    taxIncludedAmount: 105_000,
    signedMonth: '2026-05',
    paidMonth: '2026-06',
    amountInferred: false,
    amountDebug: {},
    signedAtText: '',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('ledgerSummary', () => {
  beforeEach(() => {
    quarterMultipliers.value = {
      '2026-Q2': { rocket: 2, repurchase: 1, avgOrder: 1, yieldRate: 1 },
    }
  })

  it('computes base commission from customer type rate after multiplier start', () => {
    expect(commissionRateForRecord(sampleRecord())).toBe(4)
    expect(baseCommissionFor(sampleRecord())).toBe(4000)
  })

  it('uses flat 3.5% without multipliers for 2026-Q1 and earlier', () => {
    const record = sampleRecord({ signedMonth: '2026-03', customerType: 'personal' })
    expect(isCommissionComputable(record)).toBe(true)
    expect(commissionRateForRecord(record)).toBe(3.5)
    expect(baseCommissionFor(record)).toBe(3500)
    expect(finalCommissionFor(record)).toBe(3500)
  })

  it('applies quarter multipliers for eligible records', () => {
    expect(finalCommissionFor(sampleRecord())).toBe(8000)
  })

  it('marks missing signed month as not computable', () => {
    const record = sampleRecord({ signedMonth: '' })
    expect(isCommissionComputable(record)).toBe(false)
    expect(finalCommissionFor(record)).toBe(0)
  })

  it('summarizes totals including legacy flat-rate quarters', () => {
    const result = summarizeRecords([
      sampleRecord(),
      sampleRecord({ id: 'rec-2', signedMonth: '2026-03' }),
      sampleRecord({ id: 'rec-3', signedMonth: '' }),
    ])

    expect(result.totals.count).toBe(3)
    expect(result.totals.final).toBe(8000 + 3500)
    expect(result.totals.uncomputableCount).toBe(1)
    expect(result.totals.taxExcludedAmount).toBe(300_000)
  })
})
