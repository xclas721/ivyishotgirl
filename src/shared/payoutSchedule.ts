import { getFiscalQuarter } from '@/shared/fiscalQuarter'

/** Company payout months: May / Aug / Nov / Feb. */
export const PAYOUT_MONTHS = [5, 8, 11, 2] as const

export type PayoutMonth = (typeof PAYOUT_MONTHS)[number]

export interface PayoutWave {
  /** Calendar year of the payout (領錢) month */
  payoutYear: number
  /** 5 | 8 | 11 | 2 */
  payoutMonth: PayoutMonth
  /** YYYY-MM of 收款／領錢 */
  paidMonth: string
  /** Work quarter this wave pays for, e.g. 2026-Q2 */
  workQuarterKey: string
  /** Human range for work quarter, e.g. 2026/05-2026/07 */
  workQuarterRange: string
  /** Title fragment, e.g. 8 月發放 */
  payoutMonthLabel: string
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function workQuarterForPayout(payoutYear: number, payoutMonth: PayoutMonth) {
  // 5月領 → Q1；8月領 → Q2；11月領 → Q3；2月領 → 前一年 Q4
  if (payoutMonth === 5) {
    return getFiscalQuarter(`${payoutYear}-03`)
  }
  if (payoutMonth === 8) {
    return getFiscalQuarter(`${payoutYear}-06`)
  }
  if (payoutMonth === 11) {
    return getFiscalQuarter(`${payoutYear}-09`)
  }
  // February pays previous fiscal Q4
  return getFiscalQuarter(`${payoutYear}-01`)
}

export function buildPayoutWave(payoutYear: number, payoutMonth: PayoutMonth): PayoutWave {
  const work = workQuarterForPayout(payoutYear, payoutMonth)
  return {
    payoutYear,
    payoutMonth,
    paidMonth: `${payoutYear}-${pad2(payoutMonth)}`,
    workQuarterKey: work.key,
    workQuarterRange: work.range,
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

export function isPayoutMonthString(monthString: string): boolean {
  if (!/^\d{4}-(0[2-9]|1[0-2])$/.test(monthString)) return false
  const month = Number(monthString.slice(5))
  return (PAYOUT_MONTHS as readonly number[]).includes(month)
}
