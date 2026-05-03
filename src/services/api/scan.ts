import type { Guest, ScanResponse } from '../../types/guest'
import { sb, errMsg, UUID_RE } from './client'
import { mapGuestRow, mapRpcScanToResponse } from './mappers'

export async function scanCode(code: string, eventId: string): Promise<ScanResponse> {
  const { data, error } = await sb().rpc('process_guest_scan', {
    p_code: code,
    p_event_id: eventId,
  })
  if (error) throw new Error(errMsg(error))
  if (data == null || typeof data !== 'object') {
    throw new Error('תשובת סריקה לא תקינה')
  }
  return mapRpcScanToResponse(data as Record<string, unknown>)
}

export type AddPayAtDoorInput = {
  /** סכום ב־₪ לכל כרטיס (חובה) */
  amount: number
  /** כמות אורחים, ברירת 1, עד 100 */
  quantity?: number
  /** שם/כינוי לפני «— נכנס בכניסה N»; רשות */
  namePrefix?: string
}

/**
 * תשלום בכניסה — אורח(ים) «נכנס» + שורות הכנסה (RPC).
 */
export async function addPayAtDoorGuest(eventId: string, input: AddPayAtDoorInput): Promise<Guest[]> {
  const p_event_id = eventId.trim()
  if (!p_event_id || !UUID_RE.test(p_event_id)) {
    throw new Error('מזהה אירוע לא תקין')
  }
  const amount = input.amount
  if (!Number.isFinite(amount) || amount < 0.01) {
    throw new Error('נא להזין סכום (מינימום 0.01 ‏₪) לכל כרטיס')
  }
  const q =
    input.quantity != null && Number.isFinite(input.quantity) ? Math.max(1, Math.min(100, Math.floor(Number(input.quantity)))) : 1

  const prefix = input.namePrefix?.trim() ?? ''
  const { data, error } = await sb().rpc('add_pay_at_door_guest', {
    p_event_id,
    p_amount: amount,
    p_quantity: q,
    ...(prefix ? { p_name: prefix } : {}),
  })
  if (error) {
    throw new Error(errMsg(error))
  }
  if (data == null || typeof data !== 'object') {
    throw new Error('תשובה לא תקינה')
  }
  const j = data as Record<string, unknown>
  if (j.ok === false) {
    const msg = typeof j.message === 'string' ? j.message : 'לא ניתן להוסיף'
    throw new Error(msg)
  }
  const arr = j.guests
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.map((g) => mapGuestRow(g as Record<string, unknown>))
  }
  throw new Error('אורחים לא הוחזרו מהשרת')
}
