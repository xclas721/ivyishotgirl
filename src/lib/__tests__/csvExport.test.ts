import { describe, expect, it } from 'vitest'
import {
  buildCsvExportFilename,
  csvExportQuarterSlug,
  csvExportTimestamp,
} from '@/lib/csvExport'

describe('csvExportQuarterSlug', () => {
  it('uses all when year and quarter are all', () => {
    expect(csvExportQuarterSlug({ selectedYear: 'all', selectedQuarter: 'all' })).toBe('all')
  })

  it('uses year-quarter when both are set', () => {
    expect(csvExportQuarterSlug({ selectedYear: 2026, selectedQuarter: 'Q2' })).toBe('2026-Q2')
  })

  it('uses year-all when only year is set', () => {
    expect(csvExportQuarterSlug({ selectedYear: 2026, selectedQuarter: 'all' })).toBe('2026-all')
  })

  it('uses all-quarter when only quarter is set', () => {
    expect(csvExportQuarterSlug({ selectedYear: 'all', selectedQuarter: 'Q3' })).toBe('all-Q3')
  })
})

describe('csvExportTimestamp', () => {
  it('formats local date and time as YYYYMMDD-HHmm', () => {
    expect(csvExportTimestamp(new Date(2026, 5, 30, 17, 45))).toBe('20260630-1745')
  })
})

describe('buildCsvExportFilename', () => {
  it('combines product prefix, quarter slug, and timestamp', () => {
    expect(
      buildCsvExportFilename(
        { selectedYear: 2026, selectedQuarter: 'Q2' },
        new Date(2026, 5, 30, 8, 5),
      ),
    ).toBe('ivy-bonus-2026-Q2-20260630-0805.csv')
  })
})
