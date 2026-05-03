import { useEffect, useState } from 'react'

import { hideBrokenPublicImage, resetPublicImageVisibility } from '../../lib/publicAssetUrl'
import { useDebugPublicImageSrcList } from '../../hooks/useDebugPublicImageSrc'

const ROTATION_MS = 4000
const FADE_MS = 900

type Props = {
  urls: string[]
}

/** קרוסלת רקע עם fade בין תמונות; טעינה מקדימה לשקופית הבאה */
export function PartyPublicHeroCarousel({ urls }: Props) {
  const [active, setActive] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const n = urls.length

  useDebugPublicImageSrcList('PartyPublicHeroCarousel', urls)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (n < 2 || reduceMotion) return
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % n)
    }, ROTATION_MS)
    return () => window.clearInterval(id)
  }, [n, reduceMotion])

  useEffect(() => {
    if (n < 2) return
    const nextSrc = urls[(active + 1) % n]
    if (!nextSrc) return
    const img = new Image()
    img.src = nextSrc
  }, [active, n, urls])

  if (n === 0) return null

  if (n === 1) {
    return (
      <img
        src={urls[0]}
        alt=""
        className="h-full min-h-[200px] w-full object-cover sm:min-h-[260px]"
        loading="eager"
        decoding="async"
        fetchPriority="high"
        onError={hideBrokenPublicImage}
        onLoad={resetPublicImageVisibility}
        data-image-origin="party-public-detail"
      />
    )
  }

  const fadeMs = reduceMotion ? 0 : FADE_MS

  return (
    <div className="absolute inset-0">
      {urls.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 h-full min-h-[200px] w-full object-cover sm:min-h-[260px]"
          style={{
            opacity: i === active ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: `${fadeMs}ms`,
            transitionTimingFunction: 'ease-in-out',
            zIndex: i === active ? 1 : 0,
          }}
          loading={i <= 1 ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={i === active ? 'high' : 'low'}
          onError={hideBrokenPublicImage}
          onLoad={resetPublicImageVisibility}
          data-image-origin="party-public-detail"
        />
      ))}
    </div>
  )
}
