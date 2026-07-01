import { getFiscalQuarter } from '@/shared/fiscalQuarter'
import type { BonusRecord } from '@/lib/db'
import { finalCommissionDisplay } from '@/composables/ledgerSummary'

const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})

export function recordWarnings(record: BonusRecord) {
  const warnings = []
  if (!record.signedMonth) warnings.push('未抓到回簽月份，請手動選擇')
  if (record.customerType === 'unknown') warnings.push('請選擇客戶類型')
  if (record.amountInferred) warnings.push('金額為系統反推，請確認')
  return warnings.join('；')
}

export function formatFinalCommission(record: BonusRecord) {
  const value = finalCommissionDisplay(record)
  return value === '無法計算' ? '無法計算' : money.format(value)
}

export function quarterLabel(month: string) {
  return getFiscalQuarter(month).key || '—'
}
