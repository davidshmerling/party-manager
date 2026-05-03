import type { Guest } from '../types/guest'
import { normalizePhoneForDedup } from './pasteGuestLines'

/** מפתח יציב לאותו אדם באירוע (שם מנורמל + טלפון מנורמל) */
export function guestIdentityKey(name: string, phone: string): string {
  const n = name.trim().replace(/\s+/g, ' ').toLowerCase()
  const p = normalizePhoneForDedup(phone)
  return `${n}\u0000${p}`
}

/** מפתח יציב לשורה ב־UI (קבוצה). אורחי «תשלום בכניסה» — שורה לכל כרטיס */
export function guestGroupKey(g: Guest): string {
  if (g.source === 'pay_at_door') {
    return `pay_at_door\u0000${g.id}`
  }
  return guestIdentityKey(g.name, g.phone)
}

/** מקבץ אורחים לפי זהות; בתוך כל קבוצה ומעל הכל — מיון לפי שם */
export function groupGuestsByIdentity(guests: Guest[]): Guest[][] {
  const map = new Map<string, Guest[]>()
  for (const g of guests) {
    const k = guestGroupKey(g)
    const arr = map.get(k) ?? []
    arr.push(g)
    map.set(k, arr)
  }
  for (const arr of map.values()) {
    arr.sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'he', { sensitivity: 'base' }) ||
        a.created_at.localeCompare(b.created_at),
    )
  }
  return [...map.values()].sort(
    (a, b) =>
      a[0]!.name.localeCompare(b[0]!.name, 'he', { sensitivity: 'base' }) ||
      a[0]!.created_at.localeCompare(b[0]!.created_at),
  )
}
