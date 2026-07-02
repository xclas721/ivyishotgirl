import { describe, expect, it } from 'vitest'
import type { BonusRecord } from '@/lib/db'
import {
  filterRecordsBySearch,
  matchesRecordSearch,
  normalizeSearchQuery,
  searchHighlightParts,
} from '@/composables/useRecordSearch'

const baseRecord: BonusRecord = {
  id: '1',
  quoteUrl: 'https://example.com/q/abc',
  orderNo: 'S12242',
  customerName: '春日町設計有限公司',
  customerType: 'designer',
  salesRep: 'Ivy 蔣慶瑤',
  signedMonth: '2026-06',
  paidMonth: '2026-06',
  taxExcludedAmount: 3600,
  taxIncludedAmount: 3780,
  signedAtText: '',
  amountDebug: {},
}

describe('normalizeSearchQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeSearchQuery('  春日   Ivy  ')).toBe('春日 Ivy')
  })
})

describe('matchesRecordSearch', () => {
  it('matches partial order number', () => {
    expect(matchesRecordSearch(baseRecord, '1224')).toBe(true)
  })

  it('matches customer name', () => {
    expect(matchesRecordSearch(baseRecord, '春日')).toBe(true)
  })

  it('matches sales rep', () => {
    expect(matchesRecordSearch(baseRecord, 'ivy')).toBe(true)
  })

  it('requires all tokens to match', () => {
    expect(matchesRecordSearch(baseRecord, '春日 Ivy')).toBe(true)
    expect(matchesRecordSearch(baseRecord, '春日 不存在')).toBe(false)
  })

  it('returns true for empty query', () => {
    expect(matchesRecordSearch(baseRecord, '   ')).toBe(true)
  })
})

describe('filterRecordsBySearch', () => {
  it('returns all records when query is empty', () => {
    expect(filterRecordsBySearch([baseRecord], '')).toEqual([baseRecord])
  })

  it('filters by query', () => {
    const other: BonusRecord = { ...baseRecord, id: '2', orderNo: 'S99999', customerName: '其他公司' }
    expect(filterRecordsBySearch([baseRecord, other], '春日')).toEqual([baseRecord])
  })
})

describe('searchHighlightParts', () => {
  it('marks matching segments case-insensitively', () => {
    expect(searchHighlightParts('S12242', '1224')).toEqual([
      { text: 'S', match: false },
      { text: '1224', match: true },
      { text: '2', match: false },
    ])
  })

  it('returns plain text when query is empty', () => {
    expect(searchHighlightParts('春日町', '')).toEqual([{ text: '春日町', match: false }])
  })
})
