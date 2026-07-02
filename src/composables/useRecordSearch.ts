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

export interface SearchHighlightPart {
  text: string
  match: boolean
}

export function searchHighlightParts(text: string, query: string): SearchHighlightPart[] {
  const value = String(text ?? '')
  const normalized = normalizeSearchQuery(query)
  if (!normalized || !value) return [{ text: value, match: false }]

  const tokens = [...new Set(normalized.toLowerCase().split(' ').filter(Boolean))]
  if (tokens.length === 0) return [{ text: value, match: false }]

  const lower = value.toLowerCase()
  const ranges: Array<{ start: number; end: number }> = []

  for (const token of tokens) {
    let index = 0
    while (index < lower.length) {
      const found = lower.indexOf(token, index)
      if (found === -1) break
      ranges.push({ start: found, end: found + token.length })
      index = found + token.length
    }
  }

  if (ranges.length === 0) return [{ text: value, match: false }]

  ranges.sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) {
      merged.push({ ...range })
      continue
    }
    last.end = Math.max(last.end, range.end)
  }

  const parts: SearchHighlightPart[] = []
  let cursor = 0
  for (const range of merged) {
    if (cursor < range.start) {
      parts.push({ text: value.slice(cursor, range.start), match: false })
    }
    parts.push({ text: value.slice(range.start, range.end), match: true })
    cursor = range.end
  }
  if (cursor < value.length) {
    parts.push({ text: value.slice(cursor), match: false })
  }

  return parts.filter((part) => part.text)
}
