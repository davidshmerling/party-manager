import type { RefObject } from 'react'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { handlePublicImageError } from '../../lib/publicAssetUrl'
import { useDebugPublicImageSrc } from '../../hooks/useDebugPublicImageSrc'
import { useLandingReveal } from './useLandingReveal'

const SPOTLIGHT_MAX = 8
const LOADING_PLACEHOLDERS = 6

function morePhotosHeight(i: number): string {
  const pattern = ['h-36 sm:h-44 md:h-52', 'h-36 sm:h-44 md:h-56', 'h-36 sm:h-44 md:h-52']
  return pattern[i % pattern.length]!
}

function MorePhotoTile({ srcUrl, i }: { srcUrl: string; i: number }) {
  useDebugPublicImageSrc(`LandingMorePhotos[${i}]`, srcUrl)
  return (
    <li className="group relative overflow-hidden rounded-2xl bg-zinc-800/80 shadow-sm ring-1 ring-white/10">
      <img
        src={srcUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`relative z-10 w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04] ${morePhotosHeight(i)}`}
        onError={handlePublicImageError}
      />
    </li>
  )
}

function MorePhotosPlaceholder({ i }: { i: number }) {
  return (
    <li key={`loading-${i}`} className="relative overflow-hidden rounded-2xl bg-zinc-800/70 shadow-sm ring-1 ring-white/10">
      <div className="h-36 w-full animate-pulse bg-gradient-to-br from-zinc-700/70 to-zinc-900/70 sm:h-44 md:h-52" />
    </li>
  )
}

type Props = {
  photoUrls: string[] | null
}

/** תמונות נוספות אחרי ה־spotlight (אם יש) */
export function LandingMorePhotos({ photoUrls }: Props) {
  const { ref, visible } = useLandingReveal(0.06)
  if (photoUrls !== null && photoUrls.length <= SPOTLIGHT_MAX) return null

  const rest = (photoUrls ?? []).slice(SPOTLIGHT_MAX)

  return (
    <section
      ref={ref as RefObject<HTMLElement>}
      id="landing-more-photos"
      className={`landing-reveal px-4 pb-6 pt-5 sm:px-6 md:pb-10 md:pt-8 ${visible ? 'landing-reveal--visible' : ''}`}
      aria-labelledby="landing-more-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="landing-more-heading"
          className="font-sans text-center text-2xl font-bold tracking-tight text-white md:text-3xl"
        >
          {SITE_PARTY_BRAND.landingMorePhotosTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-white/55">{SITE_PARTY_BRAND.landingMorePhotosSubtitle}</p>
        <ul className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-2 sm:gap-4 md:mt-8 md:grid-cols-3">
          {photoUrls === null
            ? Array.from({ length: LOADING_PLACEHOLDERS }, (_, i) => <MorePhotosPlaceholder key={i} i={i} />)
            : rest.map((srcUrl, i) => <MorePhotoTile key={`${srcUrl}-${i}`} srcUrl={srcUrl} i={i} />)}
        </ul>
      </div>
    </section>
  )
}
