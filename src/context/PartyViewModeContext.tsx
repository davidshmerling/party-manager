import { useMemo } from 'react'
import { useAuth } from '../auth/AuthProvider'

/** תצוגת מסיבה לפי פרופיל בלבד (סורק אמיתי מול אדמין/שותף) */
export function usePartyViewMode() {
  const { isAdmin, isScanner, isPartner } = useAuth()
  return useMemo(() => {
    const showScannerExperience = isScanner && !isAdmin
    const showAdminPartyNav = isAdmin && !showScannerExperience
    const showPartnerPartyNav = isPartner && !showScannerExperience
    return { showScannerExperience, showAdminPartyNav, showPartnerPartyNav }
  }, [isAdmin, isScanner, isPartner])
}
