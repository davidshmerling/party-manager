import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { MarketingSiteFooter } from '../components/landing/MarketingSiteFooter'
import { LandingAboutSection } from '../components/landing/LandingAboutSection'
import { LandingDivider } from '../components/landing/LandingDivider'
import { LandingExpectSection } from '../components/landing/LandingExpectSection'
import { LandingHero } from '../components/landing/LandingHero'
import {
  LandingLoginCard,
  type LandingLoginMode,
} from '../components/landing/LandingLoginCard'
import { LandingPublishedPartiesSection } from '../components/landing/LandingPublishedPartiesSection'
import { LandingMorePhotos } from '../components/landing/LandingMorePhotos'
import { LandingQuotesSection } from '../components/landing/LandingQuotesSection'
import { LandingSpotlightPhotos } from '../components/landing/LandingSpotlightPhotos'
import { SITE_PARTY_BRAND } from '../config/sitePartyBrand'
import {
  LANDING_UPCOMING_PARTIES_ID,
  LANDING_UPCOMING_PARTIES_URL,
  STAFF_HOME_PATH,
} from '../constants/appRoutes'
import { publicImageBrand, hideBrokenPublicImage } from '../lib/publicAssetUrl'
import { useDebugPublicImageSrc } from '../hooks/useDebugPublicImageSrc'
import { useResolvedSiteMarketing } from '../hooks/useSiteMarketingAssets'

export type AuthPageVariant = 'landing' | 'loginOnly'

export type AuthPageProps = {
  /** `loginOnly` — רק טופס התחברות (למשל מ־`/login`), בלי דף הנחיתה המלא */
  variant?: AuthPageVariant
}

/** ניווט אחרי התחברות כשלא הגיעו מדף מוגן עם state.from */
function treatAsFreshLoginEntry(fromPath: string): boolean {
  return (
    fromPath === '/' ||
    fromPath === '/parties' ||
    fromPath.startsWith('/login') ||
    fromPath.startsWith('/admin/login')
  )
}

/** לוגו בכותרת ‎`/login`‎ — DEV: הדפסת ‎`src`‎ סופי */
function AuthLoginOnlyBrandMark() {
  const marketing = useResolvedSiteMarketing()
  const logoUrl = useMemo(
    () => (marketing?.iconUrl?.trim() ? marketing.iconUrl.trim() : publicImageBrand('logo.svg')),
    [marketing?.iconUrl],
  )
  useDebugPublicImageSrc('AuthPage /login header logo', logoUrl)
  return (
    <Link to={LANDING_UPCOMING_PARTIES_URL} className="flex items-center gap-3 opacity-95 transition-opacity hover:opacity-100">
      <img
        src={logoUrl}
        alt={SITE_PARTY_BRAND.logoAlt}
        className="relative z-0 h-10 w-auto object-contain sm:h-11"
        onError={hideBrokenPublicImage}
      />
      <span className="font-sans text-sm font-semibold text-white/92">{SITE_PARTY_BRAND.venueLine}</span>
    </Link>
  )
}

