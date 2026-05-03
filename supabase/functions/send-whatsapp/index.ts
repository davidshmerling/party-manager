/**
 * שליחת הזמנת WhatsApp דרך Twilio (שרת בלבד — Credential ב-Secrets).
 * POST JSON: { eventId, guestId }
 * Authorization: Bearer <JWT>
 *
 * Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (למשל whatsapp:+1…),
 * VITE_PUBLIC_FRONTEND_URL (או PUBLIC_FRONTEND_URL) — אותו ערך כמו במשתנה הפרונט לבסיס האתר (כרטיסים /ticket/)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

function log(stage: string, data?: Record<string, unknown>) {
  const line = data != null ? `${stage} ${JSON.stringify(data)}` : stage
  console.log(`[send-whatsapp] ${line}`)
}

function logErr(stage: string, data?: Record<string, unknown>) {
  const line = data != null ? `${stage} ${JSON.stringify(data)}` : stage
  console.error(`[send-whatsapp] ${line}`)
}

/** מסונכרן עם ‎src/utils/twilioTemplateApproval.ts */
function twilioTemplateMeetsApprovalGate(
  contentSidRaw: string,
  placeholderSlots: number[],
  statusRaw: string | null | undefined,
): boolean {
  if (!contentSidRaw.startsWith('HX') || placeholderSlots.length === 0) return false
  const st = (statusRaw ?? '').trim().toLowerCase()
  if (!st) return false
  if (/\bpending\b/.test(st)) return false
  if (/\breceived\b/.test(st)) return false
  if (/\breject|\bfail/.test(st)) return false
  if (/\bpaused\b/.test(st)) return false
  return /\bapproved\b/.test(st)
}

function normalizePhoneForWa(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10 && digits.startsWith('05')) return `972${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`
  return digits
}

function formatWhatsAppInviteLink(cardUrls: string[]): string {
  const u = cardUrls.map((x) => x.trim()).filter(Boolean)
  return u[0] ?? ''
}

const DEFAULT_WHATSAPP_INVITE_TEMPLATE =
  'שלום {name},\nהכרטיס האישי שלך (ברקוד / QR):\n{link}\nשמור את הקישור להצגה בכניסה.'

function renderWhatsAppInvite(
  template: string | null | undefined,
  guestName: string,
  cardUrls: string[],
  eventName: string,
): string {
  const linkText = formatWhatsAppInviteLink(cardUrls)
  const t = template?.trim() ? template.trim() : DEFAULT_WHATSAPP_INVITE_TEMPLATE
  return t
    .replace(/\{name\}/g, guestName)
    .replace(/\{links\}/g, linkText)
    .replace(/\{link\}/g, linkText)
    .replace(/\{event\}/g, eventName)
}

