export type GuestStatus = 'pending' | 'entered'

/** list=מהרשימה; pay_at_door=נרשם במקום דרך «+1» במסך הסריקה */
export type GuestSource = 'list' | 'pay_at_door'

import type { EventFinanceLine } from './finance'

export interface Guest {
  id: string
  event_id: string
  name: string
  phone: string
  /** מקור הרשומה — לתצוגה ולמיון (תשלום בכניסה) */
  source: GuestSource
  unique_code: string
  /** קוד לדף ההזמנה הציבורי — משותף לכל כרטיסי אותו אורח; לסריקה בכניסה משתמשים ב־unique_code */
  invite_bundle_code: string
  status: GuestStatus
  entered_at: string | null
  /** מועד פתיחה ראשונה של דף הכרטיס (קישור מהווטסאפ/QR) */
  card_opened_at: string | null
  /** סימון שהזמנה בוואטסאפ נשלחה */
  whatsapp_invite_sent_at: string | null
  /** איך סומנה השליחה: ‎whatsapp_web‎, ‎manual_admin‎, ‎twilio‎, ‎local_script‎ וכו׳ */
  invite_sent_method: string | null
  created_at: string
  updated_at: string
}

export type ScanResult =
  | 'ok'
  | 'already_entered'
  | 'already_checked_in'
  | 'not_found'
  | 'wrong_event'
  | 'forbidden'

export interface ScanResponse {
  result: ScanResult
  guest: { name: string; entered_at: string | null } | null
  message?: string
  eventName?: string | null
}

export interface SendWhatsAppResponse {
  wa_url: string
  message: string
  guest_name: string
}

/** תשובת Edge Function `send-whatsapp` אחרי שליחת Twilio ועדכון DB */
export interface SendGuestTwilioSuccess {
  ok: true
  twilio_sid: string
  sent_at: string
  marked_guest_ids: string[]
}

/** תוצאת ייבוא מרוכז — או הכל מצליח (INSERT אחד) או כלום + לוג שגיאות לפי שורה */
export type BulkPasteResult =
  | {
      ok: true
      added: number
      created: Guest[]
      /** שורות הכנסה שנוצרו בייבוא — לעדכון מקומי בלי טעינת רשימה מלאה */
      financeLinesCreated: EventFinanceLine[]
      /** שמור לתאימות — תמיד 0 (כרטיס נוסף לאותו שם+טלפון מותר בייבוא) */
      skippedAlreadyInEvent: number
      /** שמור לתאימות — תמיד 0 */
      skippedDuplicateInPaste: number
    }
  | { ok: false; errors: string[] }