/** דף הנחיתה והתחברות ב־`/` · דף הניהול אחרי התחברות ב־`/home` · `/login` — התחברות ייעודית לצוות */
export function AuthPage({ variant = 'landing' }: AuthPageProps) {
  const marketing = useResolvedSiteMarketing()
  const galleryPhotoUrls = marketing === null ? null : marketing.galleryUrls
  const { loading, session, profile, isAdmin, isScanner, isMember, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  const [mode, setMode] = useState<LandingLoginMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const prev = document.title
    document.title =
      variant === 'loginOnly'
        ? `התחברות · ${SITE_PARTY_BRAND.venueLine}`
        : SITE_PARTY_BRAND.venueLine
    return () => {
      document.title = prev
    }
  }, [variant])

  useEffect(() => {
    if (loading) return
    if (!session) return
    if (!profile) {
      navigate('/not-authorized', { replace: true })
      return
    }
    if (isAdmin) {
      navigate(treatAsFreshLoginEntry(from) ? STAFF_HOME_PATH : from, { replace: true })
      return
    }
    if (isScanner) {
      navigate(treatAsFreshLoginEntry(from) ? STAFF_HOME_PATH : from, { replace: true })
      return
    }
    if (isMember) {
      navigate(
        treatAsFreshLoginEntry(from)
          ? { pathname: '/', hash: LANDING_UPCOMING_PARTIES_ID }
          : from,
        { replace: true },
      )
      return
    }
    navigate('/not-authorized', { replace: true })
  }, [loading, session, profile, isAdmin, isScanner, isMember, from, navigate])

  useEffect(() => {
    if (variant !== 'landing') return
    if (location.pathname !== '/' || location.hash !== `#${LANDING_UPCOMING_PARTIES_ID}`) return
    const id = LANDING_UPCOMING_PARTIES_ID
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    return () => window.clearTimeout(t)
  }, [variant, location.pathname, location.hash])

  function goAfterAuth(successIsAdmin: boolean, successIsScanner: boolean, successIsMember: boolean) {
    if (successIsAdmin) {
      navigate(treatAsFreshLoginEntry(from) ? STAFF_HOME_PATH : from, { replace: true })
    } else if (successIsScanner) {
      navigate(treatAsFreshLoginEntry(from) ? STAFF_HOME_PATH : from, { replace: true })
    } else if (successIsMember) {
      navigate(
        treatAsFreshLoginEntry(from)
          ? { pathname: '/', hash: LANDING_UPCOMING_PARTIES_ID }
          : from,
        { replace: true },
      )
    } else {
      navigate('/not-authorized', { replace: true })
    }
  }

  async function onSubmitLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      const { error: err, isAdmin: admin, isScanner: scanner, isMember: member } = await signIn(
        email.trim(),
        password,
      )
      if (err) {
        setError(err)
        return
      }
      goAfterAuth(admin, scanner, member)
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitSignup(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      const {
        error: err,
        isAdmin: admin,
        isScanner: scanner,
        isMember: member,
        needsEmailConfirmation,
      } = await signUp(email.trim(), password)
      if (err) {
        setError(err)
        return
      }
      if (needsEmailConfirmation) {
        setInfo('נשלח מייל אישור. אחרי האישור תוכלו להתחבר. הרשאות נקבעות על ידי אדמין.')
        return
      }
      goAfterAuth(admin, scanner, member)
    } finally {
      setSubmitting(false)
    }
  }

  function scrollToLandingContent() {
    document.getElementById('landing-main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function setLandingMode(m: LandingLoginMode) {
    setMode(m)
    setError(null)
    setInfo(null)
  }

  const loginCard = (
    <LandingLoginCard
      mode={mode}
      setMode={setLandingMode}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      error={error}
      info={info}
      submitting={submitting}
      onLogin={onSubmitLogin}
      onSignup={onSubmitSignup}
    />
  )

  if (variant === 'loginOnly') {
    return (
      <div
        dir="rtl"
        className="landing-page-root relative min-h-screen bg-[linear-gradient(165deg,#0f0f1a_0%,#1a1a2e_52%,#2a2a4a_100%)] font-sans text-zinc-100 antialiased selection:bg-indigo-500/35"
      >
        <div
          className="landing-noise pointer-events-none absolute inset-0 z-[1] mix-blend-overlay opacity-[0.85]"
          aria-hidden
        />
        <div className="relative z-[2] mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-12 pt-10 sm:justify-center sm:py-16">
          <div className="mb-8 flex flex-col items-center gap-4 sm:mb-10">
            <Link
              to={LANDING_UPCOMING_PARTIES_URL}
              className="font-sans text-sm text-indigo-200/90 underline-offset-4 transition hover:text-white hover:underline"
            >
              חזרה למסיבות
            </Link>
            <AuthLoginOnlyBrandMark />
          </div>
          <div className="relative z-30 px-0 pt-1">{loginCard}</div>
          <p className="mt-10 text-center font-sans text-xs text-white/45">
            <Link to="/" className="underline-offset-4 hover:text-white/65 hover:underline">
              לאתר הבית המלא
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      dir="rtl"
      className="landing-page-root relative min-h-screen bg-[linear-gradient(165deg,#0f0f1a_0%,#1a1a2e_52%,#2a2a4a_100%)] font-sans text-zinc-100 antialiased selection:bg-indigo-500/35"
    >
      <div className="landing-noise pointer-events-none absolute inset-0 z-[1] mix-blend-overlay opacity-[0.85]" aria-hidden />
      <div className="relative z-[2] flex flex-col [&>section]:max-w-none">
        <LandingHero
          onPrimaryCtaClick={scrollToLandingContent}
          heroImageUrl={marketing?.heroUrl}
          logoImageUrl={marketing?.iconUrl}
        />

        <div id="landing-main-content">
        <LandingDivider />

        <LandingPublishedPartiesSection />

        <LandingDivider />

        <LandingExpectSection />

        <LandingDivider />

        <LandingQuotesSection />

        <LandingDivider />

        <LandingSpotlightPhotos photoUrls={galleryPhotoUrls} />

        <LandingDivider />

        <LandingMorePhotos photoUrls={galleryPhotoUrls} />

        <LandingDivider />

        <LandingAboutSection imageUrl={marketing?.aboutUrl} />
        </div>

        <MarketingSiteFooter showStaffLoginCta />
      </div>
    </div>
  )
}
