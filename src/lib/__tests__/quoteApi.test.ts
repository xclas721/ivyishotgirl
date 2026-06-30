import { describe, expect, it } from 'vitest'
import { applyQuoteToRecord, isValidQuoteUrl, quoteResultMessage } from '@/lib/quoteApi'

describe('isValidQuoteUrl', () => {
  it('accepts quote.saiens.tw URLs only', () => {
    expect(isValidQuoteUrl('https://quote.saiens.tw/my/orders/1')).toBe(true)
    expect(isValidQuoteUrl('https://example.com/')).toBe(false)
    expect(isValidQuoteUrl('not-a-url')).toBe(false)
  })
})

describe('applyQuoteToRecord', () => {
  it('maps quote fields into a bonus record', () => {
    const record = applyQuoteToRecord(
      {
        orderNo: 'Q-001',
        customerName: '測試客戶',
        taxExcludedAmount: 100000,
        taxIncludedAmount: 105000,
        salesRep: 'Ivy 蔣慶瑤',
        signedMonth: '2026-05',
      },
      {
        id: 'quote.saiens.tw/my/orders/1',
        quoteUrl: 'https://quote.saiens.tw/my/orders/1',
        signedMonth: '2026-05',
        paidMonth: '2026-06',
        customerType: 'designer',
      },
    )

    expect(record.orderNo).toBe('Q-001')
    expect(record.salesRep).toBe('Ivy 蔣慶瑤')
    expect(record.taxExcludedAmount).toBe(100000)
    expect(record.customerType).toBe('designer')
  })

  it('preserves customer fields when resyncing', () => {
    const record = applyQuoteToRecord(
      { salesRep: '新業務' },
      {
        id: 'id-1',
        quoteUrl: 'https://quote.saiens.tw/x',
        signedMonth: '2026-05',
        paidMonth: '2026-06',
        customerType: 'personal',
        salesRep: 'Ivy 蔣慶瑤',
      },
      { preserveCustomerFields: true },
    )

    expect(record.customerType).toBe('personal')
    expect(record.salesRep).toBe('新業務')
  })
})

describe('quoteResultMessage', () => {
  it('returns ok message when no warnings', () => {
    expect(quoteResultMessage({}, '2026-05', '已重新同步')).toEqual(['已重新同步報價單。', 'ok'])
  })

  it('returns error tone when warnings exist', () => {
    expect(quoteResultMessage({ amountInferred: true }, '', '已重新同步')).toEqual([
      '已重新同步，但未抓到回簽月份，請手動選擇、金額為系統反推，請確認。',
      'error',
    ])
  })
})
