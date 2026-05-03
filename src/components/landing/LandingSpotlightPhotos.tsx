import type { RefObject } from 'react'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { handlePublicImageError } from '../../lib/publicAssetUrl'
import { useDebugPublicImageSrc } from '../../hooks/useDebugPublicImageSrc'
import { useLandingReveal } from './useLandingReveal'

const SPOTLIGHT_MAX = 8
const LOADING_PLACEHOLDERS = 6

function spotlightHeight(i: number): string {
  const pattern = ['h-36 sm:h-44 md:h-52', 'h-36 sm:h-44 md:h-60', 'h-36 sm:h-44 md:h-52', 'h-36 sm:h-44 md:h-56']
  return pattern[i % pattern.length]!
}

function SpotlightTile({ srcUrl, i }: { srcUrl: string; i: number }) {
  useDebugPublicImageSrc(`LandingSpotlightPhotos[${i}]`, srcUrl)
  return (
    <li className="group relative overflow-hidden rounded-2xl bg-zinc-800/80 shadow-sm ring-1 ring-white/10">
      <img
        src={srcUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`relative z-10 w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04] ${spotlightHeight(i)}`}
        onError={handlePublicImageError}
      />
    </li>
  )
}

function SpotlightPlaceholder({ i }: { i: number }) {
  return (
    <li key={`loading-${i}`} className="relative overflow-hidden rounded-2xl bg-zinc-800/70 shadow-sm ring-1 ring-white/10">
      <div className="h-36 w-full animate-pulse bg-gradient-to-br from-zinc-700/70 to-zinc-900/70 sm:h-44 md:h-52" />
    </li>
  )
}

type Props = {
  /** URLs מלאים (למשל Supabase Storage) */
  photoUrls: string[] | null
}

/** עד 8 תמונות — grid צפוף עם hover */
export function LandingSpotlightPhotos({ photoUrls }: Props) {
  const { ref, visible } = useLandingReveal(0.06)
  if (photoUrls !== null && photoUrls.length === 0) return null

  const slice = (photoUrls ?? []).slice(0, SPOTLIGHT_MAX)

  return (
    <section
      ref={ref as RefObject<HTMLElement>}
      id="landing-spotlight-photos"
      className={`landing-reveal -mt-1 px-4 pb-6 pt-4 sm:px-6 md:pb-10 md:pt-6 ${visible ? 'landing-reveal--visible' : ''}`}
      aria-labelledby="landing-spotlight-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="landing-spotlight-heading"
          className="font-sans text-center text-3xl font-bold tracking-tight text-white md:text-[2.1rem]"
        >
          {SITE_PARTY_BRAND.landingSpotlightTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm leading-relaxed text-white/55 md:text-[0.9375rem]">
          {SITE_PARTY_BRAND.landingSpotlightSubtitle}
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 md:mt-8 md:grid-cols-4">
          {photoUrls === null
            ? Array.from({ length: LOADING_PLACEHOLDERS }, (_, i) => <SpotlightPlaceholder key={i} i={i} />)
            : slice.map((srcUrl, i) => <SpotlightTile key={`${srcUrl}-${i}`} srcUrl={srcUrl} i={i} />)}
        </ul>
      </div>
    </section>
  )
}
