import { buildWhatsAppAppUrl, renderWhatsAppInvite } from '../utils/whatsapp'

/** שליחת הזמנה — קישור לאפליקציית WhatsApp (whatsapp://); בעתיד ניתן להחליף ל-Twilio בלי לשנות ממשק */
export type SendWhatsAppMessageInput = {
  phone: string
  name: string
  /** קישורי כרטיס (כמה ברקודים = הודעה אחת) */
  links: string[]
  eventName: string
  inviteTemplate?: string | null
}

export function sendWhatsAppMessage(input: SendWhatsAppMessageInput): { wa_url: string; message: string } {
  const message = renderWhatsAppInvite(
    input.inviteTemplate,
    input.name,
    input.links,
    input.eventName,
  )
  const wa_url = buildWhatsAppAppUrl(input.phone, message)
  return { wa_url, message }
}
