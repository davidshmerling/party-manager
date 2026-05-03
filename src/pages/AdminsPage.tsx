import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AdminUserRow } from '../types/admin'
import {
  adminSetUserDisplayName,
  fetchAdminUsers,
  promoteToAdmin,
  promoteToPartner,
  promoteToScanner,
  removeAdmin,
} from '../services/api'

type Toast = { kind: 'ok' | 'err'; text: string } | null

function tierLabel(r: AdminUserRow): string {
  if (r.is_partner) return 'שותף'
  if (r.profile_role === 'admin') return 'אדמין'
  if (r.profile_role === 'scanner') return 'סלקטור (סורק)'
  return '—'
}

export function AdminsPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savingNameId, setSavingNameId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<Toast>(null)

  const partnerCount = useMemo(() => rows.filter((r) => r.is_partner).length, [rows])

  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const load = useCallback(async () => {
    setListError(null)
    try {
      const data = await fetchAdminUsers()
      setRows(data)
      setNameDraft(Object.fromEntries(data.map((r) => [r.user_id, r.display_name?.trim() ?? ''])))
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'שגיאה בטעינה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function hasProfile(r: AdminUserRow) {
    return r.is_partner || r.profile_role === 'admin' || r.profile_role === 'scanner'
  }

  async function onPromote(userId: string) {
    setBusyId(userId)
    try {
      await promoteToAdmin(userId)
      showToast('ok', 'המשתמש הוגדר כאדמין (ללא הכספים)')
      await load()
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  async function onPromotePartner(userId: string) {
    setBusyId(userId)
    try {
      await promoteToPartner(userId)
      showToast('ok', 'המשתמש הוגדר כשותף (כולל כספים וניהול כאן)')
      await load()
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  async function onPromoteScanner(userId: string) {
    setBusyId(userId)
    try {
      await promoteToScanner(userId)
      showToast('ok', 'המשתמש הוגדר כסורק — ניתן לשייך לאירוע ב«ניהול סלקטורים»')
      await load()
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  async function onSaveDisplayName(r: AdminUserRow) {
    if (!hasProfile(r)) {
      showToast('err', 'אין שורת פרופיל — יש לבחור דרגה (שותף, אדמין או סורק)')
      return
    }
    const id = r.user_id
    const next = (nameDraft[id] ?? '').trim()
    const cur = (r.display_name ?? '').trim()
    if (next === cur) return
    setSavingNameId(id)
    try {
      await adminSetUserDisplayName(id, nameDraft[id] ?? '')
      showToast('ok', 'שם התצוגה עודכן')
      await load()
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה')
      setNameDraft((d) => ({ ...d, [id]: r.display_name?.trim() ?? '' }))
    } finally {
      setSavingNameId(null)
    }
  }

  async function onRemove(userId: string) {
    if (!window.confirm('להסיר תפקיד גלובלי ממשתמש זה?')) return
    setBusyId(userId)
    try {
      await removeAdmin(userId)
      showToast('ok', 'התפקיד הוסר')
      await load()
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>ניהול אדמינים</h1>
        <p className="muted">
          <strong>שותף</strong> — כספים, לוגים, ניהול שותפים. <strong>אדמין</strong> — אורחים ואירועים בלי כספים.{' '}
          <strong>סלקטור (סורק)</strong> — לפי שיוך אירוע בלבד.
        </p>
      </header>

      {toast && (
        <div className={toast.kind === 'ok' ? 'toast toast-ok' : 'toast toast-err'} role="status">
          {toast.text}
        </div>
      )}
      {listError && <div className="banner error">{listError}</div>}

      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Email</th>
              <th>שם תצוגה</th>
              <th>דרגה</th>
              <th>תפקיד (מערכת)</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="muted center">
                  טוען…
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const id = r.user_id
                const isBusy = busyId === id
                const canEditName = hasProfile(r)
                const isSavingName = savingNameId === id
                const isPartner = r.is_partner
                const isTierAdmin = r.profile_role === 'admin' && !r.is_partner
                const isScanner = r.profile_role === 'scanner'
                const hasNoRole = !r.profile_role && !r.is_partner
                const canRemovePartner = isPartner && partnerCount > 1

                return (
                  <tr key={id}>
                    <td className="break-all">{r.email || '—'}</td>
                    <td className="admins-dispname-cell">
                      <div className="admins-dispname-row">
                        <input
                          type="text"
                          className="input admins-dispname-input"
                          value={nameDraft[id] ?? ''}
                          onChange={(e) => setNameDraft((d) => ({ ...d, [id]: e.target.value }))}
                          onBlur={() => void onSaveDisplayName(r)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            }
                          }}
                          disabled={!canEditName || isBusy || isSavingName}
                          title={
                            canEditName
                              ? 'ערוך שם — השמירה ביציאה מהשדה (או Enter)'
                              : 'הגדירו דרגה כדי לשמור שם תצוגה'
                          }
                          placeholder="שם"
                          autoComplete="off"
                          dir="auto"
                        />
                        {canEditName ? (
                          <button
                            type="button"
                            className="btn small secondary admins-dispname-btn"
                            disabled={isBusy || isSavingName}
                            onClick={() => void onSaveDisplayName(r)}
                          >
                            {isSavingName ? '…' : 'שמור'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>{tierLabel(r)}</td>
                    <td className="mono small">{r.profile_role || '—'}</td>
                    <td className="actions">
                      {isPartner && (
                        <button
                          type="button"
                          className="btn small danger"
                          disabled={isBusy || !canRemovePartner}
                          title={!canRemovePartner ? 'חייב להישאר שותף אחד לפחות' : undefined}
                          onClick={() => void onRemove(id)}
                        >
                          הסר שותף
                        </button>
                      )}
                      {isTierAdmin && (
                        <>
                          <button
                            type="button"
                            className="btn small"
                            disabled={isBusy}
                            onClick={() => void onPromotePartner(id)}
                          >
                            קדם לשותף
                          </button>
                          <button
                            type="button"
                            className="btn small danger"
                            disabled={isBusy}
                            onClick={() => void onRemove(id)}
                          >
                            הסר אדמין
                          </button>
                        </>
                      )}
                      {isScanner && (
                        <button
                          type="button"
                          className="btn small"
                          disabled={isBusy}
                          onClick={() => void onPromote(id)}
                        >
                          הפוך לאדמין
                        </button>
                      )}
                      {hasNoRole && (
                        <>
                          <button
                            type="button"
                            className="btn small"
                            disabled={isBusy}
                            onClick={() => void onPromote(id)}
                          >
                            אדמין
                          </button>
                          <button
                            type="button"
                            className="btn small"
                            disabled={isBusy}
                            onClick={() => void onPromotePartner(id)}
                          >
                            שותף
                          </button>
                          <button
                            type="button"
                            className="btn small secondary"
                            disabled={isBusy}
                            onClick={() => void onPromoteScanner(id)}
                          >
                            סורק
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
