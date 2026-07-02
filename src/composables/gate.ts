// Single shared-account gate using Supabase Auth + RLS.
// This is real protection: once RLS is enabled, the anon key alone can't read
// or write — only an authenticated session can. The email is a fixed identifier
// (not secret); only the password matters. The login UI asks for the password
// only and supplies this email behind the scenes.
import { ref } from 'vue'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { resetLedger } from '@/composables/ledger'

// Must match the Supabase Auth user created in the dashboard.
export const GATE_EMAIL = 'gate@ivy.app'

export const isUnlocked = ref(false)
export const authReady = ref(false)
export const sessionExpired = ref(false)

let manualLock = false

// Restore any persisted session, then keep the flag in sync with auth changes.
const hasSupabaseConfig = supabaseConfigured

if (!hasSupabaseConfig) {
  authReady.value = true
} else {
  void supabase.auth
    .getSession()
    .then(({ data }) => {
      isUnlocked.value = !!data.session
      authReady.value = true
    })
    .catch(() => {
      authReady.value = true
    })
}

supabase.auth.onAuthStateChange((event, session) => {
  const hadSession = isUnlocked.value
  isUnlocked.value = !!session

  if (session) {
    sessionExpired.value = false
    return
  }

  if (hadSession && !manualLock) {
    resetLedger()
    sessionExpired.value = true
  }
})

// Returns true on success, false on wrong password. Throws on other errors.
export async function tryUnlock(password: string): Promise<boolean> {
  const response = await fetch('/api/gate-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  let data: {
    ok?: boolean
    errorType?: string
    message?: string
    access_token?: string
    refresh_token?: string
  } = {}
  try {
    data = await response.json()
  } catch {
    throw new Error('登入失敗，請稍後再試。')
  }

  if (response.status === 429) {
    throw new Error(data.message || '登入嘗試過於頻繁，請稍後再試。')
  }

  if (response.status === 401 || data.errorType === 'INVALID_CREDENTIALS') {
    return false
  }

  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.message || '登入失敗，請稍後再試。')
  }

  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })
  if (error) throw new Error('登入失敗，請稍後再試。')

  isUnlocked.value = true
  return true
}

export async function lock() {
  manualLock = true
  try {
    await supabase.auth.signOut()
    isUnlocked.value = false
    sessionExpired.value = false
    resetLedger()
  } finally {
    manualLock = false
  }
}

async function verifyCurrentPassword(password: string): Promise<boolean> {
  const response = await fetch('/api/gate-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  let data: { ok?: boolean; errorType?: string; message?: string } = {}
  try {
    data = await response.json()
  } catch {
    throw new Error('無法驗證目前密碼，請稍後再試。')
  }

  if (response.status === 429) {
    throw new Error(data.message || '嘗試過於頻繁，請稍後再試。')
  }

  if (response.status === 401 || data.errorType === 'INVALID_CREDENTIALS') {
    return false
  }

  if (!response.ok) {
    throw new Error(data.message || '無法驗證目前密碼，請稍後再試。')
  }

  return true
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const valid = await verifyCurrentPassword(currentPassword)
  if (!valid) {
    throw new Error('目前密碼錯誤')
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    throw new Error(error.message || '密碼更新失敗，請稍後再試。')
  }
}
