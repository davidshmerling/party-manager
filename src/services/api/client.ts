import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'

export function sb(): SupabaseClient {
  const s = getSupabase()
  if (!s) throw new Error('Supabase לא מאותחל — הגדרו .env והפעילו מחדש את השרת')
  return s
}

export function errMsg(
  e: { message?: string; code?: string; details?: string; hint?: string } | null,
): string {
  if (!e) return 'שגיאה'
  const parts = [e.message, e.code, e.details, e.hint].filter(Boolean)
  const base = parts.length > 0 ? parts.join(' | ') : 'שגיאה'
  if (e.code === 'PGRST202') {
    return `${base} — נסו רענון מלא לדפדפן; אם נשאר: התחברות מחדש.`
  }
  return base
}

/** UUID (כולל v4) — תואם ל־`uuid` / PostgREST עבור `p_event_id` */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
