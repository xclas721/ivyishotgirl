import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

if (!supabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — copy .env.example to .env.local',
  )
}

export const supabase = createClient(
  url || 'https://placeholder.invalid',
  key || 'public-anon-key',
)
