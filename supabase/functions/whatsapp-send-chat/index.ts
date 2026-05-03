/**
 * שליחת הודעת WhatsApp (סשן) לאורח אחרי שנשלחה הזמנה דרך Twilio.
 * POST JSON: { eventId, guestId, body }
 * חלון 24 שעות: רק אם יש inbound אחרון — אחרת דורש תבנית (לא ממומש בגרסה זו — 400).
 * Authorization: Bearer JWT
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function normalizePhoneForWa(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10 && digits.startsWith('05')) return `972${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`
  return digits
}

async function fetchTwilioBalance(accountSid: string, authToken: string): Promise<number | null> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`
  const r = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` },
  })
  if (!r.ok) return null
  const j = (await r.json()) as { balance?: string }
  const n = Number(j.balance)
  return Number.isFinite(n) ? n : null
}

const SESSION_MS = 24 * 60 * 60 * 1000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  let bodyIn: { eventId?: unknown; guestId?: unknown; body?: unknown }
  try {
    bodyIn = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const eventId = typeof bodyIn.eventId === 'string' ? bodyIn.eventId.trim() : ''
  const guestId = typeof bodyIn.guestId === 'string' ? bodyIn.guestId.trim() : ''
  const text = typeof bodyIn.body === 'string' ? bodyIn.body.trim() : ''
  if (!eventId || !guestId) return json({ error: 'eventId ו-guestId נדרשים' }, 400)
  if (!text) return json({ error: 'גוף ההודעה ריק' }, 400)
  if (text.length > 1600) return json({ error: 'ההודעה ארוכה מדי' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server misconfigured' }, 500)

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim()
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  const fromWa = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim()
  if (!accountSid || !authToken || !fromWa) {
    return json({ error: 'Twilio לא מוגדר בשרת' }, 503)
  }

  const bal = await fetchTwilioBalance(accountSid, authToken)
  if (bal != null && bal < 2) {
    return json({ error: 'יתרת Twilio נמוכה מדי — לא ניתן לשלוח הודעות' }, 402)
  }

  const userSb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })
  const serviceSb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await userSb.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

  const { data: guestRow, error: guestErr } = await userSb
    .from('guests')
    .select(
      'id, event_id, phone, source, whatsapp_invite_sent_at, invite_sent_method, whatsapp_last_inbound_at',
    )
    .eq('id', guestId)
    .maybeSingle()

  if (guestErr || !guestRow || String(guestRow.event_id) !== eventId) {
    return json({ error: 'אורח לא נמצא' }, 404)
  }

  if (guestRow.source === 'pay_at_door') {
    return json({ error: 'תשלום בכניסה — אין שליחה' }, 400)
  }

  const method = String(guestRow.invite_sent_method ?? '').trim().toLowerCase()
  if (method !== 'twilio' || guestRow.whatsapp_invite_sent_at == null) {
    return json({ error: 'שיחה זמינה רק אחרי שליחת הזמנה דרך Twilio' }, 403)
  }

  const lastRaw = guestRow.whatsapp_last_inbound_at as string | null
  const lastInbound = lastRaw ? new Date(lastRaw).getTime() : 0
  const inSession = lastInbound > 0 && Date.now() - lastInbound < SESSION_MS
  if (!inSession) {
    return json(
      {
        error:
          'חלון 24 השעות מההודעה האחרונה של האורח נסגר. שליחה נוספת דורשת תבנית מאושרת — השתמשו בקונסולת Twilio או הוסיפו תבנית בממשק בהמשך.',
        code: 'outside_session_window',
      },
      400,
    )
  }

  const phoneRaw = String(guestRow.phone ?? '').trim()
  const digits = normalizePhoneForWa(phoneRaw)
  if (!digits) return json({ error: 'מספר טלפון לא תקין' }, 400)
  const toAddr = `whatsapp:+${digits}`
  const fromNormalized = fromWa.startsWith('whatsapp:') ? fromWa : `whatsapp:${fromWa}`

  const twilioBody = new URLSearchParams({
    From: fromNormalized,
    To: toAddr,
    Body: text,
  })

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const twRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
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
    return json({ error: `Twilio: ${detail}` }, 502)
  }

  let twilioSid = ''
  let twStatus = 'queued'
  try {
    const twOk = JSON.parse(twText) as { sid?: string; status?: string }
    twilioSid = twOk.sid ?? ''
    if (twOk.status) twStatus = String(twOk.status).toLowerCase()
  } catch {
    /* ignore */
  }

  const { error: insErr } = await serviceSb.from('whatsapp_messages').insert({
    event_id: eventId,
    guest_id: guestId,
    from_phone: fromNormalized,
    to_phone: toAddr,
    body: text,
    direction: 'outbound',
    status: twStatus,
    twilio_sid: twilioSid || null,
    message_kind: 'session',
  })

  if (insErr) {
    console.error('[whatsapp-send-chat] insert failed', insErr.message)
    return json({ error: 'נשלח בטווילו אך שמירה במסד נכשלה' }, 500)
  }

  return json({ ok: true as const, twilio_sid: twilioSid, status: twStatus }, 200)
})
