import { memo, useCallback, useEffect, useState } from 'react'
import type { GuestSource } from '../../types/guest'
import { formatIsraelMobileE164 } from '../../utils/whatsapp'

function IcoWhatsApp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      />
    </svg>
  )
}

export type GuestSendWhatsAppButtonProps = {
  guestId: string
  phone: string
  source: GuestSource
  inviteAllSent: boolean
  busy: boolean
  onSend: (id: string) => Promise<void>
  variant: 'desk' | 'mob'
  /** שקר — תבנית Twilio/WhatsApp טרם אושרה ב-Meta */
  twilioTemplateApproved?: boolean
  /** שורת טבלה קומפקטית — תוויות קצרות ו־32px גובה */
  compact?: boolean
  /** תווית גלויה במובייל (במקום כפתור איקון בלבד) */
  mobPrimaryLabel?: string
}

function GuestSendWhatsAppButtonInner({
  guestId,
  phone,
  source,
  inviteAllSent,
  busy,
  onSend,
  variant,
  twilioTemplateApproved = true,
  compact = false,
  mobPrimaryLabel,
}: GuestSendWhatsAppButtonProps) {
  const [localErr, setLocalErr] = useState(false)
  const [okFlash, setOkFlash] = useState(false)

  const payAtDoor = source === 'pay_at_door'
  const trimmed = phone.trim()
  const phoneValid = trimmed.length > 0 && formatIsraelMobileE164(phone) !== null

  useEffect(() => {
    if (inviteAllSent) {
      setLocalErr(false)
      setOkFlash(false)
    }
  }, [inviteAllSent])

  useEffect(() => {
    if (!okFlash) return
    const t = window.setTimeout(() => setOkFlash(false), 2200)
    return () => window.clearTimeout(t)
  }, [okFlash])

  const handleClick = useCallback(async () => {
    setLocalErr(false)
    try {
      await onSend(guestId)
      setOkFlash(true)
    } catch {
      setLocalErr(true)
    }
  }, [guestId, onSend])

  const tooltipPrimary = 'שלח כרטיס WhatsApp עם QR אישי'
  const templateBlockedTitle =
    'תבנית ההודעה טרם אושרה ב-Meta. עברו ללשונית «וואטסאפ» ואז נסו שוב.'
  let title = tooltipPrimary
  if (payAtDoor) title = 'תשלום בכניסה — אין שליחת WhatsApp'
  else if (!twilioTemplateApproved) title = templateBlockedTitle
  else if (!phoneValid) title = 'אין מספר טלפון'
  else if (localErr) title = 'השליחה נכשלה — נסה שוב'

  const sending = busy && !localErr
  const disableClick =
    payAtDoor ||
    !phoneValid ||
    inviteAllSent ||
    okFlash ||
    sending ||
    !twilioTemplateApproved

  let btnClass = 'guest-send-wa-btn'
  if (variant === 'mob') btnClass += ' guest-send-wa-btn--mob'
  else if (compact) btnClass += ' guest-send-wa-btn--desk-compact'

  const shortCopy = variant === 'desk' && compact

  if (inviteAllSent) {
    btnClass += ' guest-send-wa-btn--sent'
  } else if (!twilioTemplateApproved) {
    btnClass += ' guest-send-wa-btn--sent'
  } else if (localErr) {
    btnClass += ' guest-send-wa-btn--error'
  } else if (okFlash) {
    btnClass += ' guest-send-wa-btn--success'
  } else if (sending) {
    btnClass += ' guest-send-wa-btn--sending'
  } else {
    btnClass += ' guest-send-wa-btn--primary'
  }

  let label = shortCopy ? 'שלח WA' : 'שלח WhatsApp'
  if (inviteAllSent) label = 'נשלח'
  else if (!twilioTemplateApproved) label = shortCopy ? 'ממתין לאישור' : 'ממתין לאישור תבנית'
  else if (localErr) label = shortCopy ? 'נסה שוב' : 'נכשל, נסה שוב'
  else if (okFlash) label = 'נשלח ✓'
  else if (sending) label = 'שולח...'
  else if (variant === 'mob' && mobPrimaryLabel?.trim()) label = mobPrimaryLabel.trim()

  /** בשורה: דסקטופ קומפקט או מובייל בלי תווית ראשית — רק איקון */
  const iconOnlyRow =
    (variant === 'desk' && compact) || (variant === 'mob' && !mobPrimaryLabel?.trim())

  return (
    <div className="guest-send-wa-wrap">
      <button
        type="button"
        dir="rtl"
        className={btnClass}
        title={title}
        aria-label={
          inviteAllSent
            ? 'נשלח'
            : !twilioTemplateApproved
              ? 'ממתין לאישור תבנית WhatsApp'
              : sending
              ? 'שולח הודעת WhatsApp'
              : localErr
                ? 'השליחה נכשלה. נסה שוב'
                : okFlash
                  ? 'נשלח בהצלחה'
                  : tooltipPrimary
        }
        aria-busy={sending}
        disabled={disableClick}
        onClick={(e) => {
          e.stopPropagation()
          void handleClick()
        }}
      >
        {sending ? (
          <span className="guest-send-wa-btn__spin guest-send-wa-btn__spin--sending" aria-hidden />
        ) : inviteAllSent || okFlash ? (
          <span className="guest-send-wa-btn__mark" aria-hidden>
            ✓
          </span>
        ) : (
          <IcoWhatsApp className="guest-send-wa-btn__ico" />
        )}
        <span className={iconOnlyRow ? 'guest-send-wa-btn__txt guest-send-wa-btn__txt--sr' : 'guest-send-wa-btn__txt'}>
          {label}
        </span>
      </button>
    </div>
  )
}

export const GuestSendWhatsAppButton = memo(GuestSendWhatsAppButtonInner)