/** מסונכרן עם mark-whatsapp-invite-sent */
function normalizePhoneForDedup(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('972')) {
    d = d.slice(3)
    if (d.length === 9 && d.startsWith('5')) d = `0${d}`
  }
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`
  return d
}

function guestIdentityKey(name: string, phone: string): string {
  const n = name.trim().replace(/\s+/g, ' ').toLowerCase()
  const p = normalizePhoneForDedup(phone)
  return `${n}\u0000${p}`
}

/** מספר ממוסך — עקביות עם ‎mask_phone_for_audit‎ בשרת */
function maskPhoneForAudit(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length <= 4) return '****'
  return `…${d.slice(-4)}`
}

function auditInviteTwilioFail(
  serviceSb: ReturnType<typeof createClient>,
  opts: {
    eventId: string
    guestId: string | null
    guestName?: string | null
    guestPhoneRaw?: string | null
    errorMessage: string
    phase: string
  },
) {
  void serviceSb.rpc('log_service_audit_event', {
    p_action: 'invite.twilio_failed',
    p_entity_type: 'guest',
    p_entity_id: opts.guestId,
    p_event_id: opts.eventId,
    p_status: 'failed',
    p_metadata: {
      error_message: opts.errorMessage,
      phase: opts.phase,
      guest_id: opts.guestId,
      guest_name: opts.guestName != null ? String(opts.guestName).slice(0, 200) : null,
      guest_phone_masked: maskPhoneForAudit(opts.guestPhoneRaw),
      method: 'twilio',
      source: 'edge_function',
    },
  })
}

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

console.log('[send-whatsapp] isolate loaded')

Deno.serve(async (req: Request) => {
  try {
  log('request', { method: req.method })

  if (req.method === 'OPTIONS') {
    log('cors preflight ok')
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    logErr('reject: no bearer token')
    return json({ error: 'Unauthorized' }, 401)
  }

  let bodyIn: { eventId?: unknown; guestId?: unknown }
  try {
    bodyIn = await req.json()
  } catch {
    logErr('reject: invalid json')
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const eventId =
    typeof bodyIn.eventId === 'string' ? bodyIn.eventId.trim() : ''
  const guestId =
    typeof bodyIn.guestId === 'string' ? bodyIn.guestId.trim() : ''
  if (!eventId || !guestId) {
    logErr('reject: missing ids')
    return json({ error: 'eventId ו-guestId נדרשים' }, 400)
  }

  log('post body ok', { eventId, guestId })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    logErr('reject: supabase env incomplete', {
      hasUrl: !!supabaseUrl,
      hasAnon: !!anonKey,
      hasServiceRole: !!serviceRoleKey,
    })
    return json({ error: 'השרת לא מוגדר (Supabase)' }, 500)
  }

  const serviceSb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim()
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  const fromWa = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim()
  const publicBase = (
    Deno.env.get('VITE_PUBLIC_FRONTEND_URL') ??
    Deno.env.get('PUBLIC_FRONTEND_URL') ??
    ''
  )
    .trim()
    .replace(/\/$/, '')

  if (!accountSid || !authToken || !fromWa || !publicBase) {
    logErr('reject: twilio/public base incomplete (503 — בדקו Secrets)', {
      hasTwilioAccountSid: !!accountSid,
      hasTwilioAuthToken: !!authToken,
      hasTwilioWhatsappFrom: !!fromWa,
      hasPublicFrontendUrl: !!publicBase,
      hint: 'הוסיפו ב-Supabase Edge Secrets: TWILIO_*, וגם VITE_PUBLIC_FRONTEND_URL או PUBLIC_FRONTEND_URL',
    })
    return json(
      {
        error:
          'Twilio לא מוגדר: הגדרו Secrets ‏TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, וגם VITE_PUBLIC_FRONTEND_URL (או PUBLIC_FRONTEND_URL — אותו ערך כמו לפרונט)',
      },
      503,
    )
  }

  const userSb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await userSb.auth.getUser()
  if (userErr || !user) {
    logErr('reject: getUser failed', { hasUser: !!user, err: userErr?.message ?? null })
    return json({ error: 'Unauthorized' }, 401)
  }

  log('auth ok', { userId: user.id })

  const { data: guestRow, error: guestErr } = await userSb
    .from('guests')
    .select('id, event_id, name, phone, source, invite_bundle_code')
    .eq('id', guestId)
    .maybeSingle()

  if (guestErr) {
    logErr('guest query error', { message: guestErr.message })
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId,
      errorMessage: guestErr.message.slice(0, 500),
      phase: 'guest_query',
    })
    return json({ error: guestErr.message }, 403)
  }
  if (!guestRow || String(guestRow.event_id) !== eventId) {
    logErr('guest not found or event mismatch', { guestId, eventId })
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId: guestId.trim() ? guestId : null,
      errorMessage: 'אורח לא נמצא או לא שייך לאירוע',
      phase: 'guest_lookup',
    })
    return json({ error: 'אורח לא נמצא' }, 404)
  }

  if (guestRow.source === 'pay_at_door') {
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId,
      guestName: String(guestRow.name ?? ''),
      guestPhoneRaw: String(guestRow.phone ?? ''),
      errorMessage: 'אין טלפון לתשלום בכניסה — Twilio לא ישיג',
      phase: 'pay_at_door',
    })
    return json({ error: 'אין מספר טלפון לתשלום בכניסה' }, 400)
  }

  const phoneRaw = String(guestRow.phone ?? '').trim()
  if (!phoneRaw) {
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId,
      guestName: String(guestRow.name ?? ''),
      errorMessage: 'חסר מספר טלפון לאורח',
      phase: 'missing_phone',
    })
    return json({ error: 'חסר מספר טלפון' }, 400)
  }

  const { data: evRow } = await userSb
    .from('events')
    .select(
      'name, whatsapp_invite_template, whatsapp_twilio_content_sid, whatsapp_twilio_content_status, whatsapp_twilio_placeholder_slots',
    )
    .eq('id', eventId)
    .maybeSingle()

  const eventName =
    evRow?.name != null && String(evRow.name).trim()
      ? String(evRow.name).trim()
      : 'האירוע'
  const inviteTemplate =
    evRow?.whatsapp_invite_template != null &&
    String(evRow.whatsapp_invite_template).trim()
      ? String(evRow.whatsapp_invite_template).trim()
      : null

  const code = encodeURIComponent(String(guestRow.invite_bundle_code ?? '').trim())
  const cardUrl = `${publicBase}/ticket/${code}`
  const guestName = String(guestRow.name ?? '').trim() || 'אורח'
  const message = renderWhatsAppInvite(inviteTemplate, guestName, [cardUrl], eventName)

  const rawSlots = evRow?.whatsapp_twilio_placeholder_slots
  const placeholderSlots = Array.isArray(rawSlots)
    ? rawSlots.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 9)
    : []
  const contentSidRaw =
    evRow?.whatsapp_twilio_content_sid != null
      ? String(evRow.whatsapp_twilio_content_sid).trim()
      : ''
  const useApprovedTemplate =
    contentSidRaw.startsWith('HX') && placeholderSlots.length > 0

  if (
    !twilioTemplateMeetsApprovalGate(
      contentSidRaw,
      placeholderSlots,
      evRow?.whatsapp_twilio_content_status != null
        ? String(evRow.whatsapp_twilio_content_status)
        : null,
    )
  ) {
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId,
      guestName,
      guestPhoneRaw: phoneRaw,
      errorMessage: 'תבנית ההודעה לא אושרה ב‑Meta לשליחה ב‑Twilio',
      phase: 'template_gate',
    })
    return json(
      {
        error:
          'שליחת WhatsApp דרך Twilio זמינה רק אחרי שתבנית ההודעה אושרה ב-Meta (סטטוס approved). בדקו בלשונית «וואטסאפ» או ב-Twilio Console.',
      },
      403,
    )
  }

  const digits = normalizePhoneForWa(phoneRaw)
  if (!digits) {
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId,
      guestName: guestName.slice(0, 160),
      guestPhoneRaw: phoneRaw,
      errorMessage: 'מספר טלפון לא תקין לשליחת WhatsApp',
      phase: 'phone_normalize',
    })
    return json({ error: 'מספר טלפון לא תקין לשליחת WhatsApp' }, 400)
  }
  const toAddr = `whatsapp:+${digits}`

  const fromNormalized = fromWa.startsWith('whatsapp:') ? fromWa : `whatsapp:${fromWa}`

  let twilioBody: URLSearchParams
  if (useApprovedTemplate) {
    const vars: Record<string, string> = {}
    if (placeholderSlots.includes(1)) vars['1'] = guestName
    if (placeholderSlots.includes(2)) vars['2'] = cardUrl
    if (placeholderSlots.includes(3)) vars['3'] = eventName
    twilioBody = new URLSearchParams({
      From: fromNormalized,
      To: toAddr,
      ContentSid: contentSidRaw,
      ContentVariables: JSON.stringify(vars),
    })
  } else {
    twilioBody = new URLSearchParams({
      From: fromNormalized,
      To: toAddr,
      Body: message,
    })
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const basic = btoa(`${accountSid}:${authToken}`)
  log('twilio request', {
    toE164Len: digits.length,
    useApprovedTemplate,
    contentSidPrefix: contentSidRaw ? `${contentSidRaw.slice(0, 4)}…` : null,
  })

  const twRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: twilioBody.toString(),
  })

  const twText = await twRes.text()
  if (!twRes.ok) {
    let detail = twText.slice(0, 400)
    try {
      const twJson = JSON.parse(twText) as { message?: string }
      if (twJson.message) detail = twJson.message
    } catch {
      /* ignore */
    }
    logErr('twilio http error', { status: twRes.status, detail: detail.slice(0, 300) })
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId,
      guestName,
      guestPhoneRaw: phoneRaw,
      errorMessage: `Twilio HTTP ${twRes.status}: ${detail.slice(0, 400)}`,
      phase: 'twilio_http',
    })
    return json({ error: `Twilio: ${detail}` }, 502)
  }

  log('twilio ok', { httpStatus: twRes.status })

  let twilioSid = ''
  try {
    const twOk = JSON.parse(twText) as { sid?: string }
    twilioSid = twOk.sid ?? ''
  } catch {
    /* ignore */
  }

  const { data: allGuests, error: errAll } = await serviceSb
    .from('guests')
    .select('id, name, phone')
    .eq('event_id', eventId)
    .is('deleted_at', null)

  if (errAll || !allGuests) {
    logErr('service role: list guests failed', { message: errAll?.message ?? null })
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId,
      guestName,
      guestPhoneRaw: phoneRaw,
      errorMessage: errAll?.message?.slice(0, 500) ?? 'רשימת אורחים נכשלה אחרי Twilio',
      phase: 'db_list_guests_after_twilio',
    })
    return json(
      {
        error: errAll?.message ?? 'עדכון DB נכשל אחרי שליחת Twilio — בדקו את הרשומה ידנית',
      },
      500,
    )
  }

  const key = guestIdentityKey(String(guestRow.name ?? ''), String(guestRow.phone ?? ''))
  const ids = allGuests
    .filter(
      (g) =>
        guestIdentityKey(String(g.name ?? ''), String(g.phone ?? '')) === key,
    )
    .map((g) => g.id as string)

  const whatsapp_invite_sent_at = new Date().toISOString()
  const { error: errUp } = await serviceSb
    .from('guests')
    .update({
      whatsapp_invite_sent_at,
      invite_sent_method: 'twilio',
    })
    .in('id', ids)
    .is('deleted_at', null)

  if (errUp) {
    logErr('db update failed after twilio', { message: errUp.message })
    auditInviteTwilioFail(serviceSb, {
      eventId,
      guestId,
      guestName,
      guestPhoneRaw: phoneRaw,
      errorMessage: errUp.message.slice(0, 500),
      phase: 'db_mark_sent_after_twilio',
    })
    return json({ error: errUp.message }, 500)
  }

  log('done', { markedCount: ids.length, twilioSid: twilioSid ? `${twilioSid.slice(0, 8)}…` : null })

  return json(
    {
      ok: true as const,
      twilio_sid: twilioSid,
      sent_at: whatsapp_invite_sent_at,
      marked_guest_ids: ids,
    },
    200,
  )
  } catch (e) {
    logErr('unhandled exception', {
      message: e instanceof Error ? e.message : String(e),
    })
    return json({ error: 'שגיאה פנימית ב-send-whatsapp' }, 500)
  }
})
