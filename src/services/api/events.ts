import type {
  EventRow,
  SubmitWhatsAppTemplateApprovalResult,
  SyncWhatsAppTemplateStatusResult,
} from '../../types/event'
import { sb, errMsg } from './client'
import { mapEventRow } from './mappers'

/** עמודות ל־mapEventRow (רשימת אירועים / בודד) — בלי `*` */
const EVENT_ROW_COLUMNS =
  'id, name, slug, description, starts_at, ends_at, location, is_active, created_by, card_text_above, card_text_instruction, card_text_below, card_text_terms, whatsapp_invite_template, whatsapp_twilio_content_sid, whatsapp_twilio_content_name, whatsapp_twilio_content_status, whatsapp_twilio_content_category, whatsapp_twilio_content_submitted_at, whatsapp_twilio_placeholder_slots, default_ticket_price, created_at, updated_at'

export async function fetchEventRow(eventId: string): Promise<EventRow> {
  const { data, error } = await sb()
    .from('events')
    .select(EVENT_ROW_COLUMNS)
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw new Error(errMsg(error))
  if (!data) throw new Error('אירוע לא נמצא')
  return mapEventRow(data as Record<string, unknown>)
}

export async function updateEventCardTexts(
  eventId: string,
  body: Partial<
    Pick<
      EventRow,
      | 'card_text_above'
      | 'card_text_instruction'
      | 'card_text_below'
      | 'card_text_terms'
      | 'whatsapp_invite_template'
      | 'default_ticket_price'
    >
  >,
): Promise<EventRow> {
  const patch: Record<string, string | number | null> = {}
  if (body.card_text_above !== undefined) patch.card_text_above = body.card_text_above?.trim() || null
  if (body.card_text_instruction !== undefined) {
    patch.card_text_instruction = body.card_text_instruction?.trim() || null
  }
  if (body.card_text_below !== undefined) patch.card_text_below = body.card_text_below?.trim() || null
  if (body.card_text_terms !== undefined) patch.card_text_terms = body.card_text_terms?.trim() || null
  if (body.whatsapp_invite_template !== undefined) {
    patch.whatsapp_invite_template = body.whatsapp_invite_template?.trim() || null
  }
  if (body.default_ticket_price !== undefined) {
    const n = body.default_ticket_price
    patch.default_ticket_price = typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0
  }
  const { data, error } = await sb()
    .from('events')
    .update(patch)
    .eq('id', eventId)
    .select(EVENT_ROW_COLUMNS)
    .single()
  if (error) throw new Error(errMsg(error))
  if (!data) throw new Error('אירוע לא נמצא')
  return mapEventRow(data as Record<string, unknown>)
}

function invokeFnErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const e = (data as { error?: unknown }).error
    if (typeof e === 'string' && e.trim()) return e.trim()
  }
  return fallback
}

/** יוצר תוכן ב‑Twilio ושולח לאישור WhatsApp (Meta). דורש Secrets כמו send-whatsapp. */
export async function submitWhatsAppInviteTemplateApproval(
  eventId: string,
  options?: { category?: 'UTILITY' | 'MARKETING' },
): Promise<SubmitWhatsAppTemplateApprovalResult> {
  const category = options?.category ?? 'UTILITY'
  const { data, error } = await sb().functions.invoke('submit-whatsapp-template', {
    body: { eventId, category },
  })
  const fallbackMsg = error?.message ?? 'שגיאת רשת'
  const msg = invokeFnErrorMessage(data, fallbackMsg)
  if (error) throw new Error(msg)
  const d = data as Partial<SubmitWhatsAppTemplateApprovalResult> & { ok?: boolean } | null
  if (!d?.ok || typeof d.content_sid !== 'string') {
    throw new Error(msg !== fallbackMsg ? msg : 'תגובה לא צפויה מהשרת')
  }
  return d as SubmitWhatsAppTemplateApprovalResult
}

/** מושך מ־Twilio את סטטוס אישור WhatsApp ומעדכן את האירוע במסד (לתיקון סטטוס ישן כמו received). */
export async function syncWhatsAppInviteTemplateStatus(
  eventId: string,
): Promise<SyncWhatsAppTemplateStatusResult> {
  const { data, error } = await sb().functions.invoke('sync-whatsapp-template-status', {
    body: { eventId },
  })
  const fallbackMsg = error?.message ?? 'שגיאת רשת'
  const msg = invokeFnErrorMessage(data, fallbackMsg)
  if (error) throw new Error(msg)
  const d = data as Partial<SyncWhatsAppTemplateStatusResult> & { ok?: boolean } | null
  if (!d?.ok || typeof d.content_sid !== 'string') {
    throw new Error(msg !== fallbackMsg ? msg : 'תגובה לא צפויה מהשרת')
  }
  return d as SyncWhatsAppTemplateStatusResult
}

export async function fetchEvents(): Promise<EventRow[]> {
  const { data, error } = await sb()
    .from('events')
    .select(EVENT_ROW_COLUMNS)
    .order('created_at', { ascending: true })
  if (error) throw new Error(errMsg(error))
  return (data ?? []).map((r) => mapEventRow(r as Record<string, unknown>))
}

/**
 * אירועים שמשתמש (סורק) משויך אליהם.
 * לא משתמשים ב־`event_staff` + embed: ה־RLS על `event_staff` מאפשר SELECT רק ל־`can_manage_event`,
 * ולכן סורק לא יכול לקרוא את שורות השיוך שלו — התוצאה הייתה רשימה ריקה בדף הבית.
 * ב־`events` כבר יש RLS: סורק רואה אירוע אם יש לו `event_staff` (בלי צורך ב־SELECT על event_staff).
 */
export async function fetchEventsForStaffUser(): Promise<EventRow[]> {
  const { data, error } = await sb()
    .from('events')
    .select(EVENT_ROW_COLUMNS)
    .order('created_at', { ascending: true })
  if (error) throw new Error(errMsg(error))
  return (data ?? []).map((r) => mapEventRow(r as Record<string, unknown>))
}

export async function createEventRow(name: string): Promise<EventRow> {
  const n = name.trim()
  if (!n) throw new Error('שם מסיבה חסר')
  const client = sb()
  const { data: sessionData } = await client.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) throw new Error('לא מחובר')
  const { data, error } = await client
    .from('events')
    .insert({ name: n, created_by: uid })
    .select(EVENT_ROW_COLUMNS)
    .single()
  if (error) throw new Error(errMsg(error))
  if (!data) throw new Error('לא נוצר אירוע')
  return mapEventRow(data as Record<string, unknown>)
}

/** מחיקת מסיבה אחרי אימות סיסמת המשתמש (אותה סיסמה כמו להתחברות) */
export async function deleteEventWithPassword(eventId: string, password: string): Promise<void> {
  const client = sb()
  const pw = password.trim()
  if (!pw) throw new Error('הזינו סיסמה')

  const { data: sessionData } = await client.auth.getSession()
  const email = sessionData.session?.user?.email?.trim()
  if (!email) throw new Error('לא נמצא מייל למשתמש — לא ניתן לאמת סיסמה')

  const { error: signErr } = await client.auth.signInWithPassword({ email, password: pw })
  if (signErr) {
    throw new Error('סיסמה שגויה')
  }

  const { error } = await client.from('events').delete().eq('id', eventId)
  if (error) throw new Error(errMsg(error))
}
