import type { EventRow } from '../types/event'

/**
 * האם תבנית Twilio + WhatsApp (Meta) מאושרת לשליחה דרך send-whatsapp.
 * דורש Content SID מסוג HX, slots, וסטטוס שמכיל את המילה approved (כפי שמחזיר GET ApprovalRequests אחרי אישור Meta).
 * סטטוסים ראשוניים כמו received / pending — לא מאושרים; יש לסנכרן מול Twilio (sync-whatsapp-template-status).
 * מסונכרן עם supabase/functions/send-whatsapp — לעדכן את שני המקומות יחד.
 */
export function twilioTemplateMeetsApprovalGate(
  contentSid: string | null | undefined,
  placeholderSlots: readonly number[] | null | undefined,
  statusRaw: string | null | undefined,
): boolean {
  const sid = (contentSid ?? '').trim()
  if (!sid.startsWith('HX')) return false
  const slots = Array.isArray(placeholderSlots) ? placeholderSlots : []
  if (slots.length === 0) return false
  const st = (statusRaw ?? '').trim().toLowerCase()
  if (!st) return false
  if (/\bpending\b/.test(st)) return false
  if (/\breceived\b/.test(st)) return false
  if (/\breject|\bfail/.test(st)) return false
  if (/\bpaused\b/.test(st)) return false
  return /\bapproved\b/.test(st)
}

export function isTwilioWhatsappInviteTemplateApproved(ev: EventRow | null | undefined): boolean {
  if (!ev) return false
  return twilioTemplateMeetsApprovalGate(
    ev.whatsapp_twilio_content_sid,
    ev.whatsapp_twilio_placeholder_slots,
    ev.whatsapp_twilio_content_status,
  )
}
