/**
 * יוצר תוכן ב‑Twilio Content API ושולח לאישור WhatsApp (Meta).
 * POST JSON: { eventId, category?: "UTILITY" | "MARKETING" }
 *
 * משתמש באותם Secrets כמו send-whatsapp (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const DEFAULT_WHATSAPP_INVITE_TEMPLATE =
  'שלום {name},\nהכרטיס האישי שלך (ברקוד / QR):\n{link}\nשמור את הקישור להצגה בכניסה.'

/** תואם ל‑QR Party ‎{name}‎ / ‎{link}‎ / ‎{links}‎ / ‎{event}‎ → ‎{{1}}‎ …‎{{3}}‎ */
function qrPartyTemplateToTwilioText(templateRaw: string): {
  body: string
  slots: number[]
  sampleVars: Record<string, string>
} {
  const template =
    templateRaw.trim().length > 0 ? templateRaw.trim() : DEFAULT_WHATSAPP_INVITE_TEMPLATE
  let body = template
  body = body.replace(/\{name\}/g, '{{1}}')
  body = body.replace(/\{links\}/g, '{{2}}')
  body = body.replace(/\{link\}/g, '{{2}}')
  body = body.replace(/\{event\}/g, '{{3}}')

  const slotSet = new Set<number>()
  const re = /\{\{\s*(\d+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    slotSet.add(Number(m[1]))
  }
  const slots = [...slotSet].sort((a, b) => a - b)

  const sampleVars: Record<string, string> = {}
  if (slotSet.has(1)) sampleVars['1'] = 'ישראל ישראלי'
  if (slotSet.has(2)) sampleVars['2'] = 'https://example.com/ticket/preview'
  if (slotSet.has(3)) sampleVars['3'] = 'שם האירוע לדוגמה'

  return { body, slots, sampleVars }
}

function slugApprovalName(eventId: string): string {
  const hex = eventId.replace(/-/g, '').slice(0, 16)
  const ts = Math.floor(Date.now() / 1000)
  return `invite_${hex}_${ts}`.slice(0, 128).toLowerCase()
}

function slugFriendlyName(eventId: string): string {
  const hex = eventId.replace(/-/g, '').slice(0, 12)
  const ts = Date.now().toString(36)
  const raw = `qr_party_${hex}_${ts}`
  return raw.replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 64)
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

function twilioBasicAuth(accountSid: string, authToken: string): string {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let bodyIn: { eventId?: unknown; category?: unknown }
  try {
    bodyIn = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const eventId =
    typeof bodyIn.eventId === 'string' ? bodyIn.eventId.trim() : ''
  const catRaw = typeof bodyIn.category === 'string' ? bodyIn.category.trim().toUpperCase() : ''
  const category =
    catRaw === 'MARKETING' || catRaw === 'UTILITY' ? catRaw : 'UTILITY'

  if (!eventId) {
    return json({ error: 'חסר eventId' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'השרת לא מוגדר (Supabase)' }, 500)
  }

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim()
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  if (!accountSid || !authToken) {
    return json({ error: 'Twilio לא מוגדר (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)' }, 503)
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
    return json({ error: 'Unauthorized' }, 401)
  }

  const { data: ev, error: evErr } = await userSb
    .from('events')
    .select('id, name, whatsapp_invite_template')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr) return json({ error: evErr.message }, 403)
  if (!ev) return json({ error: 'אירוע לא נמצא' }, 404)

  const inviteRaw =
    ev.whatsapp_invite_template != null && String(ev.whatsapp_invite_template).trim()
      ? String(ev.whatsapp_invite_template)
      : ''

  const { body: twilioBody, slots, sampleVars } =
    qrPartyTemplateToTwilioText(inviteRaw)

  if (slots.length === 0) {
    return json(
      {
        error:
          'לא זוהו משתני תבנית — השתמשו ב־{name}, ‏{link} ואופציונלי ‏{event}',
      },
      400,
    )
  }

  const friendlyName = slugFriendlyName(eventId)
  const approvalTemplateName = slugApprovalName(eventId)

  const createPayload = {
    friendly_name: friendlyName,
    language: 'he',
    variables: sampleVars,
    types: {
      'twilio/text': {
        body: twilioBody,
      },
    },
  }

  const authHdr = twilioBasicAuth(accountSid, authToken)

  const createRes = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: {
      Authorization: authHdr,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  })

  const createText = await createRes.text()
  if (!createRes.ok) {
    let detail = createText.slice(0, 500)
    try {
      const j = JSON.parse(createText) as { message?: string }
      if (j.message) detail = j.message
    } catch {
      /* ignore */
    }
    return json({ error: `Twilio Content: ${detail}` }, 502)
  }

  let contentSid = ''
  try {
    const created = JSON.parse(createText) as { sid?: string }
    contentSid = created.sid ?? ''
  } catch {
    return json({ error: 'תגובת Twilio לא תקינה' }, 502)
  }
  if (!contentSid.startsWith('HX')) {
    return json({ error: 'לא התקבל Content SID תקין מטווילו' }, 502)
  }

  const approveUrl = `https://content.twilio.com/v1/Content/${encodeURIComponent(contentSid)}/ApprovalRequests/whatsapp`
  const approveRes = await fetch(approveUrl, {
    method: 'POST',
    headers: {
      Authorization: authHdr,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: approvalTemplateName,
      category,
    }),
  })

  const approveText = await approveRes.text()
  let approvalStatus = ''
  let rejectionReason = ''
  try {
    const appr = JSON.parse(approveText) as {
      status?: string
      rejection_reason?: string
    }
    approvalStatus = appr.status ?? ''
    rejectionReason = appr.rejection_reason ?? ''
  } catch {
    /* נותר ריק אם התגובה לא JSON */
  }

  if (!approveRes.ok) {
    return json(
      {
        error: `אישור WhatsApp נכשל: ${approveText.slice(0, 400)}`,
        content_sid: contentSid,
      },
      502,
    )
  }

  const submittedAt = new Date().toISOString()
  const statusLabel =
    [approvalStatus, rejectionReason].filter(Boolean).join(' — ') ||
    approvalStatus ||
    'נשלח לאישור'

  const serviceSb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: upErr } = await serviceSb
    .from('events')
    .update({
      whatsapp_twilio_content_sid: contentSid,
      whatsapp_twilio_content_name: approvalTemplateName,
      whatsapp_twilio_content_status: statusLabel.slice(0, 512),
      whatsapp_twilio_content_category: category,
      whatsapp_twilio_content_submitted_at: submittedAt,
      whatsapp_twilio_placeholder_slots: slots,
    })
    .eq('id', eventId)

  if (upErr) {
    return json(
      {
        ok: false,
        error: `נוצר תוכן בטווילו (${contentSid}) אך עדכון מסד נכשל: ${String(upErr.message ?? '')}`,
        content_sid: contentSid,
      },
      500,
    )
  }

  return json(
    {
      ok: true as const,
      content_sid: contentSid,
      approval_name: approvalTemplateName,
      approval_status: approvalStatus,
      rejection_reason: rejectionReason || null,
      category,
      submitted_at: submittedAt,
      placeholder_slots: slots,
    },
    200,
  )
})
