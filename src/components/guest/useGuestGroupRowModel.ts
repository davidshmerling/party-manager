import { useCallback, useEffect, useState } from 'react'
import type { Guest, GuestStatus } from '../../types/guest'
import { updateGuest } from '../../services/api'
import type { IncomeRecipientEditOption } from './IncomeRecipientSelect'

/** בעת סימון «נשלח» ידני — שומרים SID/סטטוס טוויליו כדי ש־read / delivered ימשיכו לשקף את ה־UI (כחול אם נקרא / נפתח כרטיס) */
function twilioInviteSnapshotForManualSent(m: Guest): {
  whatsapp_invite_twilio_sid: string | null
  whatsapp_invite_twilio_status: string | null
} {
  const sidRaw = m.whatsapp_invite_twilio_sid
  const sid =
    sidRaw != null && String(sidRaw).trim() !== '' ? String(sidRaw).trim() : null
  const stRaw = m.whatsapp_invite_twilio_status
  const st =
    stRaw != null && String(stRaw).trim() !== '' ? String(stRaw).trim().toLowerCase() : null
  return { whatsapp_invite_twilio_sid: sid, whatsapp_invite_twilio_status: st }
}

export type GuestGroupRowProps = {
  rowNum: number
  /** 0/1 לפסי זברה בטבלה (דסקטופ) */
  tableStripeIndex?: number
  members: Guest[]
  groupKey: string
  rowAnchorId: string
  searchHighlight: boolean
  isFocused: boolean
  /** אחרי כל שמירה — מערך האורחים המעודכנים מהשרת (לעדכון מקומי בלי `load` מלא) */
  onChange: (updatedGuests: Guest[]) => Promise<void>
  onDelete: (ids: string[]) => void
  onCopyWaMessage: (id: string) => void
  /** שליחת הזמנה בווטסאפ דרך Twilio (Edge Function + Secrets) */
  onSendTwilio?: (guestId: string) => Promise<void>
  /** כש-false — תבנית WhatsApp טרם אושרה ב-Meta; כפתור Twilio חסום */
  twilioTemplateApproved?: boolean
  /** כשליחה ל-Twilio פעילה לאותו אורח מייצג */
  twilioSendingGuestId?: string | null
  onCardPress: (key: string) => void
  onStatusCommitted?: (kind: 'entered' | 'pending' | 'partial', name: string) => void
  /** הוספת כרטיס לאותה זהות (שם+טלפון) — לא רלוונטי לתשלום בכניסה; רק ‎`profile.role === 'partner'` */
  onAddTicket?: () => void | Promise<void>
  /** הסרת כרטיס אחד (נשארים ≥1) */
  onRemoveOneTicket?: () => void | Promise<void>
  /** שותף — כרטיסים + סימון הזמנה ידני (לפי חוקי OR ב־guestInviteSegment) */
  isPartner?: boolean
  /** בזמן בקשת רשת */
  ticketActionPending?: boolean
  /** שורת/ות הכנסה (אורח מהרשימה) — עריכת מחיר */
  incomeLineIds?: string[]
  incomeAmount?: number | null
  /** נמען לפי שורת הכנסה; תשלום בכניסה — סלקטור */
  incomeRecipientLabel?: string | null
  /** ערך ה־select כמו בטופס הוספה (‎`__paybox__` / ‎`__sel__`+id / user_id שותף) */
  incomeRecipientSelectValue?: string | null
  incomeRecipientEditOptions?: IncomeRecipientEditOption[]
  onSaveIncomeAmount?: (amount: number) => Promise<void>
  onSaveIncomeRecipient?: (recipientValue: string) => Promise<void>
}

