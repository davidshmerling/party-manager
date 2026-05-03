import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const isSupabaseConfigured = Boolean(url && anonKey)

let cached: SupabaseClient | null = null

/**
 * לקוח Supabase (דפוס SPA לפי מסמכי supabase-js):
 * סכימת `public`, אחסון סשן ב־`localStorage`, רענון JWT אוטומטי.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured || !url || !anonKey) return null
  if (!cached) {
    cached = createClient(url, anonKey, {
      db: { schema: 'public' },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
      },
    })
  }
  return cached
}
