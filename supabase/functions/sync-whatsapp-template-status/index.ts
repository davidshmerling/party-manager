/**
 * מושך מ־Twilio את סטטוס אישור WhatsApp לתוכן (HX…) ומעדכן את events.whatsapp_twilio_content_status.
 * POST JSON: { eventId }
 *
 * Secrets: כמו submit-whatsapp-template (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

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

  let bodyIn: { eventId?: unknown }
  try {
    bodyIn = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const eventId = typeof bodyIn.eventId === 'string' ? bodyIn.eventId.trim() : ''
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
    .select('id, whatsapp_twilio_content_sid')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr) return json({ error: evErr.message }, 403)
  if (!ev) return json({ error: 'אירוע לא נמצא' }, 404)

  const contentSid =
    ev.whatsapp_twilio_content_sid != null ? String(ev.whatsapp_twilio_content_sid).trim() : ''
  if (!contentSid.startsWith('HX')) {
    return json({ error: 'לא הוגדר Content SID (HX) לאירוע' }, 400)
  }

  const url = `https://content.twilio.com/v1/Content/${encodeURIComponent(contentSid)}/ApprovalRequests`
  const getRes = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: twilioBasicAuth(accountSid, authToken),
      Accept: 'application/json',
    },
  })

  const getText = await getRes.text()
  if (!getRes.ok) {
    let detail = getText.slice(0, 500)
    try {
      const j = JSON.parse(getText) as { message?: string }
      if (j.message) detail = j.message
    } catch {
      /* ignore */
    }
    return json({ error: `Twilio ApprovalRequests: ${detail}` }, 502)
  }

  let waStatus = ''
  let waCategory: string | null = null
  let rejectionReason = ''
  try {
    const doc = JSON.parse(getText) as {
      whatsapp?: {
        status?: string
        category?: string
        rejection_reason?: string
      }
    }
    const wa = doc.whatsapp
    waStatus = typeof wa?.status === 'string' ? wa.status.trim() : ''
    waCategory = typeof wa?.category === 'string' ? wa.category.trim() : null
    rejectionReason = typeof wa?.rejection_reason === 'string' ? wa.rejection_reason.trim() : ''
  } catch {
    return json({ error: 'תגובת Twilio לא תקינה (JSON)' }, 502)
  }

  if (!waStatus) {
    return json({ error: 'לא נמצא סטטוס whatsapp בתגובת Twilio' }, 502)
  }

  const statusLabel =
    [waStatus, rejectionReason].filter(Boolean).join(' — ').slice(0, 512) || waStatus

  const serviceSb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const patch: Record<string, string | null> = {
    whatsapp_twilio_content_status: statusLabel,
  }
  if (waCategory) {
    patch.whatsapp_twilio_content_category = waCategory
  }

  const { error: upErr } = await serviceSb.from('events').update(patch).eq('id', eventId)

  if (upErr) {
    return json(
      {
        ok: false as const,
        error: `עדכון מסד נכשל: ${String(upErr.message ?? '')}`,
        whatsapp_status: waStatus,
      },
      500,
    )
  }

  return json(
    {
      ok: true as const,
      content_sid: contentSid,
      whatsapp_status: waStatus,
      rejection_reason: rejectionReason || null,
      category: waCategory,
      stored_status: statusLabel,
    },
    200,
  )
})
