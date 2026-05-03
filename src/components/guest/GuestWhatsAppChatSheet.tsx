import { useEffect } from 'react'
import { GuestWhatsAppChatPanel } from './GuestWhatsAppChatPanel'

export type GuestWhatsAppChatSheetProps = {
  eventId: string
  guestId: string | null
  open: boolean
  onClose: () => void
}

export function GuestWhatsAppChatSheet({ eventId, guestId, open, onClose }: GuestWhatsAppChatSheetProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !guestId) return null

  return (
    <div className="wa-chat-sheet-root" role="dialog" aria-modal="true" aria-label="שיחת WhatsApp">
      <button
        type="button"
        className="wa-chat-sheet-backdrop"
        aria-label="סגור"
        onClick={onClose}
      />
      <div className="wa-chat-sheet-panel">
        <GuestWhatsAppChatPanel eventId={eventId} guestId={guestId} onClose={onClose} />
      </div>
    </div>
  )
}
