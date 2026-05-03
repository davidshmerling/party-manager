import { QRCodeSVG } from 'qrcode.react'
import { isCardTextLineSuppressed, normalizeCardTextField } from '../utils/cardText'

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
      {instruction ? <p className="muted small guest-card-instruction">{instruction}</p> : null}
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

export type GuestCardVisualProps = {
  guestName: string
  ticketUrl: string
  textAbove?: string | null
  textInstruction?: string | null
  textBelow?: string | null
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
  variant = 'default',
}: GuestCardVisualProps) {
  const boxClass = variant === 'glass' ? 'guest-card-box guest-card-box--glass' : 'guest-card-box'
  const below = isCardTextLineSuppressed(textBelow) ? null : normalizeCardTextField(textBelow)

  return (
    <div className={boxClass}>
      <GuestCardTextsHeader guestName={guestName} textAbove={textAbove} textInstruction={textInstruction} />
      <GuestCardQrBlock ticketUrl={ticketUrl} />
      {below ? <p className="guest-card-text-block guest-card-text-below">{below}</p> : null}
    </div>
  )
}
