import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useEvent } from '../context/EventContext'
import {
  fetchEventRow,
  fetchPreviewGuestGroupForEvent,
  fetchTwilioBalanceForEvent,
  guestCardUrl,
  submitWhatsAppInviteTemplateApproval,
  syncWhatsAppInviteTemplateStatus,
  updateEventCardTexts,
} from '../services/api'
import type { Guest } from '../types/guest'
import { groupGuestsByIdentity } from '../utils/guestIdentity'
import { DEFAULT_WHATSAPP_INVITE_TEMPLATE, renderWhatsAppInvite } from '../utils/whatsapp'

const DEMO_NAME = 'ישראל ישראלי'

/** עריכת תבנית הודעת wa.me + תצוגה מקדימה (אדמין) — נפרד מדף תצוגת הכרטיס */
export function EventWhatsAppInvitePage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { currentEvent, refreshEvents } = useEvent()
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [waTemplate, setWaTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [twilioMeta, setTwilioMeta] = useState<{
    sid: string | null
    approvalName: string | null
    status: string | null
    category: string | null
    submittedAt: string | null
    slots: number[]
  }>({
    sid: null,
    approvalName: null,
    status: null,
    category: null,
    submittedAt: null,
    slots: [],
  })
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [approvalCategory, setApprovalCategory] = useState<'UTILITY' | 'MARKETING'>('UTILITY')
  const [approvalOkMsg, setApprovalOkMsg] = useState<string | null>(null)
  const [previewGuests, setPreviewGuests] = useState<Guest[]>([])
  const [twilioBalance, setTwilioBalance] = useState<{ balance: number; currency: string } | null>(null)
  const [twilioBalanceErr, setTwilioBalanceErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!eventId) return
    setErr(null)
    setLoading(true)
    try {
      setSyncNote(null)
      let ev = await fetchEventRow(eventId)
      const sid = ev.whatsapp_twilio_content_sid?.trim() ?? ''
      if (sid.startsWith('HX')) {
        try {
          const sync = await syncWhatsAppInviteTemplateStatus(eventId)
          setSyncNote(
            sync.whatsapp_status.toLowerCase() === 'approved'
              ? 'סטטוס האישור עודכן מטווילו — התבנית מאושרת לשליחה.'
              : `סטטוס מעודכן מטווילו: ${sync.whatsapp_status}`,
          )
          await refreshEvents()
          ev = await fetchEventRow(eventId)
        } catch {
          /* אם הסנכרון נכשל — ממשיכים עם הנתונים מהמסד */
        }
      }
      const stored = ev.whatsapp_invite_template?.trim()
      setWaTemplate(stored || DEFAULT_WHATSAPP_INVITE_TEMPLATE)
      setTwilioMeta({
        sid: ev.whatsapp_twilio_content_sid,
        approvalName: ev.whatsapp_twilio_content_name,
        status: ev.whatsapp_twilio_content_status,
        category: ev.whatsapp_twilio_content_category,
        submittedAt: ev.whatsapp_twilio_content_submitted_at,
        slots: ev.whatsapp_twilio_placeholder_slots ?? [],
      })
      const guests = await fetchPreviewGuestGroupForEvent(eventId)
      setPreviewGuests(guests)
      try {
        const b = await fetchTwilioBalanceForEvent(eventId)
        setTwilioBalance({ balance: b.balance, currency: b.currency })
        setTwilioBalanceErr(null)
      } catch {
        setTwilioBalance(null)
        setTwilioBalanceErr('לא ניתן לטעון יתרת Twilio')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בטעינה')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  const firstGuestGroup = useMemo(
    () => groupGuestsByIdentity(previewGuests)[0] ?? [],
    [previewGuests],
  )

  const demoBundleCode = firstGuestGroup[0]?.invite_bundle_code ?? 'PREVIEW'
  const eventLabel = currentEvent?.name?.trim() || 'האירוע'
  const waInviteUrls = useMemo(() => [guestCardUrl(demoBundleCode)], [demoBundleCode])
  const waPreviewBody = renderWhatsAppInvite(waTemplate, DEMO_NAME, waInviteUrls, eventLabel)

  const balanceLowYellow =
    twilioBalance != null && twilioBalance.balance < 5 && twilioBalance.balance >= 2
  const balanceLowRed = twilioBalance != null && twilioBalance.balance < 2

  async function onSave() {
    if (!eventId) return
    setSaving(true)
    setErr(null)
    try {
      const trimmed = waTemplate.trim()
      const sameAsDefault = trimmed === DEFAULT_WHATSAPP_INVITE_TEMPLATE.trim()
      await updateEventCardTexts(eventId, {
        whatsapp_invite_template: trimmed === '' || sameAsDefault ? null : trimmed,
      })
      if (trimmed === '') setWaTemplate(DEFAULT_WHATSAPP_INVITE_TEMPLATE)
      await refreshEvents()
      setApprovalOkMsg(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  async function onSubmitTwilioApproval() {
    if (!eventId) return
    setApprovalBusy(true)
    setErr(null)
    setApprovalOkMsg(null)
    try {
      const out = await submitWhatsAppInviteTemplateApproval(eventId, {
        category: approvalCategory,
      })
      setApprovalOkMsg(
        `נוצר תוכן בטווילו ונשלח לאישור Meta. SID: ${out.content_sid}. סטטוס ראשוני: ${out.approval_status || '—'}`,
      )
      await refreshEvents()
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בשליחה לאישור')
    } finally {
      setApprovalBusy(false)
    }
  }

  return (
    <div className="page event-wa-invite-page">
      <header className="page-head">
        <h1>הודעת וואטסאפ</h1>
        <p className="muted">
          תבנית ההודעה ל־wa.me לאירוע <strong>{currentEvent?.name ?? '—'}</strong>. כאן נערך רק הטקסט שנשלח עם
          הקישור לכרטיס.
        </p>
      </header>

      {err && <div className="banner error">{err}</div>}
      {approvalOkMsg && (
        <div className="banner ok" role="status">
          {approvalOkMsg}
        </div>
      )}
      {syncNote && (
        <div className="banner info" role="status">
          {syncNote}
        </div>
      )}
      {twilioBalanceErr && (
        <div className="banner error" role="status">
          {twilioBalanceErr}
        </div>
      )}
      {twilioBalance != null && !twilioBalanceErr ? (
        <div
          className={`banner ${balanceLowRed ? 'error' : balanceLowYellow ? 'warn' : 'info'}`}
          role="status"
        >
          יתרת Twilio:{' '}
          <strong dir="ltr">
            {twilioBalance.currency} {twilioBalance.balance.toFixed(2)}
          </strong>
          {balanceLowRed
            ? ' — מתחת ל־2: שליחת הודעות חסומה עד טעינת חשבון.'
            : balanceLowYellow
              ? ' — מתחת ל־5: מומלץ לטעון בקרוב.'
              : null}
        </div>
      ) : null}

      {loading ? (
        <p className="muted">טוען…</p>
      ) : (
        <div className="event-card-preview-grid">
          <section className="dash-card event-card-preview-editor">
            <h2 className="dash-card-title">תבנית הודעה (wa.me)</h2>
            <p className="muted small event-card-wa-hint">
              מתחילים מטקסט ברירת המחדל — אפשר לערוך כאן. <strong>{'{link}'}</strong> הוא קישור אחד לדף הכרטיס
              של האורח (כל ה־QR באותו דף). מציינים: <code className="wa-placeholder-code">{'{name}'}</code> ו־
              <code className="wa-placeholder-code">{'{link}'}</code>.
            </p>
            <label className="event-card-field">
              <span>תוכן ההודעה</span>
              <textarea
                className="input event-card-wa-textarea"
                rows={8}
                dir="rtl"
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                placeholder={'עריכת ההודעה — {name} ו־{link}'}
              />
            </label>

            <button type="button" className="btn" disabled={saving} onClick={() => void onSave()}>
              {saving ? 'שומר…' : 'שמור'}
            </button>

            <p className="muted small" style={{ marginTop: '0.85rem', maxWidth: '42rem' }}>
              <strong>אישור WhatsApp עסקי (Twilio)</strong>: לאחר שמירת התבנית, אפשר לשלוח לטווילו/Meta לאישור.
              המערכת ממירה את{' '}
              <code className="wa-placeholder-code">{'{name}'}</code>,{' '}
              <code className="wa-placeholder-code">{'{link}'}</code> /{' '}
              <code className="wa-placeholder-code">{'{links}'}</code>,{' '}
              <code className="wa-placeholder-code">{'{event}'}</code> ל־{'{{1}}'}, {'{{2}}'}, {'{{3}}'} בהתאמה (כמו שדורש Meta).
            </p>
            <div
              className="event-wa-twilio-row"
              style={{
                marginTop: '0.5rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                alignItems: 'center',
              }}
            >
              <label className="muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                קטגוריה (Meta)
                <select
                  className="input"
                  style={{ maxWidth: '13rem', minHeight: '2.25rem' }}
                  value={approvalCategory}
                  disabled={approvalBusy || saving}
                  onChange={(e) => setApprovalCategory(e.target.value as 'UTILITY' | 'MARKETING')}
                >
                  <option value="UTILITY">שימושי (UTILITY)</option>
                  <option value="MARKETING">שיווקי (MARKETING)</option>
                </select>
              </label>
              <button
                type="button"
                className="btn"
                disabled={saving || approvalBusy}
                onClick={() => void onSubmitTwilioApproval()}
              >
                {approvalBusy ? 'שולח לאישור…' : 'שלח לאישור WhatsApp (Twilio)'}
              </button>
            </div>

            {(twilioMeta.sid ?? twilioMeta.status) ? (
              <div className="muted small" style={{ marginTop: '0.85rem', maxWidth: '42rem' }} dir="rtl">
                <strong>סטטוס Twilio אחרון:</strong>{' '}
                {twilioMeta.status ?? '—'}
                {twilioMeta.submittedAt ? (
                  <>
                    {' · '}
                    <span dir="ltr">{twilioMeta.submittedAt}</span>
                  </>
                ) : null}
                {twilioMeta.category ? <> · קטגוריה: {twilioMeta.category}</> : null}
                {twilioMeta.slots?.length ? (
                  <>
                    {' · '}
                    משתנים:{' '}
                    <span dir="ltr">{twilioMeta.slots.join(', ')}</span>
                  </>
                ) : null}
                {twilioMeta.sid ? (
                  <>
                    <br />
                    Content SID: <code dir="ltr">{twilioMeta.sid}</code>
                  </>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="event-card-preview-panel">
            <h2 className="dash-card-title">תצוגה מקדימה</h2>
            <div className="wa-preview-phone" dir="rtl">
              <div className="wa-preview-bubble">
                <div className="wa-preview-body">{waPreviewBody}</div>
                <div className="wa-preview-meta">
                  <span className="wa-preview-time">12:34</span>
                  <span className="wa-preview-ticks" aria-hidden>
                    ✓✓
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
