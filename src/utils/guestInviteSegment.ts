import type { Guest } from '../types/guest'

/** מצב תצוגה לכרטיס בודד / לקבוצה (אותה לוגיקת עדיפות) */
export type InviteSegmentVisual = 'not_sent' | 'sent' | 'seen'

/** שם היסטורי — זהה ל־InviteSegmentVisual (אין עוד מצב mixed בקבוצה) */
export type InviteSegmentGroup = InviteSegmentVisual

/** שלא נשלח: אין שיטה, אין חותמת שליחה, אין SID טוויליו */
export function isGuestDbNotSent(m: Guest): boolean {
  const method = String(m.invite_sent_method ?? '').trim()
  const hasAt = m.whatsapp_invite_sent_at != null
  const hasSid =
    m.whatsapp_invite_twilio_sid != null && String(m.whatsapp_invite_twilio_sid).trim() !== ''
  return !method && !hasAt && !hasSid
}

/** נשלח לפי DB: שיטה / חותמת / SID טוויליו */
export function isGuestInviteSent(m: Guest): boolean {
  return !isGuestDbNotSent(m)
}

/** נצפה: נפתח כרטיס או Twilio ‎`read`‎ (לוגיקת OR בקבוצה — לא דורש קודם «נשלח») */
export function isGuestInviteSeen(m: Guest): boolean {
  const st = String(m.whatsapp_invite_twilio_status ?? '').trim().toLowerCase()
  return m.card_opened_at != null || st === 'read'
}

/**
 * כרטיס בודד — סדר עדיפות: seen > sent > not_sent
 */
export function memberInviteSegment(m: Guest): InviteSegmentVisual {
  if (isGuestInviteSeen(m)) return 'seen'
  if (isGuestInviteSent(m)) return 'sent'
  return 'not_sent'
}

/**
 * קבוצת כרטיסים לאותה זהות — OR לוגי:
 * - אם לאחד יש seen → כל הסגמנט seen
 * - אחרת אם לאחד יש sent → sent
 * - אחרת not_sent
 */
export function groupInviteSegment(members: Guest[]): InviteSegmentGroup {
  if (members.length === 0) return 'not_sent'
  if (members.some(isGuestInviteSeen)) return 'seen'
  if (members.some(isGuestInviteSent)) return 'sent'
  return 'not_sent'
}

/** שינוי ידני (שותף) — כשיש כרטיסים בקבוצה */
export function partnerInviteManualEditAllowed(members: Guest[]): boolean {
  return members.length > 0
}
