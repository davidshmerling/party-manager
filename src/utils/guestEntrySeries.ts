/**
 * טרנספורמציות לגרף כניסות מצטברות — נפרד משכבת ה־API וה־UI.
 */

export type GuestEntryTimeRow = {
  id: string
  entered_at: string
}

export type CumulativeEntryPoint = {
  /** ISO — מקורי מהמסד */
  time: string
  timeMs: number
  count: number
  guestId: string
}

export type CumulativeEntryPointWithSlope = CumulativeEntryPoint & {
  /** קצב גבוה יחסית לקטע הקודם — לסימון ויזואלי */
  steep?: boolean
}

/** ממוין לפי entered_at; כל אורח מוסיף נקודה (1,2,3,…) */
export function buildCumulativeEntrySeries(rows: GuestEntryTimeRow[]): CumulativeEntryPoint[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime(),
  )
  return sorted.map((r, i) => {
    const timeMs = new Date(r.entered_at).getTime()
    return {
      time: r.entered_at,
      timeMs,
      count: i + 1,
      guestId: r.id,
    }
  })
}

/**
 * קיבוץ לפי דקה: נקודה אחת לכל דקה — ערך מצטבר בסוף הדקה (אחרון כרונולוגית באותה דקה).
 */
export function aggregateSeriesToMinuteBuckets(points: CumulativeEntryPoint[]): CumulativeEntryPoint[] {
  if (points.length === 0) return []
  const byMinute = new Map<number, CumulativeEntryPoint>()
  for (const p of points) {
    const minuteStart = Math.floor(p.timeMs / 60000) * 60000
    const prev = byMinute.get(minuteStart)
    if (!prev || p.count >= prev.count) {
      byMinute.set(minuteStart, {
        ...p,
        timeMs: minuteStart,
        time: new Date(minuteStart).toISOString(),
      })
    }
  }
  return [...byMinute.values()].sort((a, b) => a.timeMs - b.timeMs)
}

export type PeakMinuteInfo = {
  count: number
  minuteStartMs: number
}

/** דקה עם מספר מקסימלי של כניסות (לפי סדרה גולמית לפני/אחרי קיבוץ) */
export function findPeakMinuteByArrivals(points: CumulativeEntryPoint[]): PeakMinuteInfo | null {
  if (points.length === 0) return null
  const perMinute = new Map<number, number>()
  for (const p of points) {
    const m = Math.floor(p.timeMs / 60000) * 60000
    perMinute.set(m, (perMinute.get(m) ?? 0) + 1)
  }
  let bestMinute = 0
  let bestCount = 0
  for (const [m, c] of perMinute) {
    if (c > bestCount) {
      bestCount = c
      bestMinute = m
    }
  }
  return { count: bestCount, minuteStartMs: bestMinute }
}

/**
 * מסמן נקודות שבהן הקצב (כניסות לדקה בין נקודות סמוכות) בפרקטיל גבוה —
 * לצביעת נקודות ב"שעות שיא".
 */
export function markSteepSegments(points: CumulativeEntryPoint[]): CumulativeEntryPointWithSlope[] {
  if (points.length < 2) {
    return points.map((p) => ({ ...p, steep: false }))
  }
  const ratesPerMin: number[] = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const cur = points[i]!
    const dtMin = (cur.timeMs - prev.timeMs) / 60000
    const dCount = cur.count - prev.count
    if (dtMin <= 0) {
      ratesPerMin.push(Infinity)
    } else {
      ratesPerMin.push(dCount / dtMin)
    }
  }
  const finite = ratesPerMin.filter((r) => Number.isFinite(r) && r > 0)
  if (finite.length === 0) {
    return points.map((p) => ({ ...p, steep: false }))
  }
  const sorted = [...finite].sort((a, b) => a - b)
  const threshold = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))] ?? 0

  return points.map((p, i) => {
    if (i === 0) return { ...p, steep: false }
    const r = ratesPerMin[i - 1]!
    const steep = Number.isFinite(r) && r >= threshold && r > 0
    return { ...p, steep }
  })
}
