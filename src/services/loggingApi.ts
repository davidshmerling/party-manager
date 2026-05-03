import { getSupabase } from '../lib/supabase'
import { newCorrelationId } from '../lib/correlationId'
import type { AuditLogRow, TechnicalLogRow } from '../types/logging'

function sb() {
  const s = getSupabase()
  if (!s) throw new Error('Supabase לא מאותחל')
  return s
}

function asMeta(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

function asContext(v: unknown): Record<string, unknown> {
  return asMeta(v)
}

/** סינון לפי `created_at` (אופציונלי) — ה־RPC חייב את המיגרציה time_filter */
export type LogsTimeFilter = {
  minCreatedAt: string | null
  maxCreatedAt: string | null
}

function nullTimeFilter(): LogsTimeFilter {
  return { minCreatedAt: null, maxCreatedAt: null }
}

/**
 * `customFrom` / `customTo` — ערכי ‎`datetime-local` או ‎`''`.
 */
export function buildLogsTimeFilter(
  preset: 'all' | '1h' | '24h' | '7d' | 'custom',
  customFrom: string,
  customTo: string,
): LogsTimeFilter {
  const now = Date.now()
  if (preset === 'all') return nullTimeFilter()
  if (preset === '1h') return { minCreatedAt: new Date(now - 3600e3).toISOString(), maxCreatedAt: null }
  if (preset === '24h') return { minCreatedAt: new Date(now - 864e5).toISOString(), maxCreatedAt: null }
  if (preset === '7d') return { minCreatedAt: new Date(now - 7 * 864e5).toISOString(), maxCreatedAt: null }
  const min = customFrom.trim() ? new Date(customFrom).toISOString() : null
  const max = customTo.trim() ? new Date(customTo).toISOString() : null
  return { minCreatedAt: min, maxCreatedAt: max }
}

function rpcTimeArgs(time?: LogsTimeFilter) {
  const t = time ?? nullTimeFilter()
  return {
    p_min_created_at: t.minCreatedAt,
    p_max_created_at: t.maxCreatedAt,
  }
}

export async function fetchAuditLogs(
  limit = 100,
  offset = 0,
  time: LogsTimeFilter = nullTimeFilter(),
): Promise<AuditLogRow[]> {
  const { data, error } = await sb().rpc('list_audit_logs', {
    p_limit: limit,
    p_offset: offset,
    ...rpcTimeArgs(time),
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    metadata: asMeta(row.metadata),
  })) as AuditLogRow[]
}

export async function fetchTechnicalLogs(
  limit = 100,
  offset = 0,
  time: LogsTimeFilter = nullTimeFilter(),
): Promise<TechnicalLogRow[]> {
  const { data, error } = await sb().rpc('list_technical_logs', {
    p_limit: limit,
    p_offset: offset,
    ...rpcTimeArgs(time),
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    context: asContext(row.context),
  })) as TechnicalLogRow[]
}

const FULL_BATCH = 500

/** הוספת offset ל־p_offset בפרומיסים עוקבים. מונעים כפילויות ב־id. */
function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const m = new Map<string, T>()
  for (const r of rows) m.set(r.id, r)
  return Array.from(m.values())
}

/**
 * שולוף **את כל** רשומות הביקורת (מספר קריאות) — לייצוא בלבד.
 * ממיון לפי זמן עולה. `time` = סינון בשרת (אותו `created_at`).
 */
