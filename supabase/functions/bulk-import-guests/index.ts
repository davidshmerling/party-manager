/**
 * ייבוא מרוכז אורחים מהטקסט שהודבק — פרסור, ולידציה, DB.
 * POST JSON: { eventId, text }
 * Authorization: Bearer <JWT>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import { formatIsraelMobileE164 } from '../_shared/formatIsraelMobileE164.ts'

const GUEST_SELECT =
  'id, event_id, name, phone, source, unique_code, invite_bundle_code, status, entered_at, card_opened_at, whatsapp_invite_sent_at, invite_sent_method, whatsapp_last_inbound_at, whatsapp_invite_twilio_sid, whatsapp_invite_twilio_status, created_at, updated_at'

const FINANCE_SELECT =
  'id, event_id, line_kind, guest_id, person_name, phone, amount, recipient_admin_id, transfer_from_admin_id, income_recipient_kind, is_paid, created_by, created_at, updated_at'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

type ParsedLine = { name: string; phone: string; adminToken: string; amount: number }

/** כמו הקלט ל־parseGuestBulkFinanceLine (טאבים → רווח, trim) */
function normalizePasteLine(line: string): string {
  return line.replace(/\t/g, ' ').trim()
}

function parseGuestBulkFinanceLine(line: string): ParsedLine | null {
  const t = normalizePasteLine(line)
  if (!t) return null
  const tokens = t.split(/\s+/).filter(Boolean)
  const n = tokens.length
  if (n < 4) return null
  const amountRaw = tokens[n - 1]!.replace(',', '.')
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount < 0) return null
  const admin = tokens[n - 2]!
  const phone = tokens[n - 3]!
  const name = tokens.slice(0, n - 3).join(' ')
  const phoneNorm = phone.trim().slice(0, 64)
  const nameTrim = name.trim()
  if (!nameTrim || !phoneNorm || !admin.trim()) return null
  return {
    name: nameTrim,
    phone: phoneNorm,
    adminToken: admin.trim(),
    amount,
  }
}

