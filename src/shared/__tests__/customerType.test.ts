import { describe, expect, it } from 'vitest'
import {
  commissionRateFor,
  customerTypeLabel,
  defaultCustomerType,
  normalizeCustomerType,
} from '@/shared/customerType'

describe('normalizeCustomerType', () => {
  it('normalizes known customer types', () => {
    expect(normalizeCustomerType('designer')).toBe('designer')
    expect(normalizeCustomerType('personal')).toBe('personal')
  })

  it('maps legacy company to designer', () => {
    expect(normalizeCustomerType('company')).toBe('designer')
  })

  it('falls back to unknown for unrecognized values', () => {
    expect(normalizeCustomerType('')).toBe('unknown')
    expect(normalizeCustomerType('other')).toBe('unknown')
  })
})

describe('commissionRateFor', () => {
  it('returns configured rates by type', () => {
    expect(commissionRateFor('biz')).toBe(2)
    expect(commissionRateFor('kitchen')).toBe(3)
    expect(commissionRateFor('designer')).toBe(4)
    expect(commissionRateFor('personal')).toBe(5)
    expect(commissionRateFor('unknown')).toBe(4)
  })
})

describe('customerTypeLabel', () => {
  it('returns human-readable labels', () => {
    expect(customerTypeLabel('biz')).toBe('商業合作')
    expect(customerTypeLabel('unknown')).toBe('未知')
  })
})

describe('defaultCustomerType', () => {
  it('defaults to designer', () => {
    expect(defaultCustomerType()).toBe('designer')
  })
})
