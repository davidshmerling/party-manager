import type { IncomeRecipientKind } from '../../../types/finance'
import type { AdminUserRow } from '../../../types/admin'
import type { EventStaffRow } from '../../../types/event'

export function payboxToken(t: string): boolean {
  const s = t.trim()
  if (s === 'פייבוקס' || s === 'פיי־בוקס' || s === 'פיי בוקס') return true
  return s.toLowerCase() === 'paybox'
}

export function selectorKeywordToken(t: string): boolean {
  const s = t.trim()
  if (s === 'סלקטור' || s === 'סורק') return true
  const low = s.toLowerCase()
  return low === 'selector' || low === 'scanner'
}

export function firstPartnerId(admins: AdminUserRow[]): string | null {
  const partners = [...admins].filter((a) => a.is_partner)
  if (partners.length === 0) return null
  partners.sort((a, b) => a.user_id.localeCompare(b.user_id))
  return partners[0]!.user_id
}

/** סורקים לאירוע — רק ‎role === 'scanner'‎; מיון: קודם לפי הוספה (created_at) */
export function scannersForEvent(staff: EventStaffRow[]): EventStaffRow[] {
  return staff
    .filter((r) => r.role === 'scanner')
    .sort((a, b) => {
      const ca = a.created_at || ''
      const cb = b.created_at || ''
      if (ca !== cb) return ca.localeCompare(cb)
      return a.user_id.localeCompare(b.user_id)
    })
}

/** שם/כינוי → שותף; כמו שורה בייבוא (בלי «סלקטור»/«פייבוקס») */
export function resolvePartnerNameTokenToRecipientId(
  token: string,
  admins: AdminUserRow[],
): string | null {
  const t = token.trim()
  if (!t) return null
  const partners = admins.filter((a) => a.is_partner)
  for (const a of partners) {
    const d = a.display_name?.trim()
    const label = d || a.email || ''
    if (label === t) return a.user_id
    const first = label.split(/\s+/)[0] ?? ''
    if (first === t) return a.user_id
  }
  return null
}

/** שדה «למי שולם — הקלדה» בטופס הוספה: פייבוקס = שותף הברירה; אחרת התאמה לשם שותף */
export function resolveManualIncomeRecipientId(token: string, admins: AdminUserRow[]): string | null {
  if (payboxToken(token)) {
    return firstPartnerId(admins)
  }
  return resolvePartnerNameTokenToRecipientId(token, admins)
}

export type IncomeRecipientResolve = { id: string; kind: IncomeRecipientKind }

/** התאמה לשם/שם פרטי של שותף, או מילות מפתח: פייבוקס, סלקטור (סורק שמוגדר באירוע) */
export function resolveIncomeRecipientWithKind(
  token: string,
  admins: AdminUserRow[],
  eventStaff: EventStaffRow[],
): IncomeRecipientResolve | null {
  if (payboxToken(token)) {
    const id = firstPartnerId(admins)
    return id ? { id, kind: 'paybox' } : null
  }
  if (selectorKeywordToken(token)) {
    const scanners = scannersForEvent(eventStaff)
    if (scanners.length === 1) return { id: scanners[0]!.user_id, kind: 'selector' }
    return null
  }
  const id = resolvePartnerNameTokenToRecipientId(token, admins)
  return id ? { id, kind: 'partner' } : null
}
