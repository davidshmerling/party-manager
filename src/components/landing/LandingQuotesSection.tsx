import type { RefObject } from 'react'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'
import { useLandingReveal } from './useLandingReveal'

function QuoteMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-indigo-300/70" aria-hidden>
      <path
        d="M8.3 10.4H5.8c.2-2.2 1.1-3.6 2.8-4.7l1 1.6c-1 .6-1.5 1.4-1.7 2.4h1.9v5.1H4.6V10c0-3.4 1.7-5.8 4.4-7.3L10 4.3C8.9 5 8 6 7.7 7.3h.6v3.1zm9.2 0H15c.2-2.2 1.1-3.6 2.8-4.7l1 1.6c-1 .6-1.5 1.4-1.7 2.4H19v5.1h-5.2V10c0-3.4 1.7-5.8 4.4-7.3l1 1.6c-1.1.7-2 1.7-2.3 3h.6v3.1z"
        fill="currentColor"
      />
    </svg>
  )
}

function authorInitial(author: string): string {
  const t = author.trim()
  return t ? t[0]! : '?'
}

export function LandingQuotesSection() {
  const { ref, visible } = useLandingReveal(0.08)
  const quotes = SITE_PARTY_BRAND.landingQuotes

  return (
    <section
      ref={ref as RefObject<HTMLElement>}
      id="landing-quotes"
      className={`landing-reveal -mt-1 px-4 pb-6 pt-4 sm:px-6 md:pb-10 md:pt-6 ${visible ? 'landing-reveal--visible' : ''}`}
      aria-labelledby="landing-quotes-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="landing-quotes-heading"
          className="font-sans text-center text-3xl font-bold tracking-tight text-white md:text-[2.1rem]"
        >
          {SITE_PARTY_BRAND.landingQuotesTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-white/62 md:text-base">
          {SITE_PARTY_BRAND.landingQuotesSubtitle}
        </p>
        <ul className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:mt-8 md:gap-4">
          {quotes.map((q) => (
            <li
              key={q.author}
              className="relative min-w-[85%] snap-start overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.1] to-white/[0.03] px-6 py-6 text-right shadow-[0_12px_42px_-26px_rgba(139,92,246,0.35)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-fuchsia-300/30 sm:min-w-[60%] md:min-w-[46%] lg:min-w-0 lg:flex-1 lg:px-7 lg:py-7"
            >
              <div className="mb-3">
                <QuoteMark />
              </div>
              <blockquote className="font-sans text-[0.95rem] leading-relaxed text-white/90 md:text-[1.01rem]">{q.quote}</blockquote>
              <footer className="mt-5 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-fuchsia-200/30 bg-fuchsia-400/15 text-xs font-bold text-fuchsia-100">
                  {authorInitial(q.author)}
                </span>
                <span className="font-sans text-sm font-medium text-fuchsia-200/95">{q.author}</span>
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
