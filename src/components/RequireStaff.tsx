import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { LANDING_PATH, LANDING_UPCOMING_PARTIES_ID } from '../constants/appRoutes'

/** שותף / אדמין גלובלי / סורק — לא משתמש member */
export function RequireStaff() {
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

  if (profile.role === 'member') {
    return <Navigate to={{ pathname: LANDING_PATH, hash: LANDING_UPCOMING_PARTIES_ID }} replace />
  }

  const staff =
    profile.role === 'partner' || profile.role === 'admin' || profile.role === 'scanner'

  if (!staff) {
    return <Navigate to="/not-authorized" replace />
  }

  return <Outlet />
}
