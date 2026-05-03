import type { EventStatsRpc, GuestStats } from '../../../types/event'
import type { Guest } from '../../../types/guest'
import type { GuestEntryTimeRow } from '../../../utils/guestEntrySeries'
import { mapGuestRow } from '../mappers'
import { sb, errMsg } from '../client'
import { ENTRY_TIMES_CHUNK, GUEST_ROW_COLUMNS, GUESTS_FETCH_CHUNK } from './constants'

async function fetchGuestsRange(eventId: string, from: number, to: number): Promise<Guest[]> {
  const { data, error } = await sb()
    .from('guests')
    .select(GUEST_ROW_COLUMNS)
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .order('created_at', { ascending: true })
    .range(from, to)
  if (error) throw new Error(errMsg(error))
  return (data ?? []).map((r) => mapGuestRow(r as Record<string, unknown>))
}

/**
 * טעינת אורחים לאירוע. ללא אפשרויות — טעינה מלאה בכמה chunk-ים.
 * עם `limit` — עמוד בודד למימוש pagination עתידי.
 */
export async function fetchGuests(
  eventId: string,
  options?: { limit?: number; offset?: number },
): Promise<Guest[]> {
  if (options?.limit != null) {
    const from = Math.max(0, options.offset ?? 0)
    const to = from + options.limit - 1
    return fetchGuestsRange(eventId, from, to)
  }
  const out: Guest[] = []
  let offset = 0
  for (;;) {
    const batch = await fetchGuestsRange(eventId, offset, offset + GUESTS_FETCH_CHUNK - 1)
    out.push(...batch)
    if (batch.length < GUESTS_FETCH_CHUNK) break
    offset += GUESTS_FETCH_CHUNK
  }
  return out
}

/** ספירת אורחים לאירוע — שאילתת head בלבד (בלי גוף שורות) */
export async function fetchGuestsCount(eventId: string): Promise<number> {
  const { count, error } = await sb()
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .is('deleted_at', null)
  if (error) throw new Error(errMsg(error))
  return count ?? 0
}

/**
 * דוגמה לתצוגה מקדימה (כרטיס / wa.me) — **לא** טעינת כל האורחים.
 * 1) אורח אחד לפי אותו מיון כמו `fetchGuests` (למעשה «הקבוצה הראשית» ברשימה).
 * 2) כל הכרטיסים לאותה זהות (name+phone) — בדרך כלל מעט שורות.
 */
export async function fetchPreviewGuestGroupForEvent(eventId: string): Promise<Guest[]> {
  const client = sb()
  let { data: seed, error: errSeed } = await client
    .from('guests')
    .select(GUEST_ROW_COLUMNS)
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .eq('source', 'list')
    .order('name', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (errSeed) throw new Error(errMsg(errSeed))
  if (!seed) {
    const second = await client
      .from('guests')
      .select(GUEST_ROW_COLUMNS)
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (second.error) throw new Error(errMsg(second.error))
    if (!second.data) return []
    return [mapGuestRow(second.data as Record<string, unknown>)]
  }
  const rep = mapGuestRow(seed as Record<string, unknown>)
  const { data: rows, error: errGroup } = await client
    .from('guests')
    .select(GUEST_ROW_COLUMNS)
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .eq('name', rep.name)
    .eq('phone', rep.phone)
  if (errGroup) throw new Error(errMsg(errGroup))
  return (rows ?? [])
    .map((r) => mapGuestRow(r as Record<string, unknown>))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'he', { sensitivity: 'base' }) ||
        a.created_at.localeCompare(b.created_at),
    )
}

export type { GuestEntryTimeRow }

export async function fetchGuestEntryTimesAsc(eventId: string): Promise<GuestEntryTimeRow[]> {
  const out: GuestEntryTimeRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await sb()
      .from('guests')
      .select('id, entered_at')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .not('entered_at', 'is', null)
      .order('entered_at', { ascending: true })
      .range(from, from + ENTRY_TIMES_CHUNK - 1)
    if (error) throw new Error(errMsg(error))
    const rows = (data ?? []) as { id: string; entered_at: string }[]
    out.push(...rows)
    if (rows.length < ENTRY_TIMES_CHUNK) break
    from += ENTRY_TIMES_CHUNK
  }
  return out
}

/** סיכומי סטטוס ללא טעינת כל השורות — `get_event_stats` (RPC) */
export async function fetchGuestStats(eventId: string): Promise<GuestStats> {
  const s = await fetchEventStatsRpc(eventId)
  return {
    total: s.total_guests,
    pending: s.not_checked_in_count,
    entered: s.checked_in_count,
  }
}

/** סטטיסטיקות אירוע (מאובטח ב-RPC) — מתאים ל-scanner ללא גישה לטבלת guests */
export async function fetchEventStatsRpc(eventId: string): Promise<EventStatsRpc> {
  const { data, error } = await sb().rpc('get_event_stats', { p_event_id: eventId })
  if (error) throw new Error(errMsg(error))
  if (data == null || typeof data !== 'object') throw new Error('תשובת סטטיסטיקה לא תקינה')
  const j = data as Record<string, unknown>
  if (j.error === 'forbidden') throw new Error('אין הרשאה לצפות בסטטיסטיקה')
  return {
    event_id: String(j.event_id ?? eventId),
    event_name: j.event_name != null ? String(j.event_name) : null,
    total_guests: Number(j.total_guests ?? 0),
    checked_in_count: Number(j.checked_in_count ?? 0),
    not_checked_in_count: Number(j.not_checked_in_count ?? 0),
    checked_in_percentage: Number(j.checked_in_percentage ?? 0),
    last_check_in_at: j.last_check_in_at != null ? String(j.last_check_in_at) : null,
  }
}
