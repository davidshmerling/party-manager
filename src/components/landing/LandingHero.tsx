import { useMemo } from 'react'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { publicImageBrand, hideBrokenPublicImage } from '../../lib/publicAssetUrl'
import { useDebugPublicImageSrc } from '../../hooks/useDebugPublicImageSrc'

type Props = {
  /** גלילה לתוכן הציבורי (לא דף התחברות) */
  onPrimaryCtaClick: () => void
  /** רקע hero — URL מלא מ־Supabase; בלי — SVG מקומי */
  heroImageUrl?: string | null
  /** לוגו/אייקון — URL מלא; בלי — SVG מקומי */
  logoImageUrl?: string | null
}

export function LandingHero({ onPrimaryCtaClick, heroImageUrl, logoImageUrl }: Props) {
  const bgUrl = useMemo(
    () => (heroImageUrl?.trim() ? heroImageUrl.trim() : publicImageBrand('og-cover.svg')),
    [heroImageUrl],
  )
  const logoUrl = useMemo(
    () => (logoImageUrl?.trim() ? logoImageUrl.trim() : publicImageBrand('logo.svg')),
    [logoImageUrl],
  )
  useDebugPublicImageSrc('LandingHero background (CSS)', bgUrl)
  useDebugPublicImageSrc('LandingHero logo', logoUrl)

  return (
    <section
      className="relative isolate flex max-h-[80vh] min-h-[70vh] flex-col justify-end overflow-hidden sm:max-h-[78vh] sm:min-h-[72vh]"
      aria-label="פתיחה"
    >
      <div
        className="absolute inset-0 bg-cover bg-center brightness-[1.03] contrast-[1.04]"
        style={{ backgroundImage: `url(${bgUrl})` }}
      />
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(180deg, rgba(12,11,25,0.2) 0%, rgba(20,18,36,0.08) 44%, rgba(20,18,36,0.12) 100%)',
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 z-[2]"
        style={{
          background: 'linear-gradient(to top, rgba(15,15,26,0.62) 0%, rgba(15,15,26,0.16) 34%, transparent 62%)',
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[3] h-[45%] bg-gradient-to-t from-[#100f22]/78 via-[#171534]/24 to-transparent"
        aria-hidden
      />

      <div className="landing-hero-enter relative z-10 px-5 pb-9 pt-12 text-center sm:px-8 sm:pb-11 sm:pt-14 md:pb-14 md:pt-16">
        <div className="mb-3 inline-flex rounded-full border border-fuchsia-200/35 bg-fuchsia-400/12 px-3 py-1 text-[0.68rem] font-semibold tracking-wide text-fuchsia-100/95">
          המסיבות הכי חמות בירושלים
        </div>
        <p className="mb-2 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-indigo-100/88">
          {SITE_PARTY_BRAND.landingHeroEyebrow}
        </p>
        <img
          src={logoUrl}
          alt={SITE_PARTY_BRAND.logoAlt}
          className="relative mx-auto mb-3 h-8 w-auto opacity-90 drop-shadow-md sm:h-9"
          decoding="async"
          onError={hideBrokenPublicImage}
        />
        <h1 className="font-sans text-[clamp(2.35rem,8vw,4.1rem)] font-extrabold leading-[1.03] tracking-tight text-white drop-shadow-[0_8px_32px_rgba(0,0,0,0.42)]">
          {SITE_PARTY_BRAND.venueLine}
        </h1>
        <p className="mx-auto mt-3 max-w-xl font-sans text-xl font-semibold leading-snug text-white/96 md:text-2xl">
          {SITE_PARTY_BRAND.landingHeroHeadline}
        </p>
        <p className="mx-auto mt-2 max-w-md font-sans text-sm leading-relaxed text-white/80 md:text-base">
          {SITE_PARTY_BRAND.landingHeroSubline}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onPrimaryCtaClick}
            className="touch-manipulation inline-flex min-h-[54px] min-w-[220px] items-center justify-center rounded-full bg-gradient-to-l from-indigo-500 via-violet-500 to-fuchsia-500 px-11 text-[1.03rem] font-bold text-white shadow-[0_10px_36px_-10px_rgba(139,92,246,0.7),0_4px_22px_-8px_rgba(167,139,250,0.5)] transition hover:brightness-110 hover:shadow-[0_14px_42px_-10px_rgba(139,92,246,0.58)] active:scale-[0.98]"
          >
            {SITE_PARTY_BRAND.landingHeroCta}
          </button>
          <button
            type="button"
            onClick={onPrimaryCtaClick}
            className="touch-manipulation inline-flex min-h-[54px] min-w-[220px] items-center justify-center rounded-full border border-white/26 bg-white/10 px-11 text-[1.03rem] font-bold text-white shadow-[0_8px_26px_-12px_rgba(0,0,0,0.55)] transition hover:bg-white/16"
          >
            קנה כרטיס עכשיו
          </button>
        </div>
        <p className="mt-2 font-sans text-[0.8125rem] text-white/48">{SITE_PARTY_BRAND.landingHeroCtaHint}</p>
      </div>
    </section>
  )
}
