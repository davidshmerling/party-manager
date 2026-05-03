import type { RefObject } from 'react'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { useLandingReveal } from './useLandingReveal'

function IconMusic({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v14a4 4 0 11-4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 6l4-2v10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function IconPeople({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="9" r="2.75" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M4 19c1.5-3 4.5-4 8-4s6.5 1 8 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconVibe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 14c3-6 13-6 16 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="9" cy="10" r="1.25" fill="currentColor" />
      <circle cx="15" cy="10" r="1.25" fill="currentColor" />
    </svg>
  )
}

function IconLights({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v4M12 17v4M5 12H3M21 12h-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 18h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

const ICONS = {
  music: IconMusic,
  people: IconPeople,
  vibe: IconVibe,
  lights: IconLights,
} as const

export function LandingExpectSection() {
  const { ref, visible } = useLandingReveal(0.08)
  const items = SITE_PARTY_BRAND.landingExpectItems

  return (
    <section
      ref={ref as RefObject<HTMLElement>}
      id="landing-expect"
      className={`landing-reveal -mt-2 px-4 pb-6 pt-5 sm:px-6 md:-mt-3 md:pb-10 md:pt-8 ${visible ? 'landing-reveal--visible' : ''}`}
      aria-labelledby="landing-expect-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="landing-expect-heading"
          className="font-sans text-center text-3xl font-bold tracking-tight text-white md:text-[2.1rem]"
        >
          {SITE_PARTY_BRAND.landingExpectTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-relaxed text-white/62 md:text-[0.99rem]">
          {SITE_PARTY_BRAND.landingExpectSubtitle}
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-3 md:mt-8 md:grid-cols-4 md:gap-4">
          {items.map((item) => {
            const Ico = ICONS[item.icon as keyof typeof ICONS] ?? IconVibe
            return (
              <li
                key={item.title}
                className="group rounded-2xl border border-white/12 bg-gradient-to-b from-white/[0.09] to-white/[0.04] px-4 py-5 text-center shadow-[0_12px_34px_-24px_rgba(0,0,0,0.55)] backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-fuchsia-300/35 hover:from-white/[0.12] hover:to-white/[0.06]"
              >
                <Ico className="mx-auto h-11 w-11 text-indigo-200 transition group-hover:text-fuchsia-300" />
                <h3 className="mt-3.5 font-sans text-[1.02rem] font-semibold text-white">{item.title}</h3>
                <p className="mt-2 font-sans text-sm leading-snug text-white/70">{item.body}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
