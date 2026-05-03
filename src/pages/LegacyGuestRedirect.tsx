import { Navigate, useParams } from 'react-router-dom'

/** תאימות לאחור: קישורי ‎/guest/… מופנים ל־‎/ticket/… */
export function LegacyGuestRedirect() {
  const { code } = useParams<{ code: string }>()
  if (!code) return <Navigate to="/" replace />
  return <Navigate to={`/ticket/${encodeURIComponent(code)}`} replace />
}
