/** עמודות ל־mapGuestRow — ללא `*` ברשימות (פחות רוחב פס / RAM) */
export const GUEST_ROW_COLUMNS =
  'id, event_id, name, phone, source, unique_code, invite_bundle_code, status, entered_at, card_opened_at, whatsapp_invite_sent_at, invite_sent_method, created_at, updated_at'

/** גודל עמוד לטעינת אורחים — מפחית תשובת HTTP אחת ענקית (timeout / זיכרון) */
export const GUESTS_FETCH_CHUNK = 1500

/** שדות מינימליים לגרף הצטברות כניסות — רק entered_at לא null, לפי זמן עולה */
export const ENTRY_TIMES_CHUNK = 1500
