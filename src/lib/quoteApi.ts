import type { BonusRecord, CustomerType } from '@/lib/db'
import { defaultCustomerType } from '@/shared/customerType'

export interface QuoteResponse {
  quoteUrl?: string
  orderNo?: string
  customerName?: string
  customerType?: CustomerType
  taxExcludedAmount?: number
  taxIncludedAmount?: number
  defaultCommissionRate?: number
  amountInferred?: boolean
  amountDebug?: Record<string, unknown>
  signedAtText?: string
  signedMonth?: string
  signedQuarterKey?: string
  salesRep?: string
}

export function isValidQuoteUrl(inputUrl: string) {
  try {
    return new URL(inputUrl).hostname === 'quote.saiens.tw'
  } catch {
    return false
  }
}

export async function requestQuote(inputUrl: string): Promise<QuoteResponse> {
  const response = await fetch('/api/fetch-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: inputUrl }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    const detail = data?.detail || data?.message || `HTTP ${response.status}`
    const type = data?.errorType ? `（${data.errorType}）` : ''
    throw new Error(`${detail}${type}`)
  }
  return data.quote as QuoteResponse
}

export function applyQuoteToRecord(
  quote: QuoteResponse,
  base: {
    id: string
    quoteUrl: string
    signedMonth: string
    paidMonth: string
    customerType?: CustomerType
    salesRep?: string
  },
  options?: { preserveCustomerFields?: boolean },
): BonusRecord {
  const preserveCustomer = options?.preserveCustomerFields ?? false
  const customerType = preserveCustomer
    ? base.customerType || 'unknown'
    : base.customerType || defaultCustomerType()
  const salesRep = quote.salesRep || (preserveCustomer ? base.salesRep || '' : '')

  return {
    id: base.id,
    quoteUrl: quote.quoteUrl || base.quoteUrl,
    orderNo: quote.orderNo || '',
    customerName: quote.customerName || '',
    customerType,
    salesRep,
    taxExcludedAmount: Number(quote.taxExcludedAmount || 0),
    taxIncludedAmount: Number(quote.taxIncludedAmount || 0),
    signedMonth: base.signedMonth,
    paidMonth: base.paidMonth,
    amountInferred: Boolean(quote.amountInferred),
    amountDebug: quote.amountDebug || {},
    signedAtText: quote.signedAtText || '',
    updatedAt: new Date().toISOString(),
  }
}

export function quoteResultMessage(
  quote: QuoteResponse,
  finalSignedMonth: string,
  verb: string,
): [string, string] {
  const warnings = []
  if (!finalSignedMonth) warnings.push('未抓到回簽月份，請手動選擇')
  if (quote.amountInferred) warnings.push('金額為系統反推，請確認')
  return warnings.length
    ? [`${verb}，但${warnings.join('、')}。`, 'error']
    : [`${verb}報價單。`, 'ok']
}
