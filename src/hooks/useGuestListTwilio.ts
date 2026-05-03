import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { EventRow } from '../types/event'
import type { Guest } from '../types/guest'
import type { PartyEventShell } from '../services/api/partyShell'
import {
  fetchTwilioBalanceForEvent,
  sendGuestWhatsAppViaTwilio,
  syncWhatsAppInviteTemplateStatus,
} from '../services/api'
import { logUserActivity } from '../services/loggingApi'
import { partyQueryKeys } from '../lib/partyEventQueries'
import { useWhatsAppMessagesStatusRealtime } from './useWhatsAppMessagesStatusRealtime'
import { formatIsraelMobileE164 } from '../utils/formatIsraelMobileE164'
import { isTwilioWhatsappInviteTemplateApproved } from '../utils/twilioTemplateApproval'
import { hapticError, hapticSuccess } from '../utils/haptics'

type ShowMobileToast = (
  kind: 'ok' | 'err' | 'info',
  message: string,
  options?: { placement?: 'top' | 'center'; durationMs?: number },
) => void

export type UseGuestListTwilioParams = {
  currentEventId: string | null
  currentEvent: EventRow | null
  guests: Guest[]
  queryClient: QueryClient
  refreshEvents: () => Promise<void>
  persistGuestRows: (rows: Guest[]) => Promise<void>
  setError: Dispatch<SetStateAction<string | null>>
  showMobileToast: ShowMobileToast
  eventQueryEnabled: boolean
}

/**
 * כל לוגיקת Twilio לרשימת אורחים: תבנית מאושרת, סנכרון סטטוס מול Meta, יתרה,
 * שליחת שורה, שליחה אוטומטית אחרי יצירת זהות ראשונה, ו־Realtime לסטטוס הזמנה.
 */
