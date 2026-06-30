import { computed } from 'vue'
import { getFiscalQuarter, multipliersApply } from '@/shared/fiscalQuarter'
import type { QuarterInfo } from '@/shared/fiscalQuarter'
import type { BonusRecord } from '@/lib/db'
import { commissionRateFor } from '@/shared/customerType'
import { visibleRecords, paidVisibleRecords, multiplierFor, toNumber } from '@/composables/ledger'

export interface QuarterSummary extends QuarterInfo {
  count: number
  computableCount: number
  final: number
  base: number
  taxExcludedAmount: number
}

export interface LedgerSummaryResult {
  totals: {
    final: number
    taxExcludedAmount: number
    taxIncludedAmount: number
    uncomputableCount: number
    count: number
  }
  signed: QuarterSummary[]
  paid: QuarterSummary[]
}

export function baseCommissionFor(record: BonusRecord) {
  const rate = commissionRateFor(record.customerType)
  return (toNumber(record.taxExcludedAmount) * rate) / 100
}

export function isCommissionComputable(record: BonusRecord): boolean {
  return multipliersApply(getFiscalQuarter(record.signedMonth).key)
}

export function finalCommissionFor(record: BonusRecord) {
  const signedQuarter = getFiscalQuarter(record.signedMonth).key
  if (!multipliersApply(signedQuarter)) return 0
  const multiplier = multiplierFor(signedQuarter)
  return Math.round(
    baseCommissionFor(record) *
      toNumber(multiplier.rocket || 1) *
      toNumber(multiplier.repurchase || 1) *
      toNumber(multiplier.avgOrder || 1) *
      toNumber(multiplier.yieldRate || 1),
  )
}

export function finalCommissionDisplay(record: BonusRecord): number | '無法計算' {
  if (!isCommissionComputable(record)) return '無法計算'
  return finalCommissionFor(record)
}

function ensureSummary(map: Map<string, QuarterSummary>, quarter: QuarterInfo) {
  if (!map.has(quarter.key)) {
    map.set(quarter.key, {
      ...quarter,
      count: 0,
      computableCount: 0,
      final: 0,
      base: 0,
      taxExcludedAmount: 0,
    })
  }
}

export function summarizeRecords(source: BonusRecord[]): LedgerSummaryResult {
  const signed = new Map<string, QuarterSummary>()
  const paid = new Map<string, QuarterSummary>()
  const totals = {
    final: 0,
    taxExcludedAmount: 0,
    taxIncludedAmount: 0,
    uncomputableCount: 0,
    count: source.length,
  }

  source.forEach((record) => {
    const signedQuarter = getFiscalQuarter(record.signedMonth)
    const paidQuarter = getFiscalQuarter(record.paidMonth)
    const computable = multipliersApply(signedQuarter.key)
    const final = computable ? finalCommissionFor(record) : 0
    if (computable) totals.final += final
    else totals.uncomputableCount += 1
    totals.taxExcludedAmount += toNumber(record.taxExcludedAmount)
    totals.taxIncludedAmount += toNumber(record.taxIncludedAmount)

    if (signedQuarter.key) {
      ensureSummary(signed, signedQuarter)
      const item = signed.get(signedQuarter.key)
      if (item) {
        item.count += 1
        item.taxExcludedAmount += toNumber(record.taxExcludedAmount)
        item.base += baseCommissionFor(record)
        if (computable) {
          item.computableCount += 1
          item.final += final
        }
      }
    }

    if (paidQuarter.key) {
      ensureSummary(paid, paidQuarter)
      const item = paid.get(paidQuarter.key)
      if (item) {
        item.count += 1
        if (computable) {
          item.computableCount += 1
          item.final += final
        }
      }
    }
  })

  return {
    totals,
    signed: Array.from(signed.values()).sort((a, b) => b.order - a.order),
    paid: Array.from(paid.values()).sort((a, b) => b.order - a.order),
  }
}

export const ledgerSummary = computed(() => summarizeRecords(visibleRecords.value))
export const payoutSummary = computed(() => summarizeRecords(paidVisibleRecords.value))

export const accrualTotal = computed(() => ledgerSummary.value.totals.final)
export const payoutTotal = computed(() => payoutSummary.value.totals.final)