function shortLinePreview(line: string, max = 72): string {
  const t = line.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

type AdminRow = {
  user_id: string
  email: string
  display_name: string
  is_admin: boolean
  is_partner: boolean
}

type StaffJson = {
  id: string
  user_id: string
  email: string
  role: string
  created_at: string
}

function payboxToken(t: string): boolean {
  const s = t.trim()
  if (s === 'פייבוקס' || s === 'פיי־בוקס' || s === 'פיי בוקס') return true
  return s.toLowerCase() === 'paybox'
}

function selectorKeywordToken(t: string): boolean {
  const s = t.trim()
  if (s === 'סלקטור' || s === 'סורק') return true
  const low = s.toLowerCase()
  return low === 'selector' || low === 'scanner'
}

function firstPartnerId(admins: AdminRow[]): string | null {
  const partners = [...admins].filter((a) => a.is_partner)
  if (partners.length === 0) return null
  partners.sort((a, b) => a.user_id.localeCompare(b.user_id))
  return partners[0]!.user_id
}

function scannersForEvent(staff: StaffJson[]): StaffJson[] {
  return staff
    .filter((r) => r.role === 'scanner')
    .sort((a, b) => {
      const ca = a.created_at || ''
      const cb = b.created_at || ''
      if (ca !== cb) return ca.localeCompare(cb)
      return a.user_id.localeCompare(b.user_id)
    })
}

function resolvePartnerNameTokenToRecipientId(token: string, admins: AdminRow[]): string | null {
  const t = token.trim()
  if (!t) return null
  const partners = admins.filter((a) => a.is_partner)
  for (const a of partners) {
    const d = a.display_name?.trim()
    const label = d || a.email || ''
    if (label === t) return a.user_id
    const first = label.split(/\s+/)[0] ?? ''
    if (first === t) return a.user_id
  }
  return null
}

type IncomeRecipientResolve = { id: string; kind: 'paybox' | 'selector' | 'partner' }

function resolveIncomeRecipientWithKind(
  token: string,
  admins: AdminRow[],
  eventStaff: StaffJson[],
): IncomeRecipientResolve | null {
  if (payboxToken(token)) {
    const id = firstPartnerId(admins)
    return id ? { id, kind: 'paybox' } : null
  }
  if (selectorKeywordToken(token)) {
    const scanners = scannersForEvent(eventStaff)
    if (scanners.length === 1) return { id: scanners[0]!.user_id, kind: 'selector' }
    return null
  }
  const id = resolvePartnerNameTokenToRecipientId(token, admins)
  return id ? { id, kind: 'partner' } : null
}

function generateUniqueCode(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function incomeRecipientRejectReason(
  parsed: ParsedLine,
  adminRows: AdminRow[],
  eventStaff: StaffJson[],
): string | null {
  if (payboxToken(parsed.adminToken) && !firstPartnerId(adminRows)) {
    return 'paybox_no_partner'
  }
  if (selectorKeywordToken(parsed.adminToken)) {
    const scanList = scannersForEvent(eventStaff)
    if (scanList.length === 0) return 'selector_no_scanner'
    if (scanList.length > 1) return `selector_multiple_scanners:${scanList.length}`
  }
  return 'partner_not_found'
}

type BulkImportSummaryPayload = {
  receivedLines: number
  validWorkItems: number
  skippedInvalidPhone: number
  errors: string[]
  added: number
}

function jsonWithSummary(
  body: Record<string, unknown>,
  summary: BulkImportSummaryPayload,
  status: number,
): Response {
  return json({ ...body, ...summary }, status)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  let bodyIn: { eventId?: unknown; text?: unknown }
  try {
    bodyIn = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const eventId = typeof bodyIn.eventId === 'string' ? bodyIn.eventId.trim() : ''
  const text = typeof bodyIn.text === 'string' ? bodyIn.text : ''
  if (!eventId) return json({ error: 'eventId נדרש' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  if (!supabaseUrl || !anonKey) return json({ error: 'Server misconfigured' }, 500)

  const userSb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await userSb.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  const { data: admins, error: adErr } = await userSb.rpc('list_global_users_for_staff')
  if (adErr || !Array.isArray(admins)) {
    return json(
      { error: adErr?.message ?? 'לא ניתן לטעון משתמשים לשיוך תשלום' },
      502,
    )
  }

  const { data: staffJson, error: stErr } = await userSb.rpc('list_event_staff', {
    p_event_id: eventId,
  })
  if (stErr) {
    return json({ error: stErr.message ?? 'אין הרשאה לאירוע' }, 403)
  }
  const eventStaff: StaffJson[] = Array.isArray(staffJson)
    ? (staffJson as StaffJson[])
    : typeof staffJson === 'string'
      ? (JSON.parse(staffJson) as StaffJson[])
      : []

  const adminRows = admins as unknown as AdminRow[]

  const rawLines = text.split(/\r?\n/)
  const errors: string[] = []
  let skippedInvalidPhone = 0
  type WorkRow = { displayNum: number; parsed: ParsedLine; linePreview: string }
  const work: WorkRow[] = []

  let receivedLines = 0
  let displayLineNum = 0
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!
    const trimmedLine = normalizePasteLine(raw)
    const fileLineIndex = i + 1

    if (!trimmedLine) {
      console.log(
        '[bulk-import-guests] line',
        JSON.stringify({
          eventId,
          fileLineIndex,
          displayLineNum: null,
          rawLine: raw,
          trimmedLine,
          parsedName: null,
          parsedPhone: null,
          formattedPhone: null,
          inWork: false,
          reason: 'skipped_empty_line',
        }),
      )
      continue
    }

    receivedLines += 1
    displayLineNum += 1

    const parsed = parseGuestBulkFinanceLine(raw)
    if (!parsed) {
      errors.push(
        `שורה ${displayLineNum}: פורמט שגוי — צריך: שם · טלפון · אדמין · סכום — ${shortLinePreview(raw)}`,
      )
      console.log(
        '[bulk-import-guests] line',
        JSON.stringify({
          eventId,
          fileLineIndex,
          displayLineNum,
          rawLine: raw,
          trimmedLine,
          parsedName: null,
          parsedPhone: null,
          formattedPhone: null,
          inWork: false,
          reason: 'invalid_line_format',
        }),
      )
      continue
    }

    const formattedPhone = formatIsraelMobileE164(parsed.phone)
    const resolved = resolveIncomeRecipientWithKind(parsed.adminToken, adminRows, eventStaff)
    if (!resolved) {
      if (payboxToken(parsed.adminToken) && !firstPartnerId(adminRows)) {
        errors.push(
          `שורה ${displayLineNum}: «פייבוקס» — אין שותף במערכת לשיוך; נדרש לפחות שותף אחד.`,
        )
      } else if (selectorKeywordToken(parsed.adminToken)) {
        const scanList = scannersForEvent(eventStaff)
        if (scanList.length === 0) {
          errors.push(
            `שורה ${displayLineNum}: «סלקטור»/«סורק» — לא הוגדר סורק לאירוע.`,
          )
        } else if (scanList.length > 1) {
          errors.push(
            `שורה ${displayLineNum}: «סלקטור»/«סורק» — יש ${scanList.length} סורקים; כתבו שם קובל תשלום במקום «סלקטור».`,
          )
        }
      } else {
        errors.push(
          `שורה ${displayLineNum}: לא נמצא שותף ל־«${parsed.adminToken}» — ${shortLinePreview(raw)}`,
        )
      }
      const code = incomeRecipientRejectReason(parsed, adminRows, eventStaff)
      console.log(
        '[bulk-import-guests] line',
        JSON.stringify({
          eventId,
          fileLineIndex,
          displayLineNum,
          rawLine: raw,
          trimmedLine,
          parsedName: parsed.name,
          parsedPhone: parsed.phone,
          formattedPhone,
          inWork: false,
          reason: code ?? 'income_recipient_unresolved',
        }),
      )
      continue
    }

    if (formattedPhone === null) {
      skippedInvalidPhone += 1
      console.log(
        '[bulk-import-guests] line',
        JSON.stringify({
          eventId,
          fileLineIndex,
          displayLineNum,
          rawLine: raw,
          trimmedLine,
          parsedName: parsed.name,
          parsedPhone: parsed.phone,
          formattedPhone: null,
          inWork: false,
          reason: 'invalid_israeli_mobile',
        }),
      )
      continue
    }

    work.push({ displayNum: displayLineNum, parsed, linePreview: shortLinePreview(raw) })
    console.log(
      '[bulk-import-guests] line',
      JSON.stringify({
        eventId,
        fileLineIndex,
        displayLineNum,
        rawLine: raw,
        trimmedLine,
        parsedName: parsed.name,
        parsedPhone: parsed.phone,
        formattedPhone,
        inWork: true,
        reason: 'accepted_into_work',
      }),
    )
  }

  const summaryAfterParse = (): BulkImportSummaryPayload => ({
    receivedLines,
    validWorkItems: work.length,
    skippedInvalidPhone,
    errors: [...errors],
    added: 0,
  })

  if (errors.length > 0) {
    return jsonWithSummary(
      {
        ok: false as const,
        skipped: 0,
        queuedForWhatsapp: 0,
        createdGuests: [],
        financeLinesCreated: [],
      },
      summaryAfterParse(),
      200,
    )
  }

  if (work.length === 0) {
    return jsonWithSummary(
      {
        ok: true as const,
        skipped: 0,
        queuedForWhatsapp: 0,
        errors: [],
        createdGuests: [],
        financeLinesCreated: [],
      },
      summaryAfterParse(),
      200,
    )
  }

  const createdGuests: Record<string, unknown>[] = []
  const financeLinesCreated: Record<string, unknown>[] = []
  let added = 0

  for (const w of work) {
    const { name: n, phone: p, amount } = w.parsed
    const resolved = resolveIncomeRecipientWithKind(
      w.parsed.adminToken,
      adminRows,
      eventStaff,
    )!
    try {
      const { data: siblingBundle } = await userSb.rpc(
        'lookup_invite_bundle_code_for_event_identity',
        {
          p_event_id: eventId,
          p_name: n.trim(),
          p_phone: p.trim(),
        },
      )
      const bundle =
        siblingBundle != null && String(siblingBundle).trim()
          ? String(siblingBundle).trim()
          : null

      let guest: Record<string, unknown> | null = null
      let lastInsErr: { code?: string; message: string } | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateUniqueCode()
        const inviteBundle = bundle ?? code
        const { data: ins, error: insErr } = await userSb
          .from('guests')
          .insert({
            name: n.trim(),
            phone: p.trim(),
            unique_code: code,
            invite_bundle_code: inviteBundle,
            status: 'pending',
            event_id: eventId,
            source: 'list',
          })
          .select(GUEST_SELECT)
          .single()
        if (!insErr && ins) {
          guest = ins as Record<string, unknown>
          break
        }
        lastInsErr = insErr
          ? { code: insErr.code, message: insErr.message }
          : { message: 'insert failed' }
        if (insErr?.code !== '23505') break
      }
      if (!guest) {
        errors.push(
          `שורה ${w.displayNum}: לא נשמר אורח — ${lastInsErr?.message ?? 'שגיאה'}`,
        )
        console.log(
          '[bulk-import-guests] line',
          JSON.stringify({
            eventId,
            displayLineNum: w.displayNum,
            phase: 'db_insert_guest',
            inWork: false,
            reason: 'guest_insert_failed',
            detail: lastInsErr?.message ?? null,
            parsedName: n.trim(),
            parsedPhone: p.trim(),
            formattedPhone: formatIsraelMobileE164(p.trim()),
          }),
        )
        continue
      }
      const guestId = String(guest.id)
      added++

      const { data: fin, error: finErr } = await userSb
        .from('event_finance_lines')
        .insert({
          event_id: eventId,
          line_kind: 'income',
          guest_id: guestId,
          person_name: n.trim(),
          phone: p.trim(),
          amount,
          recipient_admin_id: resolved.id,
          income_recipient_kind: resolved.kind,
          is_paid: false,
          created_by: user.id,
        })
        .select(FINANCE_SELECT)
        .single()

      if (finErr) {
        await userSb.from('guests').delete().eq('id', guestId)
        errors.push(`שורה ${w.displayNum}: שמירת כספים נכשלה — ${finErr.message}`)
        added--
        console.log(
          '[bulk-import-guests] line',
          JSON.stringify({
            eventId,
            displayLineNum: w.displayNum,
            phase: 'db_insert_finance',
            inWork: false,
            reason: 'finance_insert_failed',
            detail: finErr.message,
            parsedName: n.trim(),
            parsedPhone: p.trim(),
            formattedPhone: formatIsraelMobileE164(p.trim()),
          }),
        )
        continue
      }

      createdGuests.push(guest)
      if (fin) financeLinesCreated.push(fin as Record<string, unknown>)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה'
      errors.push(`שורה ${w.displayNum}: ${msg}`)
      console.log(
        '[bulk-import-guests] line',
        JSON.stringify({
          eventId,
          displayLineNum: w.displayNum,
          phase: 'db_insert',
          inWork: false,
          reason: 'exception',
          detail: msg,
        }),
      )
    }
  }

  return jsonWithSummary(
    {
      ok: errors.length === 0,
      skipped: 0,
      queuedForWhatsapp: 0,
      createdGuests,
      financeLinesCreated,
    },
    {
      receivedLines,
      validWorkItems: work.length,
      skippedInvalidPhone,
      errors: [...errors],
      added,
    },
    200,
  )
})
