import type { EventFinanceLine } from '../../types/finance'
import type { Guest } from '../../types/guest'
import { guestGroupKey, guestIdentityKey } from '../../utils/guestIdentity'

/** מיון כמו `fetchGuests`: name, אז created_at */
export function sortGuestsLikeFetch(guests: Guest[]): Guest[] {
  return [...guests].sort((a, b) => {
    const c = a.name.localeCompare(b.name, 'he', { sensitivity: 'base' })
    if (c !== 0) return c
    return a.created_at.localeCompare(b.created_at)
  })
}

/** כל אורחי אותה קבוצה (אותו שורת UI) — כמו ‎`markWhatsAppInvitesSent` בשרת */
export function guestsInSameIdentityGroup(guests: Guest[], seedId: string): Guest[] {
  const seed = guests.find((g) => g.id === seedId)
  if (!seed) return []
  const gk = guestGroupKey(seed)
  return guests.filter((g) => guestGroupKey(g) === gk)
}

export function adminLabel(a: { display_name: string; email: string }): string {
  const d = a.display_name?.trim()
  if (d) return d
  return a.email || '—'
}

/** ערכי select לסלקטור: `__sel__` + user_id */
export const RECIPIENT_SEL_PREFIX = '__sel__' as const

export function errStr(e: unknown): string {
  if (e == null) return ''
  if (e instanceof Error) return e.message
  return String(e)
}

export function guestSnapshotAffectsPartyStats(before: Guest | undefined, after: Guest): boolean {
  if (!before) return true
  return before.status !== after.status || before.entered_at !== after.entered_at
}

/** שורות הכנסה המשויכות לקבוצת כרטיסים (לפי guest_id; נפילה לשם+טלפון לשורות ישנות בלי guest_id) */
export function incomeLinesForGuestGroup(
  lines: readonly EventFinanceLine[],
  members: Pick<Guest, 'id' | 'name' | 'phone'>[],
): EventFinanceLine[] {
  if (members.length === 0) return []
  const memberIds = new Set(members.map((m) => m.id))
  const k = guestIdentityKey(members[0]!.name, members[0]!.phone)
  return lines.filter((l) => {
    if (l.line_kind !== 'income') return false
    if (l.guest_id != null && l.guest_id !== '' && memberIds.has(l.guest_id)) return true
    if (l.guest_id == null || l.guest_id === '') {
      return guestIdentityKey(l.person_name, l.phone) === k
    }
    return false
  })
}
