import { useEffect } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase'
import { updateCachedPartyShellGuests } from '../lib/partyEventQueries'

/**
 * כשטוויליו שולח status callback, השרת מעדכן ‎`whatsapp_messages.status`‎ (ו־guests).
 * מנוי Realtime על אותה טבלה מסנכרן את ‎`whatsapp_invite_twilio_status`‎ במטמון TanStack Query
 * כדי שהסגמנט (✓✓ אפור / ✓✓ כחול) יתעדכן בלי רענון ידני.
 */
export function useWhatsAppMessagesStatusRealtime({
  eventId,
  queryClient,
  enabled = true,
}: {
  eventId: string | null | undefined
  queryClient: QueryClient
  enabled?: boolean
}) {
  useEffect(() => {
    const eid = eventId?.trim()
    if (!eid || !enabled) return
    const sb = getSupabase()
    if (!sb) return

    const ch = sb
      .channel(`wa-msg-status:${eid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `event_id=eq.${eid}`,
        },
        (payload) => {
          const row = payload.new as {
            direction?: string | null
            message_kind?: string | null
            twilio_sid?: string | null
            status?: string | null
          }
          if (String(row.direction ?? '') !== 'outbound') return
          if (String(row.message_kind ?? 'session') !== 'invite') return
          const sid = row.twilio_sid != null ? String(row.twilio_sid).trim() : ''
          const st = row.status != null ? String(row.status).trim().toLowerCase() : ''
          if (!sid || !st) return

          updateCachedPartyShellGuests(queryClient, eid, (prev) =>
            prev.map((g) =>
              (g.whatsapp_invite_twilio_sid ?? '').trim() === sid
                ? { ...g, whatsapp_invite_twilio_status: st }
                : g,
            ),
          )
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[useWhatsAppMessagesStatusRealtime] channel error', eid)
        }
      })

    return () => {
      void sb.removeChannel(ch)
    }
  }, [eventId, enabled, queryClient])
}