export async function fetchAllAuditLogsSorted(
  time: LogsTimeFilter = nullTimeFilter(),
): Promise<AuditLogRow[]> {
  const out: AuditLogRow[] = []
  for (let o = 0; ; o += FULL_BATCH) {
    const batch = await fetchAuditLogs(FULL_BATCH, o, time)
    out.push(...batch)
    if (batch.length < FULL_BATCH) break
  }
  return dedupeById(out).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

/**
 * שולוף **את כל** הלוגים הטכניים, ממוין לפי זמן עולה.
 */
export async function fetchAllTechnicalLogsSorted(
  time: LogsTimeFilter = nullTimeFilter(),
): Promise<TechnicalLogRow[]> {
  const out: TechnicalLogRow[] = []
  for (let o = 0; ; o += FULL_BATCH) {
    const batch = await fetchTechnicalLogs(FULL_BATCH, o, time)
    out.push(...batch)
    if (batch.length < FULL_BATCH) break
  }
  return dedupeById(out).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJsonLogsExport(payload: {
  exported_at: string
  audit: AuditLogRow[]
  technical: TechnicalLogRow[]
}): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  downloadJsonFile(`qr-party-logs-${stamp}.json`, payload)
}

export async function buildFullLogsExport(
  time: LogsTimeFilter = nullTimeFilter(),
): Promise<{
  exported_at: string
  audit: AuditLogRow[]
  technical: TechnicalLogRow[]
}> {
  const [audit, technical] = await Promise.all([
    fetchAllAuditLogsSorted(time),
    fetchAllTechnicalLogsSorted(time),
  ])
  return { exported_at: new Date().toISOString(), audit, technical }
}

export type LogTechnicalOptions = {
  level?: 'info' | 'warn' | 'error'
  source?: string
  operation: string
  message: string
  context?: Record<string, unknown>
  correlationId?: string | null
  eventId?: string | null
}

const EVENT_PATH_RE =
  /^\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/** מזהה אירוע מנתיב ‎`/events/:id/…`‎ — לשימוש בלוגי UI */
export function extractEventIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const m = window.location.pathname.match(EVENT_PATH_RE)
  return m ? m[1]! : null
}

function buildClientActivityEnvelope(): Record<string, unknown> {
  if (typeof window === 'undefined') return {}
  return {
    href: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search || undefined,
    hash: window.location.hash ? window.location.hash.slice(0, 400) : undefined,
    referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : undefined,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    language: typeof navigator !== 'undefined' ? navigator.language : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 600) : undefined,
    ts_client: new Date().toISOString(),
  }
}

export type UserActivityOpts = {
  kind: string
  action: string
  detail?: Record<string, unknown>
  /** אם לא הועבר — ניסיון חילוץ מ־URL */
  eventId?: string | null
}

/**
 * לוג מפורט של פעולות משתמש ב‑UI (נשמר ב־technical_log, רמה info).
 * מומלץ לחיפוש בצ׳אט ולייצוא — הקשר מלא ב־context.
 */
export function logUserActivity(opts: UserActivityOpts): void {
  const eventId = opts.eventId !== undefined ? opts.eventId : extractEventIdFromLocation()
  const detail = opts.detail ?? {}
  logTechnicalEvent({
    level: 'info',
    source: 'frontend.ui',
    operation: `ui.${opts.kind}.${opts.action}`,
    message: `${opts.kind} → ${opts.action}`,
    context: {
      ...buildClientActivityEnvelope(),
      ...detail,
    },
    eventId: eventId ?? null,
  })
}

/** פעולות המותרות ב־RPC ‎log_client_audit_event‎ (מיגרציה) */
export type ClientAuditAction = 'auth.sign_in' | 'auth.sign_out' | 'auth.sign_up' | 'logs.export'

/**
 * ביקורת מצד לקוח (התחברות, ייצוא לוגים וכו׳). נכשל בשקט.
 */
export async function logClientAuditEvent(
  action: ClientAuditAction,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const client = getSupabase()
  if (!client) return
  try {
    const { error } = await client.rpc('log_client_audit_event', {
      p_action: action,
      p_metadata: metadata ?? {},
    })
    if (error && import.meta.env.DEV) {
      console.debug('log_client_audit_event failed', error.message)
    }
  } catch {
    /* ignore */
  }
}

/** שולח לוג טכני (RPC). נכשל בשקט אם אין session או שגיאת רשת — אין לולאה. */
export function logTechnicalEvent(opts: LogTechnicalOptions): void {
  const client = getSupabase()
  if (!client) return
  const level = opts.level ?? 'error'
  const source = opts.source ?? 'frontend'
  const op = opts.operation
  const msg = (opts.message || '(empty)').slice(0, 4000)
  const context = opts.context ?? {}
  const correlation_id = opts.correlationId ?? newCorrelationId()
  const p_event_id = opts.eventId ?? null

  void client
    .rpc('log_technical_event', {
      p_level: level,
      p_source: source,
      p_operation: op,
      p_message: msg,
      p_context: context,
      p_correlation_id: correlation_id,
      p_event_id: p_event_id,
    })
    .then(
      ({ error }) => {
        if (error && import.meta.env.DEV) {
          console.debug('log_technical_event failed', error.message)
        }
      },
      () => {},
    )
}
