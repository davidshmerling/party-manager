import { QRCodeSVG } from 'qrcode.react'
import { renderGuestCardLinkifiedText } from './GuestCardLinkifiedText'
import {
  isCardTextLineSuppressed,
  normalizeCardTextField,
  resolveCardTermsDisplayText,
} from '../utils/cardText'

const DEFAULT_GREETING = 'היי'
const DEFAULT_INSTRUCTION = 'הציגו את ה-QR בכניסה לאירוע'

export type GuestCardTextsProps = {
  guestName: string
  textAbove?: string | null
  textInstruction?: string | null
}

/** כותרת + הנחיה — משותף לכל כרטיסי אותה זהות (לא נגללים) */
export function GuestCardTextsHeader({ guestName, textAbove, textInstruction }: GuestCardTextsProps) {
  const suppressGreet = isCardTextLineSuppressed(textAbove)
  const suppressInstruct = isCardTextLineSuppressed(textInstruction)
  const greeting = suppressGreet
    ? null
    : normalizeCardTextField(textAbove) || DEFAULT_GREETING
  const instruction = suppressInstruct
    ? null
    : normalizeCardTextField(textInstruction) || DEFAULT_INSTRUCTION

  return (
    <>
      <h1 className="guest-card-greeting-line">
        {greeting ? (
          <>
            <span className="guest-card-greeting">{greeting}</span>{' '}
          </>
        ) : null}
        <span className="guest-card-name-part">{guestName}</span>
      </h1>
      {instruction ? (
        <p className="muted small guest-card-instruction">{renderGuestCardLinkifiedText(instruction)}</p>
      ) : null}
    </>
  )
}

export function GuestCardQrBlock({ ticketUrl }: { ticketUrl: string }) {
  return (
    <div className="qr-wrap">
      <QRCodeSVG value={ticketUrl} size={220} level="M" includeMargin />
    </div>
  )
}

/** תנאי שימוש בתחתית הכרטיס — אחרי שאר הכיתובים; גופן קטן יחסית */
export function GuestCardTermsFooter({ textTerms }: { textTerms?: string | null }) {
  const resolved = resolveCardTermsDisplayText(textTerms)
  if (!resolved) return null
  const nl = resolved.indexOf('\n')
  if (nl === -1) {
    return (
      <div className="guest-card-terms" dir="rtl">
        <p className="guest-card-terms__body guest-card-terms__body--solo">{renderGuestCardLinkifiedText(resolved)}</p>
      </div>
    )
  }
  const title = resolved.slice(0, nl).trim()
  const body = resolved.slice(nl + 1).trim()
  return (
    <div className="guest-card-terms" dir="rtl">
      {title ? <p className="guest-card-terms__title">{renderGuestCardLinkifiedText(title)}</p> : null}
      {body ? <p className="guest-card-terms__body">{renderGuestCardLinkifiedText(body)}</p> : null}
    </div>
  )
}

export type GuestCardVisualProps = {
  guestName: string
  ticketUrl: string
  textAbove?: string | null
  textInstruction?: string | null
  textBelow?: string | null
  textTerms?: string | null
  /** כרטיס ציבורי — מראה זכוכית (glass) */
  variant?: 'default' | 'glass'
}

/** תצוגת כרטיס אורח (כמו בדף הציבורי) — לשימוש חוזר בתצוגה מקדימה */
export function GuestCardVisual({
  guestName,
  ticketUrl,
  textAbove,
  textInstruction,
  textBelow,
  textTerms,
  variant = 'default',
}: GuestCardVisualProps) {
  const boxClass = variant === 'glass' ? 'guest-card-box guest-card-box--glass' : 'guest-card-box'
  const below = isCardTextLineSuppressed(textBelow) ? null : normalizeCardTextField(textBelow)

  return (
    <div className={boxClass}>
      <GuestCardTextsHeader guestName={guestName} textAbove={textAbove} textInstruction={textInstruction} />
      <GuestCardQrBlock ticketUrl={ticketUrl} />
      {below ? (
        <p className="guest-card-text-block guest-card-text-below">{renderGuestCardLinkifiedText(below)}</p>
      ) : null}
      <GuestCardTermsFooter textTerms={textTerms} />
    </div>
  )
}
