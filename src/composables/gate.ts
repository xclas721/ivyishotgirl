// Simple front-end password gate. NOT real security — data is still reachable
// via the anon key while RLS is off. This only keeps casual visitors out.
// The password's SHA-256 hash lives in Supabase (`app_settings`), so it can be
// changed without a redeploy and never ships in the public repo.
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'ivy-gate-unlocked'
const GATE_SETTING_KEY = 'gate_password_sha256'

export const isUnlocked = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1',
)

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Returns true on success. Throws if the gate setting can't be read.
export async function tryUnlock(input: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', GATE_SETTING_KEY)
    .maybeSingle()

  if (error) throw new Error('無法讀取密碼設定，請稍後再試。')
  if (!data?.value) throw new Error('尚未設定密碼，請聯絡管理員。')

  const inputHash = await sha256Hex(input)
  if (inputHash !== data.value) return false

  isUnlocked.value = true
  localStorage.setItem(STORAGE_KEY, '1')
  return true
}

export function lock() {
  isUnlocked.value = false
  localStorage.removeItem(STORAGE_KEY)
}
