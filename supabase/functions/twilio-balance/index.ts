/**
 * יתרת חשבון Twilio (למנהלי אירוע מחוברים).
 * POST JSON: { eventId } — Authorization: Bearer JWT
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

async function fetchTwilioBalance(accountSid: string, authToken: string): Promise<{
  balance: number
  currency: string
} | null> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`
  const r = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` },
  })
  if (!r.ok) return null
  const j = (await r.json()) as { balance?: string; currency?: string }
  const n = Number(j.balance)
  if (!Number.isFinite(n)) return null
  return { balance: n, currency: (j.currency ?? 'USD').trim() || 'USD' }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  let bodyIn: { eventId?: unknown }
  try {
    bodyIn = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const eventId = typeof bodyIn.eventId === 'string' ? bodyIn.eventId.trim() : ''
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

  const { data: ev, error: evErr } = await userSb.from('events').select('id').eq('id', eventId).maybeSingle()
  if (evErr || !ev) return json({ error: 'אין הרשאה לאירוע' }, 403)

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim()
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  if (!accountSid || !authToken) {
    return json({ error: 'Twilio לא מוגדר בשרת' }, 503)
  }

  const bal = await fetchTwilioBalance(accountSid, authToken)
  if (!bal) return json({ error: 'לא ניתן לטעון יתרה מטווילו' }, 502)

  return json({ ok: true as const, balance: bal.balance, currency: bal.currency }, 200)
})
