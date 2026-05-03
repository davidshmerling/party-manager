import type { Guest } from '../types/guest'

export function normalizeDigits(s: string): string {
  return s.replace(/\D/g, '')
}

/** ציון התאמה גבוה יותר = התאמה טובה יותר (שם או טלפון — חלק מהמחרוזת) */
export function scoreGuestSearch(queryRaw: string, name: string, phone: string): number {
  const q = queryRaw.trim()
  if (!q) return 0
  const qLower = q.toLowerCase()
  const nameNorm = name.trim().toLowerCase()
  const phoneDigits = normalizeDigits(phone)
  const qDigits = normalizeDigits(q)
  let best = 0

  if (qDigits.length > 0) {
    if (phoneDigits === qDigits) best = Math.max(best, 100)
    else if (qDigits.length >= 2 && phoneDigits.startsWith(qDigits)) best = Math.max(best, 88)
    else if (phoneDigits.includes(qDigits)) best = Math.max(best, qDigits.length >= 2 ? 68 : 30)
  }
  if (qLower.length > 0) {
    if (nameNorm === qLower) best = Math.max(best, 96)
    else if (nameNorm.startsWith(qLower)) best = Math.max(best, 78)
    else if (nameNorm.includes(qLower)) best = Math.max(best, 58)
  }
  return best
}

/** שורת קבוצה אחת עם הציון הגבוה ביותר; שוויון — לפי הסדר במערך (מיון נוכחי) */
export function findBestGuestGroupMatch(query: string, groups: Guest[][]): Guest[] | null {
  const q = query.trim()
  if (!q || groups.length === 0) return null
  let bestScore = -1
  let best: Guest[] | null = null
  for (const members of groups) {
    const rep = members[0]!
    const s = scoreGuestSearch(q, rep.name, rep.phone)
    if (s > bestScore) {
      bestScore = s
      best = members
    }
  }
  return bestScore > 0 ? best : null
}

/** מזהה יציב ל־scrollIntoView (תוים מיוחדים ב־groupKey) */
export function guestRowAnchorId(groupKey: string): string {
  let h = 2166136261
  for (let i = 0; i < groupKey.length; i++) {
    h ^= groupKey.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `guest-anchor-${(h >>> 0).toString(36)}`
}
