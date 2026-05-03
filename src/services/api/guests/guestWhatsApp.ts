import type { SendGuestTwilioSuccess, SendWhatsAppResponse } from '../../../types/guest'
import { buildGuestCardUrl, eventNameFromEnv } from '../../../utils/whatsapp'
import { sendWhatsAppMessage } from '../../whatsappService'
import { mapGuestRow } from '../mappers'
import { sb, errMsg } from '../client'
import { GUEST_ROW_COLUMNS } from './constants'

async function fetchEventWhatsAppContext(eventId: string): Promise<{
  eventName: string
  inviteTemplate: string | null
}> {
  const { data, error } = await sb()
    .from('events')
    .select('name, whatsapp_invite_template')
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw new Error(errMsg(error))
  const name = data?.name != null ? String(data.name).trim() : ''
  const eventName = name || eventNameFromEnv()
  const inviteTemplate =
    data?.whatsapp_invite_template != null ? String(data.whatsapp_invite_template) : null
  return { eventName, inviteTemplate: inviteTemplate?.trim() ? inviteTemplate : null }
}

export async function markWhatsAppInvitesSent(
  eventId: string,
  representativeGuestIds: string[],
): Promise<{ updatedIds: string[]; sentAt: string }> {
  if (representativeGuestIds.length === 0) {
    return { updatedIds: [], sentAt: new Date().toISOString() }
  }
  const { data, error } = await sb().rpc('guest_ids_same_identity_in_event', {
    p_event_id: eventId,
    p_seed_ids: representativeGuestIds,
  })
  if (error) throw new Error(errMsg(error))
  const ids = Array.isArray(data) ? (data as string[]) : []
  if (ids.length === 0) {
    return { updatedIds: [], sentAt: new Date().toISOString() }
  }
  const now = new Date().toISOString()
  const { error: upErr } = await sb()
    .from('guests')
    .update({
      whatsapp_invite_sent_at: now,
      invite_sent_method: 'whatsapp_web',
    })
    .in('id', ids)
    .is('deleted_at', null)
  if (upErr) throw new Error(errMsg(upErr))
  return { updatedIds: ids, sentAt: now }
}

export async function sendWhatsApp(
  guestId: string,
  options?: { markSent?: boolean },
): Promise<SendWhatsAppResponse> {
  const { data, error } = await sb()
    .from('guests')
    .select(GUEST_ROW_COLUMNS)
    .eq('id', guestId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(errMsg(error))
  if (!data) throw new Error('אורח לא נמצא')
  const g = mapGuestRow(data as Record<string, unknown>)
  const inviteUrl = buildGuestCardUrl(g.invite_bundle_code)
  const { eventName, inviteTemplate } = await fetchEventWhatsAppContext(g.event_id)
  const { wa_url, message } = sendWhatsAppMessage({
    phone: g.phone,
    name: g.name,
    links: [inviteUrl],
    eventName,
    inviteTemplate,
  })
  if (options?.markSent !== false) {
    await markWhatsAppInvitesSent(g.event_id, [g.id])
  }
  return { wa_url, message, guest_name: g.name }
}

function edgeInvokeErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const e = (data as { error?: unknown }).error
    if (typeof e === 'string' && e.trim()) return e.trim()
  }
  return fallback
}

/** שליחת הזמנה בווטסאפ דרך Twilio (שרת — Secrets). מסמן שליחה כמו העתקת הודעה. */
export async function sendGuestWhatsAppViaTwilio(
  eventId: string,
  guestId: string,
): Promise<SendGuestTwilioSuccess> {
  const { data, error } = await sb().functions.invoke('send-whatsapp', {
    body: { eventId, guestId },
  })
  const fallbackMsg = error?.message ?? 'שגיאת רשת'
  const msg = edgeInvokeErrorMessage(data, fallbackMsg)
  if (error) {
    throw new Error(msg)
  }
  const d = data as Partial<SendGuestTwilioSuccess> | null
  if (!d?.ok || typeof d.sent_at !== 'string' || !Array.isArray(d.marked_guest_ids)) {
    throw new Error(msg !== fallbackMsg ? msg : 'תגובה לא צפויה מהשרת')
  }
  return d as SendGuestTwilioSuccess
}

