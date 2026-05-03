import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { MarketingSiteFooter } from '../landing/MarketingSiteFooter'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { LANDING_UPCOMING_PARTIES_URL, LANDING_PATH, STAFF_HOME_PATH } from '../../constants/appRoutes'
import { publicAppIcon, hideBrokenPublicImage } from '../../lib/publicAssetUrl'
import { useDebugPublicImageSrc } from '../../hooks/useDebugPublicImageSrc'
import { useResolvedSiteMarketing } from '../../hooks/useSiteMarketingAssets'

type Props = {
  children: ReactNode
  title?: string
}

/** כניסת צוות בפינה — לא בולט כמו CTA הרשמה / פייבוקס */
function StaffCornerControl() {
  const { loading, session, signOut, isStaff } = useAuth()

  if (loading) {
    return (
      <span
        className="inline-block h-9 w-[4.5rem] shrink-0 rounded-full bg-violet-500/10 backdrop-blur-sm sm:h-8 sm:w-14"
        aria-hidden
      />
    )
  }

  const glassBtn =
    'inline-flex max-w-[calc(100vw-7rem)] items-center justify-center gap-1 rounded-full border border-violet-300/15 bg-[#1e1b4b]/55 px-3 py-2.5 text-[0.8125rem] font-medium leading-none text-violet-100/75 shadow-[0_2px_20px_rgba(91,33,182,0.18),0_2px_8px_rgba(0,0,0,0.2)] backdrop-blur-md transition-colors hover:border-violet-200/25 hover:bg-[#252052]/65 hover:text-white sm:max-w-none sm:px-2.5 sm:py-2 sm:text-xs'

  if (session && !isStaff) {
    return (
      <button type="button" className={glassBtn} onClick={() => void signOut()} aria-label="יציאה מהחשבון">
        יציאה
      </button>
    )
  }

  if (isStaff) {
    return (
      <Link to={STAFF_HOME_PATH} className={glassBtn} aria-label="מעבר לניהול">
        ניהול
      </Link>
    )
  }

  return (
    <Link to="/login" className={glassBtn} aria-label="כניסת צוות והתחברות">
      <span className="select-none text-[0.7rem] opacity-85" aria-hidden>
        🔒
      </span>
      צוות
    </Link>
  )
}

/** עוטף דפי מסיבות ציבוריות — RTL, גרדיאנט כמו הנחיתה */
export function PartyMarketingShell({ children, title }: Props) {
  const { loading, session } = useAuth()
  const marketing = useResolvedSiteMarketing()
  const logoUrl = useMemo(
    () => (marketing?.iconUrl?.trim() ? marketing.iconUrl.trim() : publicAppIcon()),
    [marketing?.iconUrl],
  )
  useDebugPublicImageSrc('PartyMarketingShell header logo', logoUrl)

  return (
    <div
      dir="rtl"
      className="relative min-h-screen bg-gradient-to-b from-[#1a1740] via-[#1e1b4e] to-[#241d52] font-sans text-zinc-100 antialiased selection:bg-violet-500/35"
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_100%_65%_at_50%_-8%,rgba(139,92,246,0.22),transparent_58%),radial-gradient(ellipse_80%_50%_at_100%_100%,rgba(59,130,246,0.12),transparent_50%)]"
        aria-hidden
      />
      <div className="landing-noise pointer-events-none absolute inset-0 z-[1] mix-blend-overlay opacity-[0.35]" aria-hidden />
      <header className="relative z-[2] border-b border-violet-200/10 px-4 py-4 sm:px-6">
        <div className="absolute inset-y-0 end-3 z-[3] flex items-center sm:end-5">
          <StaffCornerControl />
        </div>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 pe-[5.5rem] sm:pe-24">
          <Link to={LANDING_PATH} className="flex items-center gap-3 transition-opacity hover:opacity-90">
            <img
              src={logoUrl}
              alt={SITE_PARTY_BRAND.logoAlt}
              className="relative z-0 h-10 w-auto object-contain sm:h-11"
              onError={hideBrokenPublicImage}
            />
            <span className="font-sans text-sm font-semibold text-white/92">{SITE_PARTY_BRAND.venueLine}</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm sm:gap-3">
            <Link to={LANDING_UPCOMING_PARTIES_URL} className="text-indigo-200/90 underline-offset-4 hover:text-white hover:underline">
              המסיבות הבאות
            </Link>
          </nav>
        </div>
      </header>
      {title ? (
        <h1 className="relative z-[2] px-4 pb-2 pt-6 text-center font-sans text-xl font-bold tracking-tight text-white sm:px-6 sm:text-2xl">
          {title}
        </h1>
      ) : null}
      <div className="relative z-[2]">{children}</div>
      <MarketingSiteFooter showStaffLoginCta={!loading && !session} />
    </div>
  )
}
