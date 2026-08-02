import { describe, expect, it } from 'vitest'
import type { BonusRecord } from '@/lib/db'
import { summarizePayoutRecords } from '@/composables/payoutRelease'
import { quarterMultipliers } from '@/composables/ledger'
import { buildPayoutWave, recordMatchesPayoutWave } from '@/shared/payoutSchedule'

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
    paidMonth: '2026-06',
    amountInferred: false,
    amountDebug: {},
    signedAtText: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('August payout wave', () => {
  it('matches Q2 collection months May–July', () => {
    const wave = buildPayoutWave(2026, 8)
    const inWave = [
      sample({ id: 'a', paidMonth: '2026-05' }),
      sample({ id: 'b', paidMonth: '2026-07' }),
    ].filter((r) => recordMatchesPayoutWave(r.paidMonth, wave))
    expect(inWave).toHaveLength(2)
  })

  it('sums final commission for those records', () => {
    quarterMultipliers.value = {
      '2026-Q2': { rocket: 1, repurchase: 1, avgOrder: 1, yieldRate: 1 },
    }
    const result = summarizePayoutRecords([
      sample({ paidMonth: '2026-05' }),
      sample({ id: '2', paidMonth: '2026-07', taxExcludedAmount: 50_000 }),
    ])
    // designer 4%: 4000 + 2000
    expect(result.final).toBe(6000)
    expect(result.count).toBe(2)
  })
})
