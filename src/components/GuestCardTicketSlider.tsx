import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GuestCardQrBlock, GuestCardTermsFooter, GuestCardTextsHeader, GuestCardVisual } from './GuestCardVisual'
import { renderGuestCardLinkifiedText } from './GuestCardLinkifiedText'
import { guestCardUrl } from '../services/api'
import { isCardTextLineSuppressed, normalizeCardTextField } from '../utils/cardText'

/** גלילה מכוונת (מקלדת וכו׳) — איטית יחסית ל־smooth ברירת־המחדל */
const PROGRAMMATIC_SCROLL_MS = 820

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** מחזיר פונקציית ביטול אנימציה */
function animateScrollLeft(el: HTMLElement, targetLeft: number, durationMs: number): () => void {
  const startLeft = el.scrollLeft
  const delta = targetLeft - startLeft
  if (Math.abs(delta) < 0.5) {
    el.scrollLeft = targetLeft
    return () => {}
  }
  const t0 = performance.now()
  let rafId = 0
  let cancelled = false
  const step = (now: number) => {
    if (cancelled) return
    const elapsed = now - t0
    const t = Math.min(1, elapsed / durationMs)
    el.scrollLeft = startLeft + delta * easeInOutCubic(t)
    if (t < 1) rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
  return () => {
    cancelled = true
    cancelAnimationFrame(rafId)
  }
}

export type GuestCardTicketSliderProps = {
  codes: string[]
  /** אינדקס הכרטיס להצגה ראשונה (למשל לפי הקוד ב-URL) */
  initialIndex?: number
  guestName: string
  textAbove?: string | null
  textInstruction?: string | null
  textBelow?: string | null
  textTerms?: string | null
  /** כרטיס ציבורי — glass; תצוגה מקדימה באדמין — default */
  variant?: 'default' | 'glass'
}

/** קרוסלת כרטיסים: גלילה אופקית + snap + מספור תחתון (כמו עמודי ספר) */
export function GuestCardTicketSlider({
  codes,
  initialIndex = 0,
  guestName,
  textAbove,
  textInstruction,
  textBelow,
  textTerms,
  variant = 'default',
}: GuestCardTicketSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null)
  const cancelScrollAnimRef = useRef<(() => void) | null>(null)
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, codes.length - 1)),
  )

  const onScroll = useCallback(() => {
    const el = sliderRef.current
    if (!el || codes.length < 2) return
    const w = el.clientWidth
    if (w <= 0) return
    const idx = Math.round(el.scrollLeft / w)
    setActiveIdx(Math.min(Math.max(0, idx), codes.length - 1))
  }, [codes.length])

  useEffect(() => {
    const el = sliderRef.current
    if (!el || codes.length < 2) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onScroll, codes.length])

  /** מקלדת: חצים — גלילה מונפשת איטית (מגע נשאר לפי הדפדפן) */
  useEffect(() => {
    const el = sliderRef.current
    if (!el || codes.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const w = el.clientWidth
      if (w <= 0) return
      const idx = Math.round(el.scrollLeft / w)
      const dir = e.key === 'ArrowRight' ? 1 : -1
      const next = Math.min(codes.length - 1, Math.max(0, idx + dir))
      if (next === idx) return
      e.preventDefault()
      cancelScrollAnimRef.current?.()
      cancelScrollAnimRef.current = null
      const target = next * w
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.scrollLeft = target
        return
      }
      cancelScrollAnimRef.current = animateScrollLeft(el, target, PROGRAMMATIC_SCROLL_MS)
    }
    el.tabIndex = 0
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      cancelScrollAnimRef.current?.()
      cancelScrollAnimRef.current = null
    }
  }, [codes.length])

  const codesKey = codes.join('|')

  useLayoutEffect(() => {
    const el = sliderRef.current
    if (!el || codes.length < 2) return
    const i = Math.min(Math.max(0, initialIndex), codes.length - 1)
    const apply = () => {
      const w = el.clientWidth
      if (w <= 0) return false
      el.scrollLeft = i * w
      setActiveIdx(i)
      return true
    }
    if (!apply()) {
      const id = requestAnimationFrame(() => {
        apply()
      })
      return () => cancelAnimationFrame(id)
    }
  }, [codesKey, initialIndex, codes.length])

  if (codes.length === 0) return null

  const v = variant === 'glass' ? 'glass' : 'default'
  const below = isCardTextLineSuppressed(textBelow) ? null : normalizeCardTextField(textBelow)

  if (codes.length === 1) {
    return (
      <div className="guest-card-slider-outer">
        <div className="guest-card-slider-single">
          <GuestCardVisual
            variant={v}
            guestName={guestName}
            ticketUrl={guestCardUrl(codes[0]!)}
            textAbove={textAbove}
            textInstruction={textInstruction}
            textBelow={textBelow}
            textTerms={textTerms}
          />
        </div>
      </div>
    )
  }

  const boxClass = v === 'glass' ? 'guest-card-box guest-card-box--glass' : 'guest-card-box'

  return (
    <div className="guest-card-slider-outer guest-card-multi">
      <div className={boxClass} dir="rtl">
        <GuestCardTextsHeader
          guestName={guestName}
          textAbove={textAbove}
          textInstruction={textInstruction}
        />
        <div
          ref={sliderRef}
          className="guest-card-slider guest-card-slider--qr-only"
          dir="ltr"
          aria-label={`ברקודים — גרירה או חצים; כרטיס ${activeIdx + 1} מתוך ${codes.length}`}
        >
          {codes.map((c, slideIdx) => (
            <div key={c} className="guest-card-slide guest-card-slide--qr-only">
              <GuestCardQrBlock ticketUrl={guestCardUrl(c)} />
              <div
                className="guest-card-slider-folio guest-card-slider-folio--under-qr guest-card-slider-folio--single"
                aria-hidden={slideIdx !== activeIdx}
              >
                <p className="guest-card-ticket-num-line">
                  <span
                    className="guest-card-ticket-fraction"
                    dir="ltr"
                    aria-label={`כרטיס ${slideIdx + 1} מתוך ${codes.length}`}
                  >
                    {slideIdx + 1}
                    <span className="guest-card-ticket-fraction-slash" aria-hidden>
                      /
                    </span>
                    {codes.length}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
        {below ? (
          <p className="guest-card-text-block guest-card-text-below guest-card-text-below--after-slider">
            {renderGuestCardLinkifiedText(below)}
          </p>
        ) : null}
        <GuestCardTermsFooter textTerms={textTerms} />
      </div>
    </div>
  )
}
