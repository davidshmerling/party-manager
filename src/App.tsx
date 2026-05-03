import { lazy, Suspense } from 'react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AdminShell } from './components/AdminShell'
import { HomeLayout } from './components/HomeLayout'
import { PartyLayout } from './components/PartyLayout'
import { RequireEventPartyAdmin } from './components/RequireEventPartyAdmin'
import { RequireEventPartyPartner } from './components/RequireEventPartyPartner'
import { RequirePartner } from './components/RequirePartner'
import { RequireAuth } from './components/RequireAuth'
import { RequireStaff } from './components/RequireStaff'
import { AuthPage } from './pages/AuthPage'
import { GuestCardPage } from './pages/GuestCardPage'
import { GuestListPage } from './pages/GuestListPage'
import { LegacyGuestRedirect } from './pages/LegacyGuestRedirect'
import { NotAuthorizedPage } from './pages/NotAuthorizedPage'
import { AdminsPage } from './pages/AdminsPage'
import { LogsPage } from './pages/LogsPage'
import { ScanPage } from './pages/ScanPage'
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
import { HomeEntry } from './pages/HomeEntry'
import { EventPartyIndex } from './pages/EventIndexRedirect'
import { EventStaffPage } from './pages/EventStaffPage'
import { EventCardPreviewPage } from './pages/EventCardPreviewPage'
import { EventWhatsAppInvitePage } from './pages/EventWhatsAppInvitePage'
import { EventFinancePage } from './pages/EventFinancePage'
import { EventPublicPageEdit } from './pages/EventPublicPageEdit'
import { PartyPublicDetailPage } from './pages/parties/PartyPublicDetailPage'
import { PartnerPaymentLandingMockPage } from './pages/PartnerPaymentLandingMockPage'
import { PartnerReceiptsAdminPage } from './pages/PartnerReceiptsAdminPage'
import { SiteMarketingPage } from './pages/SiteMarketingPage'
import { LANDING_PATH, LANDING_UPCOMING_PARTIES_ID, STAFF_HOME_PATH } from './constants/appRoutes'

function RedirectLegacyEvent({ to }: { to: 'guests' | 'stats' | 'scan' }) {
  const id = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('qr_party_current_event_id') : null
  if (id) return <Navigate to={`/events/${id}/${to}`} replace />
  return <Navigate to={STAFF_HOME_PATH} replace />
}

/** תאימות לנתיבים ישנים ‎/e/:eventId/... */
function LegacyEToEvents() {
  const { eventId } = useParams<{ eventId: string }>()
  const location = useLocation()
  let sub = location.pathname.replace(/^\/e\/[^/]+/, '')
  if (!sub || sub === '/') sub = '/guests'
  return <Navigate to={`/events/${eventId}${sub}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <>
      <Routes>
        <Route path="/ticket/partner/:partnerSlug" element={<PartnerPaymentLandingMockPage />} />
        <Route path="/ticket/:code" element={<GuestCardPage />} />
        <Route path="/guest/:code" element={<LegacyGuestRedirect />} />

        <Route path={LANDING_PATH} element={<AuthPage />} />
        <Route path="/login" element={<AuthPage variant="loginOnly" />} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />

        <Route path="/not-authorized" element={<NotAuthorizedPage />} />

        <Route
          path="/parties"
          element={<Navigate to={{ pathname: LANDING_PATH, hash: LANDING_UPCOMING_PARTIES_ID }} replace />}
        />
        <Route path="/parties/:eventId" element={<PartyPublicDetailPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<RequireStaff />}>
            <Route element={<AdminShell />}>
              <Route element={<HomeLayout />}>
                <Route path="home" element={<HomeEntry />} />
                <Route element={<RequirePartner />}>
                  <Route path="admins" element={<AdminsPage />} />
                  <Route path="site-images" element={<SiteMarketingPage />} />
                  <Route path="logs" element={<LogsPage />} />
                  <Route path="receipts" element={<PartnerReceiptsAdminPage />} />
                </Route>
              </Route>
              <Route path="events" element={<Navigate to={STAFF_HOME_PATH} replace />} />
              <Route path="events/:eventId" element={<PartyLayout />}>
                <Route index element={<EventPartyIndex />} />
                <Route element={<RequireEventPartyAdmin />}>
                  <Route path="guests" element={<GuestListPage />} />
                  <Route path="staff" element={<EventStaffPage />} />
                  <Route path="card-preview" element={<EventCardPreviewPage />} />
                  <Route path="whatsapp-invite" element={<EventWhatsAppInvitePage />} />
                  <Route path="public-page" element={<EventPublicPageEdit />} />
                </Route>
                <Route element={<RequireEventPartyPartner />}>
                  <Route path="finance" element={<EventFinancePage />} />
                </Route>
                <Route
                  path="stats"
                  element={
                    <Suspense fallback={<div className="page"><p className="muted">טוען…</p></div>}>
                      <StatsPage />
                    </Suspense>
                  }
                />
                <Route path="scan" element={<ScanPage />} />
              </Route>
              <Route path="e/:eventId/*" element={<LegacyEToEvents />} />
              <Route path="guests" element={<RedirectLegacyEvent to="guests" />} />
              <Route path="stats" element={<RedirectLegacyEvent to="stats" />} />
              <Route path="scan" element={<RedirectLegacyEvent to="scan" />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={LANDING_PATH} replace />} />
      </Routes>
      <SpeedInsights />
      </>
    </BrowserRouter>
  )
}
