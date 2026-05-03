import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { LANDING_PATH } from '../constants/appRoutes'

/** ניהול אורחים / צוות / כרטיס — אדמין או שותף בלבד */
export function RequireEventPartyAdmin() {
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
