import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { GuestCardTicketSlider } from '../components/GuestCardTicketSlider'
import { useEvent } from '../context/EventContext'
import { fetchEventRow, fetchPreviewGuestGroupForEvent, updateEventCardTexts } from '../services/api'
import { DEFAULT_CARD_TEXT_TERMS } from '../utils/cardText'
import type { Guest } from '../types/guest'
import { groupGuestsByIdentity } from '../utils/guestIdentity'

const DEMO_NAME = 'ישראל ישראלי'

/** עריכת טקסטים לכרטיס הציבורי + תצוגה מקדימה של ה-QR (אדמין) */
export function EventCardPreviewPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { currentEvent, refreshEvents } = useEvent()
  const [above, setAbove] = useState('')
  const [instruction, setInstruction] = useState('')
  const [below, setBelow] = useState('')
  const [terms, setTerms] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [previewGuests, setPreviewGuests] = useState<Guest[]>([])
  const [demoTicketCount, setDemoTicketCount] = useState(1)

  const load = useCallback(async () => {
    if (!eventId) return
    setErr(null)
    setLoading(true)
    try {
      const ev = await fetchEventRow(eventId)
      setAbove(ev.card_text_above ?? '')
      setInstruction(ev.card_text_instruction ?? '')
      setBelow(ev.card_text_below ?? '')
      setTerms(ev.card_text_terms ?? '')
      const guests = await fetchPreviewGuestGroupForEvent(eventId)
      setPreviewGuests(guests)
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

  const qrCodesForPreview = useMemo(() => {
    return Array.from({ length: demoTicketCount }, (_, i) => {
      if (firstGuestGroup[i]) return firstGuestGroup[i]!.unique_code
      const b = demoBundleCode
      return i === 0 ? b : `${b}-דמו${i + 1}`
    })
  }, [demoTicketCount, firstGuestGroup, demoBundleCode])

  async function onSave() {
    if (!eventId) return
    setSaving(true)
    setErr(null)
    try {
      await updateEventCardTexts(eventId, {
        card_text_above: above.trim() || null,
        card_text_instruction: instruction.trim() || null,
        card_text_below: below.trim() || null,
        card_text_terms: terms.trim() || null,
      })
      await refreshEvents()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page event-card-preview-page">
      <header className="page-head">
        <h1>תצוגת כרטיס / QR</h1>
        <p className="muted">
          איך נראה כרטיס האורח בדף הציבורי (ברקוד לסריקה בכניסה). אירוע:{' '}
          <strong>{currentEvent?.name ?? '—'}</strong>
        </p>
        <p className="muted small event-card-scope-note">
          הטקסטים כאן שייכים ל<strong>כל המסיבה</strong>: אחרי «שמור» אותם טקסטים מופיעים אצל{' '}
          <strong>כל האורחים</strong> בדף הכרטיס — לא לפי אורח בודד.
        </p>
      </header>

      {err && <div className="banner error">{err}</div>}

      {loading ? (
        <p className="muted">טוען…</p>
      ) : (
        <div className="event-card-preview-grid">
          <section className="dash-card event-card-preview-editor">
            <h2 className="dash-card-title">טקסטים על הכרטיס</h2>
            <p className="muted small dash-card-lead">
              בכרטיס האמיתי מופיע שם האורח אחרי הברכה (שונה לכל אורח); שאר הניסוח משותף לכולם. כאן:{' '}
              <strong>{DEMO_NAME}</strong> לדוגמה. ברכה ריקה = «היי»; משפט לפני ה-QR ריק = ברירת מחדל (כניסה). סימן «.»
              בלבד בשדה = ללא אותה שורה (לא ברירת מחדל). <strong>תנאי שימוש בתחתית:</strong> שדה ריק במסד = הנוסח
              המוכן מראש למטה; «.» בלבד בתיבה = הסתרה לגמרי (שמירה בשדה הריק מאפשרת לחזור לברירת המחדל).
            </p>
            <label className="event-card-field">
              <span>ברכה לפני השם (ברירת מחדל: היי)</span>
              <textarea
                className="input"
                rows={2}
                dir="rtl"
                value={above}
                onChange={(e) => setAbove(e.target.value)}
                placeholder="היי"
              />
            </label>
            <label className="event-card-field">
              <span>טקסט בין השם ל-QR (אופציונלי)</span>
              <textarea
                className="input"
                rows={3}
                dir="rtl"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="הוסיפו כאן טקסט — או השאירו ריק לברירת המחדל"
              />
            </label>
            <label className="event-card-field">
              <span>טקסט מתחת ל-QR</span>
              <p className="muted small event-card-inline-link-hint">
                כתובות כמו ‎<code dir="ltr">app.com/...</code> או ‎<code dir="ltr">https://...</code> מוצגות אוטומטית כקישור נפתח.
              </p>
              <textarea
                className="input"
                rows={3}
                dir="rtl"
                value={below}
                onChange={(e) => setBelow(e.target.value)}
                placeholder="למשל: שמרו את המסך בטלפון"
              />
            </label>
            <label className="event-card-field">
              <span>תנאי שימוש (בתחתית הכרטיס — קטן יותר מהשאר)</span>
              <textarea
                className="input"
                rows={4}
                dir="rtl"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder={DEFAULT_CARD_TEXT_TERMS}
              />
            </label>

            <button type="button" className="btn" disabled={saving} onClick={() => void onSave()}>
              {saving ? 'שומר…' : 'שמור'}
            </button>
          </section>

          <section className="event-card-preview-panel">
            <h2 className="dash-card-title">תצוגה מקדימה</h2>
            <label className="event-card-field event-card-demo-tickets-field">
              <span>כמה כרטיסים יש לאותו אורח בדוגמה (1–5)</span>
              <select
                className="input event-card-demo-tickets-select"
                value={demoTicketCount}
                onChange={(e) => setDemoTicketCount(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              בדף האמיתי נפתחים מספר ברקודים (לכל כרטיס קוד סריקה נפרד) תחת אותו קישור מההזמנה. כאן בוחרים
              כמה כרטיסים לדמות.
              {previewGuests.length === 0
                ? ' (אין עדיין אורחים — דמו עם קוד PREVIEW; הוסיפו אורחים לרשימה לראות נתונים אמיתיים).'
                : ''}
            </p>
            <div className="device-phone-preview">
              <div
                className="device-phone-preview__chassis"
                role="img"
                aria-label="תצוגת טלפון — כך נראה הכרטיס אצל האורח"
              >
                <div className="device-phone-preview__island" aria-hidden />
                <div className="device-phone-preview__screen">
                  <div className="guest-card-page guest-card-page--embedded guest-card-page--phone-sim">
                    <GuestCardTicketSlider
                      key={`${demoTicketCount}-${qrCodesForPreview.join('|')}`}
                      codes={qrCodesForPreview}
                      initialIndex={0}
                      guestName={DEMO_NAME}
                      textAbove={above.trim() || null}
                      textInstruction={instruction.trim() || null}
                      textBelow={below.trim() || null}
                      textTerms={terms.trim() || null}
                      variant="glass"
                    />
                  </div>
                </div>
              </div>
              <p className="muted small device-phone-preview__caption">
                תצוגה כמו בטלפון של האורח (אותו עיצוב כמו בדף הציבורי).
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
