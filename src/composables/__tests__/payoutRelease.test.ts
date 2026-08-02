import { describe, expect, it } from 'vitest'
import type { BonusRecord } from '@/lib/db'
import { summarizePayoutRecords } from '@/composables/payoutRelease'
import { quarterMultipliers } from '@/composables/ledger'

function sample(overrides: Partial<BonusRecord> = {}): BonusRecord {
  return {
    id: '1',
    quoteUrl: '',
    orderNo: 'S1',
    customerName: 'A',
    customerType: 'designer',
    salesRep: '',
    taxExcludedAmount: 100_000,
    taxIncludedAmount: 105_000,
    signedMonth: '2026-06',
    paidMonth: '2026-08',
    amountInferred: false,
    amountDebug: {},
    signedAtText: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('summarizePayoutRecords', () => {
  it('sums final commission for payout-month records', () => {
    quarterMultipliers.value = {
      '2026-Q2': { rocket: 1, repurchase: 1, avgOrder: 1, yieldRate: 1 },
    }
    const result = summarizePayoutRecords([
      sample(),
      sample({ id: '2', taxExcludedAmount: 50_000, taxIncludedAmount: 52_500 }),
    ])
    // designer 4%: 4000 + 2000
    expect(result.final).toBe(6000)
    expect(result.count).toBe(2)
  })
})
