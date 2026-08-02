import { getFiscalQuarter } from '@/shared/fiscalQuarter'

/**
 * Company bonus disbursement months (公司發獎金月):
 * - 5月發 → 統計收款季度 Q1（2–4 月收款）
 * - 8月發 → 統計收款季度 Q2（5–7 月收款）
 * - 11月發 → 統計收款季度 Q3（8–10 月收款）
 * - 2月發 → 統計收款季度前一年 Q4（11–12 + 1 月收款）
 */
export const PAYOUT_MONTHS = [5, 8, 11, 2] as const

export type PayoutMonth = (typeof PAYOUT_MONTHS)[number]

export interface PayoutWave {
  /** Calendar year of the company disbursement month */
  payoutYear: number
  /** 5 | 8 | 11 | 2 */
  payoutMonth: PayoutMonth
  /** 收款季度 this wave pays out, e.g. 2026-Q2 */
  collectionQuarterKey: string
  /** Human range for collection quarter, e.g. 2026/05-2026/07 */
  collectionQuarterRange: string
  /** Title fragment, e.g. 8 月發放 */
  payoutMonthLabel: string
}

function collectionQuarterForPayout(payoutYear: number, payoutMonth: PayoutMonth) {
  // 5月發 → Q1；8月發 → Q2；11月發 → Q3；2月發 → 前一年 Q4
  if (payoutMonth === 5) {
    return getFiscalQuarter(`${payoutYear}-03`)
  }
  if (payoutMonth === 8) {
    return getFiscalQuarter(`${payoutYear}-06`)
  }
  if (payoutMonth === 11) {
    return getFiscalQuarter(`${payoutYear}-09`)
  }
  // February pays previous fiscal Q4 collections
  return getFiscalQuarter(`${payoutYear}-01`)
}

export function buildPayoutWave(payoutYear: number, payoutMonth: PayoutMonth): PayoutWave {
  const collection = collectionQuarterForPayout(payoutYear, payoutMonth)
  return {
    payoutYear,
    payoutMonth,
    collectionQuarterKey: collection.key,
    collectionQuarterRange: collection.range,
    payoutMonthLabel: `${payoutMonth} 月發放`,
  }
}

/**
 * Latest payout wave on or before `asOf` (default: today).
 * Jan → previous Nov; before Feb → previous Nov.
 */
export function getLatestPayoutWave(asOf: Date = new Date()): PayoutWave {
  const year = asOf.getFullYear()
  const month = asOf.getMonth() + 1

  if (month >= 11) return buildPayoutWave(year, 11)
  if (month >= 8) return buildPayoutWave(year, 8)
  if (month >= 5) return buildPayoutWave(year, 5)
  if (month >= 2) return buildPayoutWave(year, 2)
  return buildPayoutWave(year - 1, 11)
}

/** Step to previous / next company payout wave. */
export function shiftPayoutWave(wave: PayoutWave, delta: -1 | 1): PayoutWave {
  const order: PayoutMonth[] = [2, 5, 8, 11]
  const index = order.indexOf(wave.payoutMonth)
  let nextIndex = index + delta
  let year = wave.payoutYear

  if (nextIndex < 0) {
    nextIndex = order.length - 1
    year -= 1
  } else if (nextIndex >= order.length) {
    nextIndex = 0
    year += 1
  }

  return buildPayoutWave(year, order[nextIndex]!)
}

/** True when a record's 收款月份 falls in this wave's 收款季度. */
export function recordMatchesPayoutWave(
  paidMonth: string,
  wave: Pick<PayoutWave, 'collectionQuarterKey'>,
): boolean {
  const key = getFiscalQuarter(paidMonth).key
  return Boolean(key) && key === wave.collectionQuarterKey
}
