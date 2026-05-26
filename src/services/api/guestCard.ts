import { normalizeCardTextField } from '../../utils/cardText'
import { sb, errMsg } from './client'
import { fetchEventRow } from './events'

export async function fetchGuestCardPublic(
  code: string,
  options?: { recordOpen?: boolean; clientMeta?: Record<string, unknown> },
): Promise<{
  name: string
  code: string
  event_id: string | null
  sibling_codes: string[]
  card_text_above: string | null
  card_text_instruction: string | null
  card_text_below: string | null
  card_text_terms: string | null
}> {
  const recordOpen = options?.recordOpen !== false
  const rpcName = recordOpen ? 'get_public_ticket' : 'get_public_ticket_no_open_record'
  const rpcArgs =
    rpcName === 'get_public_ticket'
      ? {
          p_code: code.trim(),
          p_client_meta: options?.clientMeta ?? {},
        }
      : { p_code: code.trim() }

  const { data, error } = await sb().rpc(rpcName, rpcArgs)
  if (error) throw new Error(errMsg(error))
  if (data == null || typeof data !== 'object') throw new Error('לא נמצא')
  const j = data as {
    name?: string
    code?: string
    event_id?: string | null
    sibling_codes?: unknown
    card_text_above?: string | null
    card_text_instruction?: string | null
    card_text_below?: string | null
    card_text_terms?: string | null
  }
  if (!j.name || !j.code) throw new Error('לא נמצא')
  let sibling_codes: string[] = []
  if (Array.isArray(j.sibling_codes)) {
    sibling_codes = j.sibling_codes.map((x) => String(x)).filter(Boolean)
  }
  if (sibling_codes.length === 0) {
    sibling_codes = [String(j.code)]
  }
  return {
    name: j.name,
    code: j.code,
    event_id: j.event_id != null ? String(j.event_id) : null,
    sibling_codes,
    card_text_above: normalizeCardTextField(
      j.card_text_above != null ? String(j.card_text_above) : null,
    ),
    card_text_instruction: normalizeCardTextField(
      j.card_text_instruction != null ? String(j.card_text_instruction) : null,
    ),
    card_text_below: normalizeCardTextField(
      j.card_text_below != null ? String(j.card_text_below) : null,
    ),
    card_text_terms: normalizeCardTextField(
      j.card_text_terms != null ? String(j.card_text_terms) : null,
    ),
  }
}

/**
 * אם ה-RPC החזיר null בטקסטים אך יש הרשאה לקרוא את שורת האירוע — משלים (למשל אחרי מיגרציה ישנה או תקלה זמנית).
 */
export async function mergeGuestCardTextsFromEventRow(
  eventId: string | null,
  texts: {
    card_text_above: string | null
    card_text_instruction: string | null
    card_text_below: string | null
    card_text_terms: string | null
  },
): Promise<typeof texts> {
  const a = normalizeCardTextField(texts.card_text_above)
  const i = normalizeCardTextField(texts.card_text_instruction)
  const b = normalizeCardTextField(texts.card_text_below)
  const t = normalizeCardTextField(texts.card_text_terms)
  if (!eventId) {
    return { card_text_above: a, card_text_instruction: i, card_text_below: b, card_text_terms: t }
  }
  const need = a == null || i == null || b == null || t == null
  if (!need) {
    return { card_text_above: a, card_text_instruction: i, card_text_below: b, card_text_terms: t }
  }
  try {
    const ev = await fetchEventRow(eventId)
    return {
      card_text_above: a ?? normalizeCardTextField(ev.card_text_above),
      card_text_instruction: i ?? normalizeCardTextField(ev.card_text_instruction),
      card_text_below: b ?? normalizeCardTextField(ev.card_text_below),
      card_text_terms: t ?? normalizeCardTextField(ev.card_text_terms),
    }
  } catch {
    return { card_text_above: a, card_text_instruction: i, card_text_below: b, card_text_terms: t }
  }
}

/** גיבוי לסימון פתיחת דף כרטיס (אם get_public_ticket ישן בלי עדכון) */
export async function recordGuestCardOpen(
  code: string,
  clientMeta?: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb().rpc('record_guest_card_open', {
    p_code: code.trim(),
    p_client_meta: clientMeta ?? {},
  })
  if (error) throw new Error(errMsg(error))
}

export { buildGuestCardUrl as guestCardUrl } from '../../utils/whatsapp'
