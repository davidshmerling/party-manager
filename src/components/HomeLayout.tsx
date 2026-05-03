import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { LANDING_PATH, STAFF_HOME_PATH } from '../constants/appRoutes'

/** דף הבית + אדמינים — בלי מסך ניהול מסיבה */
export function HomeLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { signOut, profile, user, isPartner } = useAuth()

  async function handleLogout() {
    await signOut()
    navigate(LANDING_PATH, { replace: true })
  }

  const onHome = pathname === STAFF_HOME_PATH
  const onLogs = pathname === '/logs'

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">QR Party</span>
        <nav className="nav">
          <Link to={STAFF_HOME_PATH} className={onHome ? 'active' : undefined} aria-current={onHome ? 'page' : undefined}>
            דף הבית
          </Link>
          {isPartner && (
            <Link to="/logs" className={onLogs ? 'active' : undefined} aria-current={onLogs ? 'page' : undefined}>
              לוגים
            </Link>
          )}
          {/* ניהול קבלות: נתיב /receipts ו-PartnerReceiptsAdminPage נשארים — הוסיפו שוב כשתחוברו לסולק */}
          {isPartner && (
            <Link to="/site-images" className={pathname === '/site-images' ? 'active' : undefined}>
              תמונות אתר
            </Link>
          )}
          {isPartner && (
            <Link to="/admins" className={pathname === '/admins' ? 'active' : undefined}>
              אדמינים
            </Link>
          )}
          {(user?.email ?? profile?.email) && (
            <span className="muted small">{user?.email ?? profile?.email}</span>
          )}
          <button type="button" className="nav-link-btn" onClick={() => void handleLogout()}>
            יציאה
          </button>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
