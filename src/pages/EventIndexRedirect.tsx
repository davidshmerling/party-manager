import { Navigate } from 'react-router-dom'
import { usePartyViewMode } from '../context/PartyViewModeContext'

/** /events/:eventId — אדמין: ניהול אורחים; סורק: סטטיסטיקה */
export function EventPartyIndex() {
  const { showAdminPartyNav } = usePartyViewMode()
  if (showAdminPartyNav) return <Navigate to="guests" replace />
  return <Navigate to="stats" replace />
}
