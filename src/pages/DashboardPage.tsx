import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useEvent } from '../context/EventContext'
import { prefetchEventStatsPage, prefetchPartyEventShell } from '../lib/partyEventQueries'
import { logUserActivity } from '../services/loggingApi'

const PREFETCH_TOP_EVENTS = 2

export function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAdmin, isScanner } = useAuth()
  const {
    currentEventId,
    events,
    loading: eventsLoading,
    createEvent,
    deleteEvent,
  } = useEvent()
  const [newEventName, setNewEventName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  const eventEntryPath = useMemo(
    () => (eventId: string) => (isAdmin ? `/events/${eventId}/guests` : `/events/${eventId}`),
    [isAdmin],
  )

  useEffect(() => {
    if (!deleteTarget) {
      setDeletePassword('')
      setDeleteErr(null)
    }
  }, [deleteTarget])

  /** טרום־טעינה: נתוני אירוע/סטט בזמן שדף הבית מוצג — מכין ללחיצה על מסיבה */
  useEffect(() => {
    if (eventsLoading) return
    for (const ev of events.slice(0, PREFETCH_TOP_EVENTS)) {
      prefetchPartyEventShell(queryClient, ev.id)
      prefetchEventStatsPage(queryClient, ev.id)
    }
  }, [eventsLoading, events, queryClient])

  async function onCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    const n = newEventName.trim()
    if (!n || submitting) return
    setErr(null)
    setSubmitting(true)
    try {
      const ev = await createEvent(n)
      setNewEventName('')
      logUserActivity({ kind: 'event', action: 'create', detail: { event_id: ev.id, name: n } })
      navigate(`/events/${ev.id}/guests`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSubmitting(false)
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget || deleteSubmitting) return
    setDeleteErr(null)
    setDeleteSubmitting(true)
    try {
      await deleteEvent(deleteTarget.id, deletePassword)
      logUserActivity({
        kind: 'event',
        action: 'delete_confirmed',
        detail: { event_id: deleteTarget.id, name: deleteTarget.name },
      })
      setDeleteTarget(null)
    } catch (e) {
      const em = e instanceof Error ? e.message : 'שגיאה'
      setDeleteErr(em)
      logUserActivity({
        kind: 'event',
        action: 'delete_error',
        detail: { event_id: deleteTarget.id, error: em },
      })
    } finally {
      setDeleteSubmitting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>דף הבית</h1>
      </header>

      {err && <div className="banner error">{err}</div>}

      {isAdmin && (
        <section className="dash-card">
          <h2 className="dash-card-title">מסיבה חדשה</h2>
          <p className="muted small dash-card-lead">יצירת מסיבה חדשה — אחרי היצירה היא תיבחר כמסיבה הפעילה.</p>
          <form className="dash-quick-form" onSubmit={(e) => void onCreateEvent(e)}>
            <input
              className="input"
              type="text"
              placeholder="מסיבת יום העצמאות"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              disabled={submitting}
            />
            <button type="submit" className="btn" disabled={submitting || !newEventName.trim()}>
              {submitting ? 'יוצר…' : 'צור מסיבה'}
            </button>
          </form>
        </section>
      )}

      {!eventsLoading && events.length > 0 && (
        <section className="dash-card">
          <h2 className="dash-card-title">מסיבות קיימות</h2>
          <p className="muted small dash-card-lead">
            {isAdmin
              ? 'כניסה למסיבה (אורחים, סטטיסטיקה, סריקות כניסה) או מחיקה — מחיקה דורשת סיסמת התחברות.'
              : 'אירועים שהוקצו לכם — סטטיסטיקה וסריקות כניסה.'}
          </p>
          <ul className="events-list">
            {events.map((ev) => (
              <li key={ev.id} className={ev.id === currentEventId ? 'events-list-item current' : 'events-list-item'}>
                <span className="events-list-name">{ev.name}</span>
                <span className="events-list-actions">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => navigate(eventEntryPath(ev.id))}
                  >
                    {isAdmin
                      ? ev.id === currentEventId
                        ? 'פתח ניהול'
                        : 'כניסה למסיבה'
                      : 'כניסה למסיבה'}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => setDeleteTarget({ id: ev.id, name: ev.name })}
                      title="מחיקה (נדרשת סיסמה)"
                    >
                      מחק
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!eventsLoading && events.length === 0 && isScanner && !isAdmin && (
        <section className="dash-card">
          <p className="muted">
            אין מסיבות משויכות לחשבון שלכם. בקשו מאדמין לשייך אתכם כסורקים לאירוע דרך «ניהול סלקטורים» באירוע
            הרלוונטי.
          </p>
        </section>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-event-title">
          <div className="modal">
            <h2 id="delete-event-title">מחיקת מסיבה</h2>
            <p>
              למחוק את <strong>{deleteTarget.name}</strong>? כל האורחים והנתונים של המסיבה יימחקו לצמיתות.
            </p>
            <p className="muted small">
              לאישור, הזינו את <strong>סיסמת ההתחברות</strong> לחשבון שלכם.
            </p>
            {deleteErr && <div className="banner error modal-banner">{deleteErr}</div>}
            <label className="muted small" htmlFor="delete-event-password">
              סיסמה
            </label>
            <input
              id="delete-event-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              disabled={deleteSubmitting}
            />
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setDeleteTarget(null)} disabled={deleteSubmitting}>
                ביטול
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => void onConfirmDelete()}
                disabled={deleteSubmitting || !deletePassword.trim()}
              >
                {deleteSubmitting ? 'מוחק…' : 'מחק לצמיתות'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
