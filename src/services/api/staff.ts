import type { EventStaffRow } from '../../types/event'
import { sb, errMsg } from './client'

export async function listEventStaff(eventId: string): Promise<EventStaffRow[]> {
  const { data, error } = await sb().rpc('list_event_staff', { p_event_id: eventId })
  if (error) throw new Error(errMsg(error))
  if (data == null) return []
  const arr = Array.isArray(data) ? data : []
  return arr.map((row) => {
    const r = row as Record<string, unknown>
    // חשוב: רק ‎'scanner'‎ מפורש — כל ערך אחר (חסר, טעות) נחשב ‎admin‎.
    // בלי זה, אדמיני אירוע on יסווגו בטעות כ־סורק וייתפסו ב־«סלקטור» (ייבוא) לפי ‎user_id.
    const raw = String(r.role ?? '')
    const role: 'admin' | 'scanner' = raw === 'scanner' ? 'scanner' : 'admin'
    return {
      id: String(r.id),
      user_id: String(r.user_id),
      email: String(r.email ?? ''),
      role,
      created_at: String(r.created_at ?? ''),
    }
  })
}

export async function addEventStaffMember(
  eventId: string,
  userId: string,
  role: 'admin' | 'scanner',
): Promise<void> {
  const { error } = await sb().rpc('add_event_staff_member', {
    p_event_id: eventId,
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw new Error(errMsg(error))
}

export async function removeEventStaffMember(eventId: string, userId: string): Promise<void> {
  const { error } = await sb().rpc('remove_event_staff_member', {
    p_event_id: eventId,
    p_user_id: userId,
  })
  if (error) throw new Error(errMsg(error))
}

export async function promoteToScanner(userId: string): Promise<void> {
  const { error } = await sb().rpc('promote_to_scanner', { p_user_id: userId })
  if (error) throw new Error(errMsg(error))
}
