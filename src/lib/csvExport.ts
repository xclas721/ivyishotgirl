import { getFiscalQuarter, multipliersApply } from '@/shared/fiscalQuarter'
import type { BonusRecord } from '@/lib/db'
import { commissionRateFor, customerTypeLabel } from '@/shared/customerType'
import { multiplierFor, multiplierSummary } from '@/composables/ledger'
import { finalCommissionDisplay } from '@/composables/ledgerSummary'

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function amountDebugText(debug: Record<string, unknown> = {}) {
  const parts = []
  if (debug.taxExcludedLabel)
    parts.push(`未連稅: ${debug.taxExcludedLabel} ${debug.taxExcludedRaw || ''}`.trim())
  if (debug.taxIncludedLabel)
    parts.push(`總計: ${debug.taxIncludedLabel} ${debug.taxIncludedRaw || ''}`.trim())
  return parts.join('；')
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function exportVisibleRecordsCsv(source: BonusRecord[]) {
  const headers = [
    '報價單網址',
    '案件編號',
    '客戶名稱',
    '客戶類型',
    '業務',
    '回簽月份',
    '收款月份',
    '回簽季度',
    '發放季度',
    '未連稅金額',
    '總計',
    '基礎獎金%',
    '套用倍率摘要',
    '最終獎金',
    '簽約依據',
    '金額來源',
  ]
  const rows = [...source]
    .sort((a, b) => (b.paidMonth || '').localeCompare(a.paidMonth || ''))
    .map((record) => {
      const signedQuarter = getFiscalQuarter(record.signedMonth)
      const paidQuarter = getFiscalQuarter(record.paidMonth)
      const multiplierText = multipliersApply(signedQuarter.key)
        ? multiplierSummary(signedQuarter.key, multiplierFor(signedQuarter.key))
        : '無倍率'
      return [
        record.quoteUrl,
        record.orderNo,
        record.customerName,
        customerTypeLabel(record.customerType),
        record.salesRep,
        record.signedMonth,
        record.paidMonth,
        signedQuarter.key,
        paidQuarter.key,
        Math.round(record.taxExcludedAmount),
        Math.round(record.taxIncludedAmount),
        commissionRateFor(record.customerType),
        multiplierText,
        finalCommissionDisplay(record),
        record.signedAtText,
        amountDebugText(record.amountDebug),
      ]
    })
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  downloadFile('ivy-bonus-records.csv', `﻿${csv}`, 'text/csv;charset=utf-8')
}
