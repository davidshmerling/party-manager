import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { LANDING_PATH } from '../constants/appRoutes'

/** דפי ניהול אירוע/אורחים — session + ‎role שותף או אדמין (לא סורק בלבד) */
export function RequireAdmin() {
  const location = useLocation()
  const { loading, session, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="login-page">
        <p className="muted">טוען…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to={LANDING_PATH} replace state={{ from: location }} />
  }

  if (!isAdmin) {
    return <Navigate to="/not-authorized" replace />
  }

  return <Outlet />
}