export function useGuestGroupRowModel({
  members,
  onChange,
  onStatusCommitted,
}: GuestGroupRowProps) {
  const rep = members[0]!
  const membersKey = members.map((m) => m.id).join('|')
  const [name, setName] = useState(rep.name)
  const [phone, setPhone] = useState(rep.phone)

  useEffect(() => {
    setName(rep.name)
    setPhone(rep.phone)
  }, [membersKey, rep.name, rep.phone])

  const multi = members.length > 1
  const allPending = members.every((m) => m.status === 'pending')
  const allEntered = members.every((m) => m.status === 'entered')
  const entryMixed = !allPending && !allEntered
  const enteredCount = members.filter((m) => m.status === 'entered').length

  const displayStatus: GuestStatus = allEntered ? 'entered' : 'pending'

  const saveField = useCallback(
    async (field: 'name' | 'phone', value: string) => {
      const v = value.trim()
      if (!v) return
      if (members.every((m) => m[field] === v)) return
      const out: Guest[] = []
      for (const m of members) {
        out.push(await updateGuest(m.id, { [field]: v }))
      }
      await onChange(out)
    },
    [members, onChange],
  )

  const saveStatus = useCallback(
    async (next: GuestStatus) => {
      const enteredAt = next === 'entered' ? new Date().toISOString() : null
      const out: Guest[] = []
      for (const m of members) {
        if (next === 'pending') {
          out.push(await updateGuest(m.id, { status: 'pending', entered_at: null }))
        } else {
          out.push(await updateGuest(m.id, { status: 'entered', entered_at: enteredAt }))
        }
      }
      onStatusCommitted?.(next, rep.name.trim() || 'אורח')
      await onChange(out)
    },
    [members, onChange, onStatusCommitted, rep.name],
  )

  const inviteAllSent = members.every((m) => m.whatsapp_invite_sent_at != null)
  const inviteNoneSent = members.every((m) => m.whatsapp_invite_sent_at == null)
  const inviteMixed = !inviteAllSent && !inviteNoneSent

  const cardOpenAll = members.every((m) => m.card_opened_at != null)
  const cardOpenNone = members.every((m) => m.card_opened_at == null)
  const cardOpenMixed = !cardOpenAll && !cardOpenNone
  const cardOpenedCount = members.filter((m) => m.card_opened_at != null).length
  const inviteSentCount = members.filter((m) => m.whatsapp_invite_sent_at != null).length

  const saveCardOpened = useCallback(
    async (value: 'opened' | 'not_opened') => {
      const ts = value === 'opened' ? new Date().toISOString() : null
      const out: Guest[] = []
      for (const m of members) {
        out.push(await updateGuest(m.id, { card_opened_at: ts }))
      }
      await onChange(out)
    },
    [members, onChange],
  )

  const saveInviteSent = useCallback(
    async (value: 'sent' | 'not_sent') => {
      const ts = value === 'sent' ? new Date().toISOString() : null
      const now = new Date().toISOString()
      const previous = members
      const optimistic: Guest[] = members.map((m) => {
        const tw = ts ? twilioInviteSnapshotForManualSent(m) : { whatsapp_invite_twilio_sid: null, whatsapp_invite_twilio_status: null }
        return {
          ...m,
          whatsapp_invite_sent_at: ts,
          invite_sent_method: ts ? 'manual_admin' : null,
          whatsapp_invite_twilio_sid: tw.whatsapp_invite_twilio_sid,
          whatsapp_invite_twilio_status: tw.whatsapp_invite_twilio_status,
          updated_at: now,
        }
      })
      await onChange(optimistic)
      try {
        const out = await Promise.all(
          members.map((m) => {
            const tw = ts ? twilioInviteSnapshotForManualSent(m) : { whatsapp_invite_twilio_sid: null, whatsapp_invite_twilio_status: null }
            return updateGuest(m.id, {
              whatsapp_invite_sent_at: ts,
              invite_sent_method: ts ? 'manual_admin' : null,
              whatsapp_invite_twilio_sid: tw.whatsapp_invite_twilio_sid,
              whatsapp_invite_twilio_status: tw.whatsapp_invite_twilio_status,
            })
          }),
        )
        await onChange(out)
      } catch (e) {
        await onChange(previous)
        throw e
      }
    },
    [members, onChange],
  )

  return {
    rep,
    name,
    setName,
    phone,
    setPhone,
    multi,
    allEntered,
    entryMixed,
    enteredCount,
    displayStatus,
    inviteAllSent,
    inviteNoneSent,
    inviteMixed,
    cardOpenAll,
    cardOpenNone,
    cardOpenMixed,
    cardOpenedCount,
    inviteSentCount,
    members: members,
    saveField,
    saveStatus,
    saveCardOpened,
    saveInviteSent,
  }
}

export type GuestGroupRowModel = ReturnType<typeof useGuestGroupRowModel>

function shortCodeHint(code: string): string {
  const t = code.trim()
  if (t.length <= 8) return t
  return `…${t.slice(-6)}`
}

export { shortCodeHint }
