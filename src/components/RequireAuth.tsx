import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { LANDING_PATH } from '../constants/appRoutes'

/** משתמש מחובר + שורת profile */
export function RequireAuth() {
  const location = useLocation()
  const { loading, session, profile } = useAuth()

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

  if (!profile) {
    return <Navigate to="/not-authorized" replace />
  }

  return <Outlet />
}
