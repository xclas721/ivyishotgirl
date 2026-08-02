import { computed, ref } from 'vue'
import type { BonusRecord } from '@/lib/db'
import { records, toNumber } from '@/composables/ledger'
import {
  finalCommissionFor,
  isCommissionComputable,
} from '@/composables/ledgerSummary'
import {
  getLatestPayoutWave,
  recordMatchesPayoutWave,
  shiftPayoutWave,
  type PayoutWave,
} from '@/shared/payoutSchedule'

const payoutWave = ref<PayoutWave>(getLatestPayoutWave())

export function usePayoutRelease() {
  function goPrevWave() {
    payoutWave.value = shiftPayoutWave(payoutWave.value, -1)
  }

  function goNextWave() {
    payoutWave.value = shiftPayoutWave(payoutWave.value, 1)
  }

  function resetToLatest() {
    payoutWave.value = getLatestPayoutWave()
  }

  // 8月發放 → 收款月份落在 Q2（5–7月）的案件，不是收款月＝8月
  const payoutRecords = computed(() =>
    records.value.filter((record) =>
      recordMatchesPayoutWave(record.paidMonth, payoutWave.value),
    ),
  )

  const payoutTotals = computed(() => summarizePayoutRecords(payoutRecords.value))

  return {
    payoutWave,
    payoutRecords,
    payoutTotals,
    goPrevWave,
    goNextWave,
    resetToLatest,
  }
}

export function summarizePayoutRecords(source: BonusRecord[]) {
  let final = 0
  let taxExcludedAmount = 0
  let taxIncludedAmount = 0
  let uncomputableCount = 0

  for (const record of source) {
    taxExcludedAmount += toNumber(record.taxExcludedAmount)
    taxIncludedAmount += toNumber(record.taxIncludedAmount)
    if (isCommissionComputable(record)) {
      final += finalCommissionFor(record)
    } else {
      uncomputableCount += 1
    }
  }

  return {
    final,
    taxExcludedAmount,
    taxIncludedAmount,
    uncomputableCount,
    count: source.length,
  }
}
