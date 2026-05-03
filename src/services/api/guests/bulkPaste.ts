import type { BulkPasteResult } from '../../../types/guest'
import type { Guest } from '../../../types/guest'
import type { EventFinanceLine, IncomeRecipientKind } from '../../../types/finance'
import type { AdminUserRow } from '../../../types/admin'
import type { EventStaffRow } from '../../../types/event'
import { parseGuestBulkFinanceLine } from '../../../utils/pasteGuestLines'
import { fetchGlobalStaffUsers } from '../admin'
import { listEventStaff } from '../staff'
import { createGuest } from './guestCrud'
import {
  firstPartnerId,
  payboxToken,
  resolveIncomeRecipientWithKind,
  scannersForEvent,
  selectorKeywordToken,
} from './incomeRecipients'

function shortLinePreview(line: string, max = 72): string {
  const t = line.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export async function postGuestsBulk(body: { text: string; eventId: string }): Promise<BulkPasteResult> {
  let admins: AdminUserRow[]
  let eventStaff: EventStaffRow[]
  try {
    ;[admins, eventStaff] = await Promise.all([
      fetchGlobalStaffUsers(),
      listEventStaff(body.eventId),
    ])
  } catch (e) {
    return {
      ok: false,
      errors: [e instanceof Error ? e.message : 'לא ניתן לטעון נתונים לשיוך תשלום (אדמינים / צוות אירוע)'],
    }
  }

  const rawLines = body.text.split(/\r?\n/)
  const errors: string[] = []
  const valid: {
    name: string
    phone: string
    recipientId: string
    incomeKind: IncomeRecipientKind
    amount: number
  }[] = []

  let displayLineNum = 0
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!
    if (!line.trim()) continue
    displayLineNum += 1
    const parsed = parseGuestBulkFinanceLine(line)
    if (!parsed) {
      errors.push(
        `שורה ${displayLineNum}: פורמט שגוי — צריך: שם · טלפון · אדמין · סכום — ${shortLinePreview(line)}`,
      )
      continue
    }
    const resolved = resolveIncomeRecipientWithKind(parsed.adminToken, admins, eventStaff)
    if (!resolved) {
      if (payboxToken(parsed.adminToken) && !firstPartnerId(admins)) {
        errors.push(
          `שורה ${displayLineNum}: «פייבוקס» — אין שותף במערכת לשיוך; נדרש לפחות שותף אחד.`,
        )
        continue
      }
      if (selectorKeywordToken(parsed.adminToken)) {
        const scanList = scannersForEvent(eventStaff)
        if (scanList.length === 0) {
          errors.push(
            `שורה ${displayLineNum}: «סלקטור»/«סורק» — לא הוגדר סורק לאירוע (ניהול סלקטורים).`,
          )
          continue
        }
        if (scanList.length > 1) {
          errors.push(
            `שורה ${displayLineNum}: «סלקטור»/«סורק» — יש ${scanList.length} סורקים לאירוע; כתבו את שם או הכינוי של קובל התשלום במקום «סלקטור» (למשל לפי השותפים ברשימה).`,
          )
          continue
        }
      }
      errors.push(
        `שורה ${displayLineNum}: לא נמצא שותף (למי שולם) התואם ל־«${parsed.adminToken}» — ${shortLinePreview(line)}`,
      )
      continue
    }
    valid.push({
      name: parsed.name,
      phone: parsed.phone,
      recipientId: resolved.id,
      incomeKind: resolved.kind,
      amount: parsed.amount,
    })
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  if (valid.length === 0) {
    return {
      ok: true,
      added: 0,
      created: [],
      financeLinesCreated: [],
      skippedAlreadyInEvent: 0,
      skippedDuplicateInPaste: 0,
    }
  }

  const created: Guest[] = []
  const financeLinesCreated: EventFinanceLine[] = []
  try {
    for (const r of valid) {
      const { guest, financeLine } = await createGuest(r.name, r.phone, body.eventId, {
        incomeRecipientAdminId: r.recipientId,
        incomeRecipientKind: r.incomeKind,
        isPaid: false,
        amount: r.amount,
      })
      created.push(guest)
      if (financeLine) financeLinesCreated.push(financeLine)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאה'
    return {
      ok: false,
      errors: [
        created.length > 0
          ? `ייבוא נעצר אחרי ${created.length} אורחים: ${msg}`
          : `ייבוא נכשל: ${msg}`,
      ],
    }
  }

  return {
    ok: true,
    added: created.length,
    created,
    financeLinesCreated,
    skippedAlreadyInEvent: 0,
    skippedDuplicateInPaste: 0,
  }
}
