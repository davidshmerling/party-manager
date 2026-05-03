import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchTwilioBalanceForEvent,
  fetchWhatsAppMessagesForGuests,
  sendWhatsAppChatMessage,
} from '../../services/api'
import { sb } from '../../services/api/client'
import type { WhatsAppMessageRow } from '../../types/guest'

const SESSION_MS = 24 * 60 * 60 * 1000

export type GuestWhatsAppChatPanelProps = {
  eventId: string
  guestId: string
  onClose: () => void
}

export function GuestWhatsAppChatPanel({ eventId, guestId, onClose }: GuestWhatsAppChatPanelProps) {
  const [guestName, setGuestName] = useState('')
  const [lastInboundAt, setLastInboundAt] = useState<string | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [balance, setBalance] = useState<{ n: number; cur: string } | null>(null)

  const load = useCallback(async () => {
    if (!eventId || !guestId) return
    setErr(null)
    setGuestName('')
    setLastInboundAt(null)
    setLoading(true)
    try {
      const { data: gRow, error: gErr } = await sb()
        .from('guests')
        .select('name, whatsapp_last_inbound_at, invite_sent_method, whatsapp_invite_sent_at')
        .eq('id', guestId)
        .eq('event_id', eventId)
        .is('deleted_at', null)
        .maybeSingle()
      if (gErr) throw new Error(gErr.message)
      if (!gRow) {
        setErr('אורח לא נמצא')
        setLoading(false)
        return
      }
      setGuestName(String(gRow.name ?? '').trim() || 'אורח')
      const method = String(gRow.invite_sent_method ?? '').trim().toLowerCase()
      if (method !== 'twilio' || gRow.whatsapp_invite_sent_at == null) {
        setErr('שיחה זמינה רק אחרי שליחת הזמנה דרך Twilio')
        setLoading(false)
        return
      }
      setLastInboundAt(
        gRow.whatsapp_last_inbound_at != null ? String(gRow.whatsapp_last_inbound_at) : null,
      )

      const { data: sib, error: sibErr } = await sb().rpc('guest_ids_same_identity_in_event', {
        p_event_id: eventId,
        p_seed_ids: [guestId],
      })
      if (sibErr) throw new Error(sibErr.message)
      const ids = Array.isArray(sib) && sib.length > 0 ? (sib as string[]) : [guestId]

      const [msgs, bal] = await Promise.all([
        fetchWhatsAppMessagesForGuests(eventId, ids),
        fetchTwilioBalanceForEvent(eventId).catch(() => null),
      ])
      setMessages(msgs)
      if (bal) setBalance({ n: bal.balance, cur: bal.currency })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בטעינה')
    } finally {
      setLoading(false)
    }
  }, [eventId, guestId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!eventId) return
    const channel = sb()
      .channel(`wa-chat-panel-${eventId}-${guestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `event_id=eq.${eventId}` },
        () => {
          void load()
        },
      )
      .subscribe()
    return () => {
      void sb().removeChannel(channel)
    }
  }, [eventId, guestId, load])

  const inSession = useMemo(() => {
    if (!lastInboundAt) return false
    const t = new Date(lastInboundAt).getTime()
    return Number.isFinite(t) && Date.now() - t < SESSION_MS
  }, [lastInboundAt])

  const balanceBlocked = balance != null && balance.n < 2
  const balanceWarn = balance != null && balance.n < 5 && balance.n >= 2

  async function onSend() {
    if (!eventId || !guestId || !draft.trim() || sending) return
    setErr(null)
    setSending(true)
    try {
      await sendWhatsAppChatMessage(eventId, guestId, draft.trim())
      setDraft('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="wa-chat-panel wa-chat-panel--sheet">
      <header className="wa-chat-head">
        <button type="button" className="btn secondary wa-chat-back" onClick={onClose} aria-label="סגור">
          ✕
        </button>
        <div className="wa-chat-head-text">
          <h1 className="wa-chat-title">WhatsApp</h1>
          <p className="muted small wa-chat-sub">{guestName || '…'}</p>
        </div>
        <span className="wa-chat-head-spacer" />
      </header>

      {balanceWarn && !balanceBlocked ? (
        <div className="banner warn wa-chat-balance-banner" role="status">
          יתרת Twilio נמוכה ({balance!.cur} {balance!.n.toFixed(2)}) — מומלץ לטעון חשבון.
        </div>
      ) : null}
      {balanceBlocked ? (
        <div className="banner error wa-chat-balance-banner" role="alert">
          יתרת Twilio מתחת ל־2 {balance?.cur ?? '$'} — שליחת הודעות חסומה.
        </div>
      ) : null}

      {err ? <div className="banner error">{err}</div> : null}

      {loading ? (
        <p className="muted">טוען…</p>
      ) : (
        <>
          <p className="muted small wa-chat-session-hint">
            {inSession
              ? 'חלון 24 השעות פתוח — אפשר לשלוח טקסט חופשי.'
              : 'חלון 24 השעות מההודעה האחרונה של האורח נסגר. שליחה נוספת דורשת תבנית מאושרת ב-Twilio.'}
          </p>
          <div className="wa-chat-thread" dir="rtl" aria-live="polite">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`wa-chat-row wa-chat-row--${m.direction === 'outbound' ? 'out' : 'in'}`}
              >
                <div className="wa-chat-bubble">
                  <div className="wa-chat-bubble-body">{m.body || '—'}</div>
                  <div className="wa-chat-bubble-meta">
                    <span className="wa-chat-time">
                      {new Date(m.created_at).toLocaleTimeString('he-IL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {m.direction === 'outbound' ? (
                      <span className="wa-chat-mini-st">{m.status}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <footer className="wa-chat-compose">
            <textarea
              className="input wa-chat-input"
              dir="rtl"
              rows={2}
              placeholder="כתבו הודעה…"
              value={draft}
              disabled={!inSession || balanceBlocked || sending}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={!inSession || balanceBlocked || sending || !draft.trim()}
              onClick={() => void onSend()}
            >
              {sending ? 'שולח…' : 'שלח'}
            </button>
          </footer>
        </>
      )}
    </div>
  )
}
