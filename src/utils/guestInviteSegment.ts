import type { Guest } from '../types/guest'

/** מצב תצוגה לכרטיס בודד (לא כולל mixed) */
export type InviteSegmentVisual = 'not_sent' | 'sent' | 'seen'

/** מצב קבוצה — mixed כשהכרטיסים לא אחידים */
export type InviteSegmentGroup = InviteSegmentVisual | 'mixed'

/** שלא נשלח: אין שיטה, אין חותמת שליחה, אין SID טוויליו */
export function isGuestDbNotSent(m: Guest): boolean {
  const method = String(m.invite_sent_method ?? '').trim()
  const hasAt = m.whatsapp_invite_sent_at != null
  const hasSid =
    m.whatsapp_invite_twilio_sid != null && String(m.whatsapp_invite_twilio_sid).trim() !== ''
  return !method && !hasAt && !hasSid
}

/**
 * שלושת מצבי ה-segment:
 * not_sent — אין אינדיקציה לשליחה
 * sent — נשלח; כולל סטטוסי Twilio לפני «נקרא» (למשל queued, sent, delivered) — ✓✓ אפור בעמודת «נשלח»
 * seen — Twilio ‎`read`‎ (נקרא בווטסאפ) או נפתח כרטיס — ✓✓ כחול בעמודת «נצפה»
 */
export function memberInviteSegment(m: Guest): InviteSegmentVisual {
  if (isGuestDbNotSent(m)) return 'not_sent'

  const st = String(m.whatsapp_invite_twilio_status ?? '').trim().toLowerCase()
  if (m.card_opened_at != null || st === 'read') return 'seen'

  return 'sent'
}

export function groupInviteSegment(members: Guest[]): InviteSegmentGroup {
  if (members.length === 0) return 'not_sent'
  const ms = members.map(memberInviteSegment)
  const u = new Set(ms)
  if (u.size === 1) return ms[0]!
  return 'mixed'
}

/** מיקום הגלילה ב־mixed: עדיפות ל־not_sent; אחרת אמצע (sent) */
export function groupInviteThumbSegment(
  groupSeg: InviteSegmentGroup,
  members: Guest[],
): InviteSegmentVisual {
  if (groupSeg !== 'mixed') return groupSeg
  const ms = members.map(memberInviteSegment)
  if (ms.some((x) => x === 'not_sent')) return 'not_sent'
  return 'sent'
}

/** שינוי ידני של סגמנט ההזמנה (שותף) — לא כשהכרטיסים במצבים מעורבים */
export function partnerInviteManualEditAllowed(members: Guest[]): boolean {
  return groupInviteSegment(members) !== 'mixed'
}
