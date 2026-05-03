import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useEvent } from '../context/EventContext'
import type { AdminUserRow } from '../types/admin'
import type { EventStaffRow } from '../types/event'
import { addEventStaffMember, fetchGlobalStaffUsers, listEventStaff, removeEventStaffMember } from '../services/api'

export function EventStaffPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { currentEvent } = useEvent()
  const [staff, setStaff] = useState<EventStaffRow[]>([])
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!eventId) return
    setErr(null)
    setLoading(true)
    try {
      const [s, u] = await Promise.all([listEventStaff(eventId), fetchGlobalStaffUsers()])
      setStaff(s)
      setUsers(u)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  /** אדמין גלובלי לא יכול להיות סורק — רק משתמשים עם role = scanner בפרופיל */
  const availableToAdd = users.filter(
    (u) =>
      u.profile_role === 'scanner' &&
      !staff.some((row) => row.user_id === u.user_id && row.role === 'scanner'),
  )

  async function onAddScanner() {
    if (!eventId || !selectedUserId) return
    setBusy(true)
    setErr(null)
    try {
      const u = users.find((x) => x.user_id === selectedUserId)
      if (!u || u.profile_role !== 'scanner') {
        setErr('ניתן לשייך רק משתמשים עם תפקיד «סורק» בפרופיל (לא אדמינים).')
        return
      }
      await addEventStaffMember(eventId, u.user_id, 'scanner')
      setSelectedUserId('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(userId: string) {
    if (!eventId || !window.confirm('להסיר שיוך סורק מהאירוע?')) return
    setBusy(true)
    setErr(null)
    try {
      await removeEventStaffMember(eventId, userId)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>ניהול סלקטורים — סורקים</h1>
        <p className="muted">
          אירוע: <strong>{currentEvent?.name ?? '—'}</strong> — רק משתמשים שהוגדרו כ<strong>סורקים</strong> בדף
          «אדמינים» (אדמין גלובלי לא יכול להיות סורק).
        </p>
      </header>

      {err && <div className="banner error">{err}</div>}

      {loading ? (
        <p className="muted">טוען…</p>
      ) : (
        <>
          <section className="dash-card">
            <h2 className="dash-card-title">הוספת סורק לאירוע</h2>
            <p className="muted small">
              ברשימה מופיעים רק משתמשים עם תפקיד סורק. אם אין מישהו — הגדירו «סורק» בדף «אדמינים» (לא ניתן להפוך אדמין לסורק).
            </p>
            <div className="toolbar" style={{ marginTop: '0.5rem' }}>
              <select
                className="input"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={busy}
              >
                <option value="">— בחרו משתמש —</option>
                {availableToAdd.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.email || u.user_id} {u.profile_role ? `(${u.profile_role})` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" disabled={busy || !selectedUserId} onClick={() => void onAddScanner()}>
                הוסף סורק
              </button>
            </div>
          </section>

          <section className="dash-card" style={{ marginTop: '1rem' }}>
            <h2 className="dash-card-title">משויכים לאירוע</h2>
            {staff.length === 0 ? (
              <p className="muted">אין עדיין שיוכים.</p>
            ) : (
              <div className="sheet-wrap">
                <table className="sheet">
                  <thead>
                    <tr>
                      <th>מייל</th>
                      <th>תפקיד</th>
                      <th>פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((row) => (
                      <tr key={row.id}>
                        <td className="break-all">{row.email || '—'}</td>
                        <td>{row.role === 'scanner' ? 'סורק' : 'אדמין אירוע'}</td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn small danger"
                            disabled={busy}
                            onClick={() => void onRemove(row.user_id)}
                          >
                            הסר
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