export function useGuestListTwilio({
  currentEventId,
  currentEvent,
  guests,
  queryClient,
  refreshEvents,
  persistGuestRows,
  setError,
  showMobileToast,
  eventQueryEnabled,
}: UseGuestListTwilioParams) {
  const [twilioSendingGuestId, setTwilioSendingGuestId] = useState<string | null>(null)

  useWhatsAppMessagesStatusRealtime({
    eventId: currentEventId,
    queryClient,
    enabled: eventQueryEnabled,
  })

  const twilioTemplateApproved = useMemo(
    () => isTwilioWhatsappInviteTemplateApproved(currentEvent),
    [
      currentEvent?.id,
      currentEvent?.whatsapp_twilio_content_sid,
      currentEvent?.whatsapp_twilio_content_status,
      currentEvent?.whatsapp_twilio_placeholder_slots?.join(','),
    ],
  )

  /** סטטוס שמור במסד שעדיין יכול להתעדכן בטווילו אחרי אישור Meta */
  const twilioStatusMaybeStale = useMemo(() => {
    const st = (currentEvent?.whatsapp_twilio_content_status ?? '').trim().toLowerCase()
    if (!st) return true
    if (/\breceived\b/.test(st)) return true
    if (/\bpending\b/.test(st)) return true
    return false
  }, [currentEvent?.whatsapp_twilio_content_status])

  useEffect(() => {
    if (!currentEventId || !currentEvent) return
    const sid = (currentEvent.whatsapp_twilio_content_sid ?? '').trim()
    if (!sid.startsWith('HX')) return
    if (isTwilioWhatsappInviteTemplateApproved(currentEvent)) return
    if (!twilioStatusMaybeStale) return

    let cancelled = false
    void (async () => {
      try {
        await syncWhatsAppInviteTemplateStatus(currentEventId)
        if (cancelled) return
        await queryClient.invalidateQueries({ queryKey: partyQueryKeys.partyShell(currentEventId) })
        await refreshEvents()
      } catch {
        /* Twilio / רשת — נשארים עם הסטטוס המקומי */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    currentEventId,
    currentEvent,
    twilioStatusMaybeStale,
    refreshEvents,
    queryClient,
  ])

  const rowSendTwilio = useCallback(
    async (guestId: string) => {
      if (!currentEventId) {
        throw new Error('אין אירוע פעיל')
      }
      if (!isTwilioWhatsappInviteTemplateApproved(currentEvent)) {
        showMobileToast(
          'err',
          'שליחת WhatsApp דרך Twilio זמינה רק אחרי אישור תבנית ההודעה ב-Meta. עברו ללשונית «וואטסאפ».',
          { placement: 'center', durationMs: 2600 },
        )
        hapticError()
        logUserActivity({
          kind: 'whatsapp',
          action: 'twilio_blocked_template',
          eventId: currentEventId,
          detail: { guest_id: guestId },
        })
        throw new Error('template_not_approved')
      }
      const g = guests.find((x) => x.id === guestId)
      if (g?.source === 'pay_at_door') {
        showMobileToast('err', 'אין מספר טלפון לתשלום בכניסה')
        hapticError()
        logUserActivity({
          kind: 'whatsapp',
          action: 'twilio_blocked_pay_at_door',
          eventId: currentEventId,
          detail: { guest_id: guestId },
        })
        throw new Error('pay_at_door')
      }
      setError(null)
      setTwilioSendingGuestId(guestId)
      try {
        const out = await sendGuestWhatsAppViaTwilio(currentEventId, guestId)
        const shell = queryClient.getQueryData<PartyEventShell>(
          partyQueryKeys.partyShell(currentEventId),
        )
        const gList = shell?.guests ?? []
        await persistGuestRows(
          gList
            .filter((guest) => out.marked_guest_ids.includes(guest.id))
            .map((guest) => ({
              ...guest,
              whatsapp_invite_sent_at: out.sent_at,
              invite_sent_method: 'twilio',
              updated_at: out.sent_at,
              whatsapp_invite_twilio_sid: out.twilio_sid?.trim() ? out.twilio_sid.trim() : null,
              whatsapp_invite_twilio_status: (out.twilio_status ?? 'sent').toLowerCase(),
            })),
        )
        hapticSuccess()
        logUserActivity({
          kind: 'whatsapp',
          action: 'twilio_send_ok',
          eventId: currentEventId,
          detail: {
            guest_id: guestId,
            guest_name: g?.name,
            phone: g?.phone,
            twilio_response: out,
          },
        })
      } catch (e) {
        hapticError()
        const msg = e instanceof Error ? e.message : 'שגיאה בשליחת Twilio'
        setError(msg)
        logUserActivity({
          kind: 'whatsapp',
          action: 'twilio_send_error',
          eventId: currentEventId,
          detail: { guest_id: guestId, guest_name: g?.name, error: msg },
        })
        throw e instanceof Error ? e : new Error(msg)
      } finally {
        setTwilioSendingGuestId(null)
      }
    },
    [currentEventId, currentEvent, guests, queryClient, persistGuestRows, setError, showMobileToast],
  )

  const runTwilioAutoInviteAfterCreateIfEligible = useCallback(
    async (args: { guest: Guest; wasFirstIdentityTicket: boolean }) => {
      const { guest, wasFirstIdentityTicket } = args
      if (!currentEventId || !currentEvent) return

      /** שליחה אוטומטית רק אם: זהות ראשונה, תבנית מאושרת, מספר תקין, יתרת Twilio ≥ 2 (כשהבדיקה מצליחה) */
      let twilioBalanceAllowsSend = true
      try {
        const bal = await fetchTwilioBalanceForEvent(currentEventId)
        twilioBalanceAllowsSend = bal.balance >= 2
      } catch {
        /* אם לא הצלחנו לקרוא יתרה — ממשיכים לנסות; send-whatsapp יחסום ב-402 אם אין מספיק */
        twilioBalanceAllowsSend = true
      }

      if (
        wasFirstIdentityTicket &&
        isTwilioWhatsappInviteTemplateApproved(currentEvent) &&
        formatIsraelMobileE164(guest.phone) &&
        twilioBalanceAllowsSend
      ) {
        setTwilioSendingGuestId(guest.id)
        try {
          const out = await sendGuestWhatsAppViaTwilio(currentEventId, guest.id)
          const shell = queryClient.getQueryData<PartyEventShell>(
            partyQueryKeys.partyShell(currentEventId),
          )
          const gList = shell?.guests ?? []
          await persistGuestRows(
            gList
              .filter((row) => out.marked_guest_ids.includes(row.id))
              .map((row) => ({
                ...row,
                whatsapp_invite_sent_at: out.sent_at,
                invite_sent_method: 'twilio',
                updated_at: out.sent_at,
                whatsapp_invite_twilio_sid: out.twilio_sid?.trim() ? out.twilio_sid.trim() : null,
                whatsapp_invite_twilio_status: (out.twilio_status ?? 'sent').toLowerCase(),
              })),
          )
          hapticSuccess()
          showMobileToast('ok', 'נשלחה הזמנה WhatsApp אוטומטית', { durationMs: 2400 })
          logUserActivity({
            kind: 'whatsapp',
            action: 'twilio_auto_after_create',
            eventId: currentEventId,
            detail: { guest_id: guest.id },
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'שליחה אוטומטית נכשלה'
          hapticError()
          showMobileToast('err', msg, { durationMs: 3600 })
          logUserActivity({
            kind: 'whatsapp',
            action: 'twilio_auto_after_create_error',
            eventId: currentEventId,
            detail: { guest_id: guest.id, error: msg },
          })
        } finally {
          setTwilioSendingGuestId(null)
        }
      } else if (
        wasFirstIdentityTicket &&
        isTwilioWhatsappInviteTemplateApproved(currentEvent) &&
        formatIsraelMobileE164(guest.phone) &&
        !twilioBalanceAllowsSend
      ) {
        showMobileToast('info', 'לא נשלחה הזמנה אוטומטית — יתרת Twilio מתחת לסף ($2). השתמשו בכפתור הווטסאפ או בהעתקה.', {
          durationMs: 4200,
        })
      }
    },
    [currentEventId, currentEvent, queryClient, persistGuestRows, showMobileToast],
  )

  return {
    twilioSendingGuestId,
    twilioTemplateApproved,
    rowSendTwilio,
    runTwilioAutoInviteAfterCreateIfEligible,
  }
}
