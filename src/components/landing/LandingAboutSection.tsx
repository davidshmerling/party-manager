import type { RefObject } from 'react'
import { useMemo } from 'react'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { publicImageBrand, hideBrokenPublicImage } from '../../lib/publicAssetUrl'
import { useDebugPublicImageSrc } from '../../hooks/useDebugPublicImageSrc'
import { useLandingReveal } from './useLandingReveal'

type Props = {
  /** תמונת „מי אנחנו” — URL מלא מ־Supabase */
  imageUrl?: string | null
}

export function LandingAboutSection({ imageUrl }: Props) {
  const tel = SITE_PARTY_BRAND.contactPhoneTel
  const display = SITE_PARTY_BRAND.contactPhoneDisplay
  const whatsappUrl = useMemo(
    () => `https://wa.me/${tel.replace(/\D/g, '')}?text=${encodeURIComponent('היי, אשמח לפרטים על המסיבה הקרובה בטשרניחובסקי 5')}`,
    [tel],
  )
  const mapsUrl = useMemo(
    () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SITE_PARTY_BRAND.venueLine)}`,
    [],
  )
  const { ref, visible } = useLandingReveal(0.1)
  const aboutImg = useMemo(
    () => (imageUrl?.trim() ? imageUrl.trim() : publicImageBrand('about-us.svg')),
    [imageUrl],
  )
  useDebugPublicImageSrc('LandingAboutSection', aboutImg)

  return (
    <section
      ref={ref as RefObject<HTMLElement>}
      id="landing-about"
      className={`landing-reveal px-4 pb-8 pt-6 sm:px-6 md:pb-12 md:pt-10 ${visible ? 'landing-reveal--visible' : ''}`}
      aria-labelledby="landing-about-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.07] shadow-[0_28px_90px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl md:rounded-[2.25rem]">
          <div className="grid md:grid-cols-2 md:gap-0">
            <figure className="relative min-h-[200px] overflow-hidden md:min-h-[320px]">
              <img
                src={aboutImg}
                alt={SITE_PARTY_BRAND.aboutImageAlt}
                loading="lazy"
                decoding="async"
                className="relative z-0 h-full w-full object-cover brightness-[1.08] contrast-[1.06] saturate-[1.05] md:absolute md:inset-0 md:h-full md:w-full"
                onError={hideBrokenPublicImage}
              />
              <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{ background: 'rgba(0,0,0,0.04)' }}
                aria-hidden
              />
            </figure>
            <div className="flex flex-col justify-center px-6 py-8 text-right sm:px-10 md:py-11 lg:px-12">
              <p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-indigo-300/95">
                טשרניחובסקי 5
              </p>
              <h2
                id="landing-about-heading"
                className="font-sans mt-3 text-3xl font-bold leading-tight tracking-tight text-white md:text-[2.35rem]"
              >
                {SITE_PARTY_BRAND.aboutTitle}
              </h2>
              <p className="font-sans mt-5 text-sm leading-relaxed text-white/65 md:text-[0.9375rem]">
                {SITE_PARTY_BRAND.aboutLead}
              </p>
              <div className="mt-9 rounded-2xl border border-white/15 bg-white/[0.08] px-5 py-5 shadow-[0_16px_44px_-26px_rgba(15,15,26,0.75)] backdrop-blur-md">
                <h3 className="text-lg font-bold text-white">מוכנים למסיבה הבאה?</h3>
                <p className="mt-1 text-sm font-medium text-amber-200/95">מספר מקומות מוגבל</p>
                <p className="mt-3 font-sans text-xs font-medium leading-relaxed text-white/72 md:text-[0.8125rem]">
                  {SITE_PARTY_BRAND.aboutContactIntro}
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-gradient-to-l from-emerald-500 to-teal-500 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-950/35 transition hover:from-emerald-400 hover:to-teal-400"
                  >
                    פתח הזמנה
                  </a>
                  <a
                    href={`tel:${tel}`}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-fuchsia-200/35 bg-fuchsia-400/10 px-4 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/18"
                  >
                    קנה כרטיס
                  </a>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/18 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.1]"
                  >
                    נווט למיקום
                  </a>
                </div>
                <p className="mt-3 font-sans text-xs text-white/65" dir="ltr">
                  {display}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
