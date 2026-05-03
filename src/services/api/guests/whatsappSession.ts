import type { WhatsAppMessageRow } from '../../../types/guest'
import { sb, errMsg } from '../client'

function mapWaMsg(row: Record<string, unknown>): WhatsAppMessageRow {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    guest_id: String(row.guest_id),
    from_phone: String(row.from_phone ?? ''),
    to_phone: String(row.to_phone ?? ''),
    body: String(row.body ?? ''),
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    status: String(row.status ?? ''),
    twilio_sid: row.twilio_sid != null ? String(row.twilio_sid) : null,
    message_kind: row.message_kind === 'invite' ? 'invite' : 'session',
    created_at: String(row.created_at),
  }
}

export async function fetchWhatsAppMessagesForGuests(
  eventId: string,
  guestIds: string[],
): Promise<WhatsAppMessageRow[]> {
  if (guestIds.length === 0) return []
  const { data, error } = await sb()
    .from('whatsapp_messages')
    .select(
      'id, event_id, guest_id, from_phone, to_phone, body, direction, status, twilio_sid, message_kind, created_at',
    )
    .eq('event_id', eventId)
    .in('guest_id', guestIds)
    .order('created_at', { ascending: true })
  if (error) throw new Error(errMsg(error))
  return (data ?? []).map((r) => mapWaMsg(r as Record<string, unknown>))
}

export type TwilioBalanceResult = { balance: number; currency: string }

export async function fetchTwilioBalanceForEvent(eventId: string): Promise<TwilioBalanceResult> {
  const { data, error } = await sb().functions.invoke('twilio-balance', {
    body: { eventId },
  })
  const fallback = error?.message ?? 'שגיאת רשת'
  if (error) throw new Error(typeof data === 'object' && data && 'error' in data ? String((data as { error?: unknown }).error ?? fallback) : fallback)
  const d = data as { ok?: boolean; balance?: unknown; currency?: unknown } | null
  if (!d?.ok || typeof d.balance !== 'number' || !Number.isFinite(d.balance)) {
    throw new Error(fallback)
  }
  return {
    balance: d.balance,
    currency: typeof d.currency === 'string' && d.currency.trim() ? d.currency.trim() : 'USD',
  }
}

export async function sendWhatsAppChatMessage(
  eventId: string,
  guestId: string,
  body: string,
): Promise<{ twilio_sid: string; status: string }> {
  const { data, error } = await sb().functions.invoke('whatsapp-send-chat', {
    body: { eventId, guestId, body },
  })
  const fallback = error?.message ?? 'שגיאת רשת'
  if (error) {
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error?: unknown }).error ?? fallback)
        : fallback
    throw new Error(msg)
  }
  const d = data as { ok?: boolean; twilio_sid?: string; status?: string } | null
  if (!d?.ok || typeof d.twilio_sid !== 'string') {
    throw new Error(fallback)
  }
  return { twilio_sid: d.twilio_sid, status: typeof d.status === 'string' ? d.status : 'queued' }
}
