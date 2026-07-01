import type { BonusRecord } from '@/lib/db'
import { getFiscalQuarter } from '@/shared/fiscalQuarter'
import { customerTypeLabel } from '@/shared/customerType'

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ')
}

export function recordSearchHaystack(record: BonusRecord): string {
  const signedQuarter = getFiscalQuarter(record.signedMonth)
  const paidQuarter = getFiscalQuarter(record.paidMonth)

  return [
    record.orderNo,
    record.customerName,
    record.salesRep,
    record.quoteUrl,
    customerTypeLabel(record.customerType),
    record.signedMonth,
    record.paidMonth,
    signedQuarter.key,
    paidQuarter.key,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchesRecordSearch(record: BonusRecord, query: string): boolean {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return true

  const haystack = recordSearchHaystack(record)
  const tokens = normalized.toLowerCase().split(' ')

  return tokens.every((token) => haystack.includes(token))
}

export function filterRecordsBySearch(records: BonusRecord[], query: string): BonusRecord[] {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return records
  return records.filter((record) => matchesRecordSearch(record, normalized))
}
