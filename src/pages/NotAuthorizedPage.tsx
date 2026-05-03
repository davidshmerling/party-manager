import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { LANDING_PATH, STAFF_HOME_PATH } from '../constants/appRoutes'

export function NotAuthorizedPage() {
  const { loading, session, signOut, isAdmin } = useAuth()

  async function onSignOut() {
    await signOut()
  }

  if (loading) {
    return (
      <div className="login-page">
        <p className="muted">טוען…</p>
      </div>
    )
  }

  if (isAdmin) {
    return <Navigate to={STAFF_HOME_PATH} replace />
  }

  return (
    <div className="login-page">
      <div className="login-box not-authorized">
        <h1 className="login-title">היי, אתה לא אדמין</h1>
        <p className="muted small">אם אתה אמור לקבל גישה, פנה למנהל המערכת.</p>
        {session ? (
          <div className="login-form">
            <button type="button" className="btn secondary" onClick={() => void onSignOut()}>
              התנתק
            </button>
          </div>
        ) : (
          <p className="login-form">
            <Link to={LANDING_PATH}>התחברות</Link>
          </p>
        )}
      </div>
    </div>
  )
}
