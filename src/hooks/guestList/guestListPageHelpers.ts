import type { Guest } from '../../types/guest'
import { guestGroupKey } from '../../utils/guestIdentity'

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
