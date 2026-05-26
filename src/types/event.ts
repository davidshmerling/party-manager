export interface EventRow {
  id: string
  name: string
  slug: string | null
  description: string | null
  starts_at: string | null
  ends_at: string | null
  location: string | null
  is_active: boolean
  created_by: string | null
  /** טקסטים לכרטיס הציבורי (QR) */
  card_text_above: string | null
  card_text_instruction: string | null
  card_text_below: string | null
  /** תנאי שימוש / צילום בתחתית הכרטיס; null = ברירת מחדל בלקוח */
  card_text_terms: string | null
  /** תבנית wa.me — {name} {link} (אופציונלי {event}); null = ברירת מחדל */
  whatsapp_invite_template: string | null
  /** Twilio Content SID לאחר יצירת תבנית ושליחה לאישור Meta */
  whatsapp_twilio_content_sid: string | null
  whatsapp_twilio_content_name: string | null
  whatsapp_twilio_content_status: string | null
  whatsapp_twilio_content_category: string | null
  whatsapp_twilio_content_submitted_at: string | null
  /** מספרי ‎{{1}}…‎ במיפוי תבנית Twilio */
  whatsapp_twilio_placeholder_slots: number[]
  /** מחיר כרטיס ברירת מחדל (₪) — הצעה בניהול אורחים */
  default_ticket_price: number
  created_at: string
  updated_at: string
}

/** תוצאת Edge Function submit-whatsapp-template אחרי יצירת תוכן ושליחת אישור Meta */
export interface SubmitWhatsAppTemplateApprovalResult {
  ok: true
  content_sid: string
  approval_name: string
  approval_status: string
  rejection_reason: string | null
  category: string
  submitted_at: string
  placeholder_slots: number[]
}

/** תוצאת Edge Function sync-whatsapp-template-status */
export interface SyncWhatsAppTemplateStatusResult {
  ok: true
  content_sid: string
  whatsapp_status: string
  rejection_reason: string | null
  category: string | null
  stored_status: string
}

export interface GuestStats {
  total: number
  pending: number
  entered: number
}

/** תוצאת get_event_stats (RPC) — ללא רשימת אורחים */
export interface EventStatsRpc {
  event_id: string
  event_name: string | null
  total_guests: number
  checked_in_count: number
  not_checked_in_count: number
  checked_in_percentage: number
  last_check_in_at: string | null
}

export interface EventStaffRow {
  id: string
  user_id: string
  email: string
  role: 'admin' | 'scanner'
  created_at: string
}
