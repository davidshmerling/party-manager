import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildFullLogsExport,
  buildLogsTimeFilter,
  downloadJsonLogsExport,
  fetchAllAuditLogsSorted,
  fetchAllTechnicalLogsSorted,
  fetchAuditLogs,
  fetchTechnicalLogs,
  logClientAuditEvent,
} from '../services/loggingApi'
import type { AuditLogRow, TechnicalLogRow } from '../types/logging'

const PAGE = 60
const TOP_LOAD_PX = 56

type DataScope = 'view' | 'tab' | 'full'
type TimePreset = 'all' | '1h' | '24h' | '7d' | 'custom'
type MaxRowsOption = 200 | 500 | 1000 | 2000 | null

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return iso
  }
}

function LogsJsonPre({ value }: { value: unknown }) {
  const text =
    value != null && typeof value === 'object'
      ? JSON.stringify(value, null, 2)
      : String(value ?? '—')
  return (
    <pre className="logs-json-pre" tabIndex={0}>
      {text}
    </pre>
  )
}
/** חבילה מה־API (יורד לפי זמן) → סדר מזמן מוקדם לאחרון בתוך העמוד */
function pageDescToAscPage<T extends { id: string; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

function mergeOlderChunkAsc<T extends { id: string; created_at: string }>(olderChunk: T[], prev: T[]): T[] {
  const m = new Map<string, T>()
  for (const r of olderChunk) m.set(r.id, r)
  for (const r of prev) m.set(r.id, r)
  return Array.from(m.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

function formatLoadErrorMessage(raw: string): string {
  if (
    raw.includes('Could not find the function') ||
    raw.includes('404') ||
    /list_(audit|technical)_logs/i.test(raw)
  ) {
    return `${raw} — בדרך כלל המיגרציה לא הורצה: הריצו \`supabase db push\` (או הדביקו את ה־SQL מ־\`supabase/migrations/\` ב־SQL Editor).`
  }
  return raw
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

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('העתקה ללוח אינה נתמכת בדפדפן')
  }
  await navigator.clipboard.writeText(text)
}

export function LogsPage() {
  const [tab, setTab] = useState<'audit' | 'technical'>('audit')
  const [audit, setAudit] = useState<AuditLogRow[]>([])
  const [tech, setTech] = useState<TechnicalLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [offAudit, setOffAudit] = useState(0)
  const [offTech, setOffTech] = useState(0)
  const [moreAudit, setMoreAudit] = useState(true)
  const [moreTech, setMoreTech] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [dataScope, setDataScope] = useState<DataScope>('view')
  const [copyOk, setCopyOk] = useState(false)
  const [timePreset, setTimePreset] = useState<TimePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [maxTotalRows, setMaxTotalRows] = useState<MaxRowsOption>(500)

  const scrollAuditRef = useRef<HTMLDivElement | null>(null)
  const scrollTechRef = useRef<HTMLDivElement | null>(null)
  const didInitialScrollAudit = useRef(false)
  const didInitialScrollTech = useRef(false)
  const lastTopLoadAt = useRef(0)
  const lastTopLoadAtTech = useRef(0)
  const auditRef = useRef<AuditLogRow[]>([])
  const techRef = useRef<TechnicalLogRow[]>([])

  const timeFilter = useMemo(
    () => buildLogsTimeFilter(timePreset, customFrom, customTo),
    [timePreset, customFrom, customTo],
  )

  useEffect(() => {
    auditRef.current = audit
  }, [audit])
  useEffect(() => {
    techRef.current = tech
  }, [tech])

  const capN = useMemo(() => maxTotalRows ?? 10_000_000, [maxTotalRows])

  const loadInitial = useCallback(async () => {
    setErr(null)
    setLoading(true)
    didInitialScrollAudit.current = false
    didInitialScrollTech.current = false
    const first = Math.min(PAGE, capN)
    try {
      const [a, t] = await Promise.all([
        fetchAuditLogs(first, 0, timeFilter),
        fetchTechnicalLogs(first, 0, timeFilter),
      ])
      setAudit(pageDescToAscPage(a))
      setOffAudit(a.length)
      setMoreAudit(
        a.length > 0 && a.length === first && a.length < capN,
      )
      setTech(pageDescToAscPage(t))
      setOffTech(t.length)
      setMoreTech(
        t.length > 0 && t.length === first && t.length < capN,
      )
    } catch (e) {
      setErr(formatLoadErrorMessage(e instanceof Error ? e.message : 'שגיאה'))
    } finally {
      setLoading(false)
    }
  }, [timeFilter, capN])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  /** אחרי טעינה ראשונה: גלילה לתחתית = הלוגים העדכניים ביותר */
  useEffect(() => {
    if (loading) return
    if (tab === 'audit' && audit.length > 0 && !didInitialScrollAudit.current) {
      const el = scrollAuditRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
        didInitialScrollAudit.current = true
      }
    }
  }, [loading, tab, audit.length])

  useEffect(() => {
    if (loading) return
    if (tab === 'technical' && tech.length > 0 && !didInitialScrollTech.current) {
      const el = scrollTechRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
        didInitialScrollTech.current = true
      }
    }
  }, [loading, tab, tech.length])

  const loadMoreAudit = useCallback(async () => {
    if (loading || loadingMore || !moreAudit) return
    if (maxTotalRows != null && auditRef.current.length >= maxTotalRows) {
      setMoreAudit(false)
      return
    }
    setLoadingMore(true)
    setErr(null)
    const el = scrollAuditRef.current
    const hBefore = el?.scrollHeight ?? 0
    const tBefore = el?.scrollTop ?? 0
    const room = maxTotalRows == null ? PAGE : Math.max(0, maxTotalRows - auditRef.current.length)
    if (room <= 0) {
      setMoreAudit(false)
      setLoadingMore(false)
      return
    }
    const req = Math.min(PAGE, room)
    try {
      const rows = await fetchAuditLogs(req, offAudit, timeFilter)
      const olderAsc = pageDescToAscPage(rows)
      const merged = mergeOlderChunkAsc(olderAsc, auditRef.current)
      setAudit(merged)
      setOffAudit((o) => o + rows.length)
      setMoreAudit(
        rows.length > 0 &&
          rows.length === req &&
          (maxTotalRows == null || merged.length < maxTotalRows),
      )
      requestAnimationFrame(() => {
        const sc = scrollAuditRef.current
        if (!sc) return
        const hAfter = sc.scrollHeight
        sc.scrollTop = tBefore + (hAfter - hBefore)
      })
    } catch (e) {
      setErr(formatLoadErrorMessage(e instanceof Error ? e.message : 'שגיאה'))
    } finally {
      setLoadingMore(false)
    }
  }, [loading, loadingMore, moreAudit, offAudit, timeFilter, maxTotalRows])

  const loadMoreTech = useCallback(async () => {
    if (loading || loadingMore || !moreTech) return
    if (maxTotalRows != null && techRef.current.length >= maxTotalRows) {
      setMoreTech(false)
      return
    }
    setLoadingMore(true)
    setErr(null)
    const el = scrollTechRef.current
    const hBefore = el?.scrollHeight ?? 0
    const tBefore = el?.scrollTop ?? 0
    const room = maxTotalRows == null ? PAGE : Math.max(0, maxTotalRows - techRef.current.length)
    if (room <= 0) {
      setMoreTech(false)
      setLoadingMore(false)
      return
    }
    const req = Math.min(PAGE, room)
    try {
      const rows = await fetchTechnicalLogs(req, offTech, timeFilter)
      const olderAsc = pageDescToAscPage(rows)
      const merged = mergeOlderChunkAsc(olderAsc, techRef.current)
      setTech(merged)
      setOffTech((o) => o + rows.length)
      setMoreTech(
        rows.length > 0 &&
          rows.length === req &&
          (maxTotalRows == null || merged.length < maxTotalRows),
      )
      requestAnimationFrame(() => {
        const sc = scrollTechRef.current
        if (!sc) return
        const hAfter = sc.scrollHeight
        sc.scrollTop = tBefore + (hAfter - hBefore)
      })
    } catch (e) {
      setErr(formatLoadErrorMessage(e instanceof Error ? e.message : 'שגיאה'))
    } finally {
      setLoadingMore(false)
    }
  }, [loading, loadingMore, moreTech, offTech, timeFilter, maxTotalRows])

  const onScrollAudit = useCallback(() => {
    const el = scrollAuditRef.current
    if (!el || loading || loadingMore || !moreAudit) return
    const now = Date.now()
    if (now - lastTopLoadAt.current < 500) return
    if (el.scrollTop < TOP_LOAD_PX) {
      lastTopLoadAt.current = now
      void loadMoreAudit()
    }
  }, [loading, loadingMore, moreAudit, loadMoreAudit])

  const onScrollTech = useCallback(() => {
    const el = scrollTechRef.current
    if (!el || loading || loadingMore || !moreTech) return
    const now = Date.now()
    if (now - lastTopLoadAtTech.current < 500) return
    if (el.scrollTop < TOP_LOAD_PX) {
      lastTopLoadAtTech.current = now
      void loadMoreTech()
    }
  }, [loading, loadingMore, moreTech, loadMoreTech])

  const buildViewExportPayload = useCallback((): unknown => {
    const at = new Date().toISOString()
    if (tab === 'audit') {
      return {
        exported_at: at,
        kind: 'screen',
        time_filter: timeFilter,
        max_total_rows: maxTotalRows,
        count: audit.length,
        audit,
      }
    }
    return {
      exported_at: at,
      kind: 'screen',
      time_filter: timeFilter,
      max_total_rows: maxTotalRows,
      count: tech.length,
      technical: tech,
    }
  }, [tab, timeFilter, maxTotalRows, audit, tech])

  const resolveExportPayload = useCallback(async (): Promise<unknown> => {
    if (dataScope === 'view') {
      return buildViewExportPayload()
    }
    if (dataScope === 'tab') {
      const at = new Date().toISOString()
      if (tab === 'audit') {
        const auditRows = await fetchAllAuditLogsSorted(timeFilter)
        return { exported_at: at, kind: 'tab_full', time_filter: timeFilter, audit: auditRows }
      }
      const technicalRows = await fetchAllTechnicalLogsSorted(timeFilter)
      return { exported_at: at, kind: 'tab_full', time_filter: timeFilter, technical: technicalRows }
    }
    return buildFullLogsExport(timeFilter)
  }, [dataScope, tab, timeFilter, buildViewExportPayload])

  async function onCopyJson() {
    setErr(null)
    setExporting(true)
    try {
      const p = await resolveExportPayload()
      await copyTextToClipboard(JSON.stringify(p, null, 2))
      await logClientAuditEvent('logs.export', {
        method: 'clipboard',
        data_scope: dataScope,
        tab,
        time_preset: timePreset,
      })
      setCopyOk(true)
      window.setTimeout(() => setCopyOk(false), 2800)
    } catch (e) {
      setErr(formatLoadErrorMessage(e instanceof Error ? e.message : 'שגיאה'))
    } finally {
      setExporting(false)
    }
  }

  async function onDownloadJson() {
    setErr(null)
    setExporting(true)
    try {
      const p = await resolveExportPayload()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      if (dataScope === 'full' && p && typeof p === 'object' && 'audit' in p && 'technical' in p) {
        downloadJsonLogsExport(p as { exported_at: string; audit: AuditLogRow[]; technical: TechnicalLogRow[] })
        await logClientAuditEvent('logs.export', {
          method: 'download',
          data_scope: dataScope,
          tab: 'both',
          time_preset: timePreset,
        })
        return
      }
      if (dataScope === 'view') {
        downloadJsonFile(`qr-party-logs-masach-${stamp}.json`, p)
        await logClientAuditEvent('logs.export', {
          method: 'download',
          data_scope: dataScope,
          tab,
          time_preset: timePreset,
        })
        return
      }
      if (tab === 'audit') {
        downloadJsonFile(`qr-party-audit-${stamp}.json`, p)
      } else {
        downloadJsonFile(`qr-party-technical-${stamp}.json`, p)
      }
      await logClientAuditEvent('logs.export', {
        method: 'download',
        data_scope: dataScope,
        tab,
        time_preset: timePreset,
      })
    } catch (e) {
      setErr(formatLoadErrorMessage(e instanceof Error ? e.message : 'שגיאה'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>יומן ביקורת ולוגים טכניים</h1>
        <p className="muted small">
          <strong>מלמטה</strong> הלוגים העדכניים בטווח שבחרת. <strong>סינון זמן</strong> (ב־DB), <strong>מקס׳
          שורות</strong> לטעינה, גלילה <strong>למעלה</strong> או «היסטוריה נוספת». <strong>ייצוא</strong> (לוח /
          קובץ) לפי מקור. נדרש ‎<code>list_*_logs</code>‎ עם שדות תאריך (מיגרציה <code>list_logs_time_filter</code>).
        </p>
        {copyOk && (
          <div className="banner ok" role="status">
            הועתק ללוח
          </div>
        )}
        <div className="logs-toolbar">
          <label className="logs-field">
            <span className="logs-field-label">זמן (סינון)</span>
            <select
              className="input logs-select"
              value={timePreset}
              disabled={loading}
              onChange={(e) => setTimePreset(e.target.value as TimePreset)}
            >
              <option value="all">הכל (לפי הזמנים)</option>
              <option value="1h">שעה אחרונה</option>
              <option value="24h">24 שעות</option>
              <option value="7d">7 ימים</option>
              <option value="custom">מותאם (מתאריך)</option>
            </select>
          </label>
          {timePreset === 'custom' && (
            <div className="logs-custom-dates" dir="ltr">
              <label className="logs-field">
                <span className="logs-field-label">מ־</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  disabled={loading}
                />
              </label>
              <label className="logs-field">
                <span className="logs-field-label">עד</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  disabled={loading}
                />
              </label>
            </div>
          )}
          <label className="logs-field">
            <span className="logs-field-label">מקס׳ שורות לטעינה</span>
            <select
              className="input logs-select"
              value={maxTotalRows == null ? 'unl' : String(maxTotalRows)}
              disabled={loading}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'unl') setMaxTotalRows(null)
                else if (v === '200' || v === '500' || v === '1000' || v === '2000') {
                  setMaxTotalRows(Number(v) as MaxRowsOption)
                }
              }}
            >
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1,000</option>
              <option value="2000">2,000</option>
              <option value="unl">ללא מגבלה (סביר — עד מיליונים)</option>
            </select>
          </label>
          <label className="logs-field">
            <span className="logs-field-label">ייצוא: מקור</span>
            <select
              className="input logs-select"
              value={dataScope}
              disabled={loading}
              onChange={(e) => setDataScope(e.target.value as DataScope)}
            >
              <option value="view">לפי מסך (מה שנטען)</option>
              <option value="tab">לשונית — מהשרת (לפי סינון זמן)</option>
              <option value="full">הכל: ביקורת + טכני (לפי סינון זמן)</option>
            </select>
          </label>
        </div>
        <div className="logs-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={exporting || loading}
            onClick={() => void onCopyJson()}
            title="העתקת JSON ללוח לפי הבחירה למעלה"
          >
            {exporting ? 'מעבד…' : 'העתקה ללוח (JSON)'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={exporting || loading}
            onClick={() => void onDownloadJson()}
            title="הורדת קובץ JSON לפי הבחירה"
          >
            {exporting ? 'מעבד…' : 'הורדה לקובץ (JSON)'}
          </button>
        </div>
      </header>

      {err && <div className="banner error">{err}</div>}

      <div className="logs-tabs" role="tablist" aria-label="סוג לוג">
        <button
          type="button"
          className={tab === 'audit' ? 'btn logs-tab active' : 'btn secondary logs-tab'}
          role="tab"
          aria-selected={tab === 'audit'}
          onClick={() => setTab('audit')}
        >
          ביקורת
        </button>
        <button
          type="button"
          className={tab === 'technical' ? 'btn logs-tab active' : 'btn secondary logs-tab'}
          role="tab"
          aria-selected={tab === 'technical'}
          onClick={() => setTab('technical')}
        >
          טכני
        </button>
      </div>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : (
        <>
          {tab === 'audit' && (
            <div className="sheet-wrap">
              {audit.length > 0 && (
                <p className="muted small logs-count-hint">
                  נטענו {audit.length}
                  {maxTotalRows != null ? ` / עד ${maxTotalRows} שורות` : ''} — סינון זמן:{' '}
                  {timePreset === 'all'
                    ? 'הכל'
                    : timePreset === 'custom'
                      ? (customFrom || customTo ? 'טווח מותאם' : 'הגדירו תאריכים')
                      : timePreset}
                </p>
              )}
              {loadingMore && (
                <p className="muted small logs-loading-hint" aria-live="polite">
                  טוען היסטוריה ישנה…
                </p>
              )}
              <div
                className="logs-table-scroll"
                ref={scrollAuditRef}
                onScroll={onScrollAudit}
                role="region"
                aria-label="יומן ביקורת — גלילה"
              >
                <table className="sheet logs-inner-table">
                  <thead>
                    <tr>
                      <th>זמן</th>
                      <th>משתמש (actor)</th>
                      <th>פעולה</th>
                      <th>מצב</th>
                      <th>יישות</th>
                      <th>metadata (מלא)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moreAudit && (
                      <tr className="logs-manual-row">
                        <td colSpan={6} className="center">
                          <button
                            type="button"
                            className="btn small secondary"
                            disabled={loadingMore}
                            onClick={() => void loadMoreAudit()}
                          >
                            {loadingMore ? 'טוען…' : 'היסטוריה נוספת (עמוד קודם)'}
                          </button>
                        </td>
                      </tr>
                    )}
                    {audit.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted center">
                          אין רשומות
                        </td>
                      </tr>
                    ) : (
                      audit.map((r) => (
                        <tr key={r.id}>
                          <td className="small mono">{fmtTime(r.created_at)}</td>
                          <td className="small mono break-all">
                            {r.actor_user_id ?? '—'}
                          </td>
                          <td className="break-all small">{r.action}</td>
                          <td>
                            <span className="mono small">{r.status}</span>
                          </td>
                          <td className="small">
                            <span className="block">{r.entity_type}</span>
                            {r.entity_id != null && r.entity_id !== '' && (
                              <span className="muted block mono" style={{ fontSize: '0.72rem' }}>
                                entity: {r.entity_id}
                              </span>
                            )}
                            {r.event_id && (
                              <span className="muted block mono" style={{ fontSize: '0.72rem' }}>
                                event: {r.event_id}
                              </span>
                            )}
                          </td>
                          <td className="logs-json-cell">
                            <LogsJsonPre value={r.metadata} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'technical' && (
            <div className="sheet-wrap">
              {tech.length > 0 && (
                <p className="muted small logs-count-hint">
                  נטענו {tech.length}
                  {maxTotalRows != null ? ` / עד ${maxTotalRows} שורות` : ''} — סינון זמן:{' '}
                  {timePreset === 'all'
                    ? 'הכל'
                    : timePreset === 'custom'
                      ? (customFrom || customTo ? 'טווח מותאם' : 'הגדירו תאריכים')
                      : timePreset}
                </p>
              )}
              {loadingMore && (
                <p className="muted small logs-loading-hint" aria-live="polite">
                  טוען היסטוריה ישנה…
                </p>
              )}
              <div
                className="logs-table-scroll"
                ref={scrollTechRef}
                onScroll={onScrollTech}
                role="region"
                aria-label="לוגים טכניים — גלילה"
              >
                <table className="sheet logs-inner-table">
                  <thead>
                    <tr>
                      <th>זמן</th>
                      <th>משתמש</th>
                      <th>אירוע</th>
                      <th>correlation</th>
                      <th>רמה</th>
                      <th>מקור</th>
                      <th>operation</th>
                      <th>הודעה (מלא)</th>
                      <th>context (מלא)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moreTech && (
                      <tr className="logs-manual-row">
                        <td colSpan={9} className="center">
                          <button
                            type="button"
                            className="btn small secondary"
                            disabled={loadingMore}
                            onClick={() => void loadMoreTech()}
                          >
                            {loadingMore ? 'טוען…' : 'היסטוריה נוספת (עמוד קודם)'}
                          </button>
                        </td>
                      </tr>
                    )}
                    {tech.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="muted center">
                          אין רשומות
                        </td>
                      </tr>
                    ) : (
                      tech.map((r) => (
                        <tr key={r.id}>
                          <td className="small mono">{fmtTime(r.created_at)}</td>
                          <td className="small mono break-all">{r.user_id ?? '—'}</td>
                          <td className="small mono break-all">{r.event_id ?? '—'}</td>
                          <td className="small mono break-all">{r.correlation_id ?? '—'}</td>
                          <td>
                            <span className="mono small">{r.level}</span>
                          </td>
                          <td className="small">{r.source}</td>
                          <td className="break-all small">{r.operation}</td>
                          <td className="logs-json-cell">
                            <LogsJsonPre value={r.message} />
                          </td>
                          <td className="logs-json-cell">
                            <LogsJsonPre value={r.context} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
