// Single shared-account gate using Supabase Auth + RLS.
// This is real protection: once RLS is enabled, the anon key alone can't read
// or write — only an authenticated session can. The email is a fixed identifier
// (not secret); only the password matters. The login UI asks for the password
// only and supplies this email behind the scenes.
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

// Must match the Supabase Auth user created in the dashboard.
export const GATE_EMAIL = 'gate@ivy.app'

export const isUnlocked = ref(false)
export const authReady = ref(false)

// Restore any persisted session, then keep the flag in sync with auth changes.
void supabase.auth.getSession().then(({ data }) => {
  isUnlocked.value = !!data.session
  authReady.value = true
})

supabase.auth.onAuthStateChange((_event, session) => {
  isUnlocked.value = !!session
})

// Returns true on success, false on wrong password. Throws on other errors.
export async function tryUnlock(password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({
    email: GATE_EMAIL,
    password,
  })
  if (!error) {
    isUnlocked.value = true
    return true
  }
  if (/invalid login credentials/i.test(error.message)) return false
  throw new Error('登入失敗，請稍後再試。')
}

export async function lock() {
  await supabase.auth.signOut()
  isUnlocked.value = false
}
