import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { LANDING_PATH } from '../constants/appRoutes'

/** כספים באירוע — שותף בלבד */
export function RequireEventPartyPartner() {
  const location = useLocation()
  const { loading, session, isPartner } = useAuth()

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

  if (!isPartner) {
    return <Navigate to="/not-authorized" replace />
  }

  return <Outlet />
}
