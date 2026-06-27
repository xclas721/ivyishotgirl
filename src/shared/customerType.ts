export const CUSTOMER_TYPE_OPTIONS = [
  { value: 'personal', label: '個人業主', rate: 5 },
  { value: 'designer', label: '設計師', rate: 4 },
  { value: 'kitchen', label: '廚具商', rate: 3 },
  { value: 'biz', label: '商業合作', rate: 2 },
] as const

export type CustomerType =
  | (typeof CUSTOMER_TYPE_OPTIONS)[number]['value']
  | 'unknown'
  | 'company'

const RATE_BY_TYPE: Record<CustomerType, number> = {
  personal: 5,
  designer: 4,
  kitchen: 3,
  biz: 2,
  company: 4,
  unknown: 4,
}

export function defaultCustomerType(): CustomerType {
  return 'designer'
}

export function normalizeCustomerType(value: string | undefined | null): CustomerType {
  const raw = String(value ?? '').trim()
  if (raw === 'company') return 'designer'
  if (CUSTOMER_TYPE_OPTIONS.some((option) => option.value === raw)) {
    return raw as (typeof CUSTOMER_TYPE_OPTIONS)[number]['value']
  }
  return 'unknown'
}

export function commissionRateFor(type: CustomerType): number {
  return RATE_BY_TYPE[normalizeCustomerType(type)] ?? 4
}

export function customerTypeLabel(type: CustomerType): string {
  const normalized = normalizeCustomerType(type)
  const option = CUSTOMER_TYPE_OPTIONS.find((item) => item.value === normalized)
  return option?.label ?? '未知'
}

export function customerTypeCssClass(type: CustomerType): string {
  const normalized = normalizeCustomerType(type)
  if (normalized === 'unknown') return 'unknown'
  return normalized
}
