import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useEvent } from '../context/EventContext'
import { usePartyViewMode } from '../context/PartyViewModeContext'
import { LANDING_PATH, STAFF_HOME_PATH } from '../constants/appRoutes'
import {
  prefetchEventFinancePage,
  prefetchEventGuestsPage,
  prefetchEventStatsPage,
  prefetchPartyEventShell,
} from '../lib/partyEventQueries'
/* אינטגרציית תשלום (מוק): import { PartyPaymentNextMockButton } from './PartyPaymentNextMockButton' — הוסיפו בשורת הניווט למטה */

/** ניהול מסיבה בודדת — אורחים (אדמין), סטטיסטיקה, סריקות כניסה */
export function PartyLayout() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { signOut, profile, user } = useAuth()
  const { showScannerExperience, showAdminPartyNav, showPartnerPartyNav } = usePartyViewMode()
  const { events, setCurrentEventId, loading, currentEvent } = useEvent()

  const prefetchShell = useCallback(() => {
    if (eventId) prefetchPartyEventShell(queryClient, eventId)
  }, [eventId, queryClient])
  /** רק נתוני סטטיסטיקה + גרף — המעטפת כבר נטענת בכניסה לדף המסיבה */
  const prefetchStats = useCallback(() => {
    if (eventId) prefetchEventStatsPage(queryClient, eventId)
  }, [eventId, queryClient])
  const prefetchGuestsNav = useCallback(() => {
    if (eventId) prefetchEventGuestsPage(queryClient, eventId)
  }, [eventId, queryClient])
  const prefetchFinance = useCallback(() => {
    if (eventId) prefetchEventFinancePage(queryClient, eventId)
  }, [eventId, queryClient])

  const adminLabel = useMemo(() => {
    const d = profile?.display_name?.trim()
    if (d) return d
    return user?.email ?? profile?.email ?? ''
  }, [profile?.display_name, profile?.email, user?.email])

  useEffect(() => {
    if (!eventId || loading) return
    const ok = events.some((e) => e.id === eventId)
    if (ok) {
      setCurrentEventId(eventId)
    } else {
      navigate(STAFF_HOME_PATH, { replace: true })
    }
  }, [eventId, events, loading, navigate, setCurrentEventId])

  /** פרילוד בהתחלה למסיבה: מעטפת + סטטיסטיקה/נקודות לגרף (רכיב הרכמה של הגרף נשאר lazy) */
  useEffect(() => {
    if (!eventId || loading) return
    if (!events.some((e) => e.id === eventId)) return
    prefetchPartyEventShell(queryClient, eventId)
    prefetchEventStatsPage(queryClient, eventId)
  }, [eventId, events, loading, queryClient])

  async function handleLogout() {
    await signOut()
    navigate(LANDING_PATH, { replace: true })
  }

  function goBackToParties() {
    setCurrentEventId('')
    navigate(STAFF_HOME_PATH)
  }

  if (!eventId || loading) {
    return (
      <div className="page">
        <p className="muted">טוען…</p>
      </div>
    )
  }

  if (!events.some((e) => e.id === eventId)) {
    return null
  }

  const base = `/events/${eventId}`

  return (
    <div className="layout">
      <header className="topbar party-topbar">
        <div className="party-topbar-row party-topbar-row-user">
          <span className="brand">QR Party</span>
          <div className="party-topbar-user">
            {adminLabel && <span className="muted small party-admin-label">{adminLabel}</span>}
            <button type="button" className="nav-link-btn" onClick={() => void handleLogout()}>
              יציאה
            </button>
            <button type="button" className="nav-link-btn" onClick={goBackToParties}>
              חזרה לדף הבית
            </button>
          </div>
        </div>
        <div className="party-topbar-row party-topbar-row-event">
          <h2 className="party-event-title" title={currentEvent?.name}>
            {currentEvent?.name ?? 'מסיבה'}
          </h2>
          <nav className="nav party-nav-tabs" aria-label="ניווט מסיבה">
            {showScannerExperience && (
              <>
                <NavLink
                  to={`${base}/stats`}
                  onMouseEnter={prefetchStats}
                  className={({ isActive }) => (isActive ? 'active' : undefined)}
                >
                  סטטיסטיקה
                </NavLink>
                <NavLink
                  to={`${base}/scan`}
                  onMouseEnter={prefetchShell}
                  className={({ isActive }) => (isActive ? 'active' : undefined)}
                >
                  סריקות כניסה
                </NavLink>
              </>
            )}
            {showAdminPartyNav && (
              <NavLink
                end
                to={`${base}/guests`}
                onMouseEnter={prefetchGuestsNav}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                ניהול אורחים
              </NavLink>
            )}
            {showAdminPartyNav && (
              <NavLink
                to={`${base}/card-preview`}
                onMouseEnter={prefetchGuestsNav}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                כרטיס
              </NavLink>
            )}
            {showAdminPartyNav && (
              <NavLink
                to={`${base}/whatsapp-invite`}
                onMouseEnter={prefetchGuestsNav}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                וואטסאפ
              </NavLink>
            )}
            {showAdminPartyNav && (
              <NavLink
                to={`${base}/public-page`}
                onMouseEnter={prefetchGuestsNav}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                עמוד ציבורי
              </NavLink>
            )}
            {showPartnerPartyNav && (
              <NavLink
                to={`${base}/finance`}
                onMouseEnter={prefetchFinance}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                הכנסות/הוצאות
              </NavLink>
            )}
            {/* מוק תשלום: {(showPartnerPartyNav || showAdminPartyNav) && <PartyPaymentNextMockButton />} */}
            {!showScannerExperience && (
              <>
                <NavLink
                  to={`${base}/stats`}
                  onMouseEnter={prefetchStats}
                  className={({ isActive }) => (isActive ? 'active' : undefined)}
                >
                  סטטיסטיקה
                </NavLink>
                <NavLink
                  to={`${base}/scan`}
                  onMouseEnter={prefetchShell}
                  className={({ isActive }) => (isActive ? 'active' : undefined)}
                >
                  סריקות כניסה
                </NavLink>
              </>
            )}
            {showAdminPartyNav && (
              <NavLink
                to={`${base}/staff`}
                onMouseEnter={prefetchShell}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                ניהול סלקטורים
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
