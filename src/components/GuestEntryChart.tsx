import { useId, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useGuestEntryChart } from '../hooks/useGuestEntryChart'
import type { CumulativeEntryPointWithSlope } from '../utils/guestEntrySeries'

const CHART_HEIGHT = 320

function formatAxisTime(timeMs: number): string {
  return new Date(timeMs).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatTooltipTime(timeMs: number): string {
  return new Date(timeMs).toLocaleString('he-IL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

type GuestEntryChartProps = {
  eventId: string | null | undefined
  /** כש־false לא נטען (למשל מצב סורק בלי רשימת אורחים) */
  enabled?: boolean
  className?: string
}

/** גרף קו מצטבר: כניסות לאורך זמן (מבוסס entered_at). */
export function GuestEntryChart({ eventId, enabled = true, className }: GuestEntryChartProps) {
  const groupToggleId = useId()
  const [groupByMinute, setGroupByMinute] = useState(false)

  const { loading, error, chartPoints, cumulativePoints, peakMinute } = useGuestEntryChart(
    eventId,
    {
      enabled,
      groupByMinute,
      highlightSteep: true,
    },
  )

  const suggestMinute = cumulativePoints.length > 120

  const data = useMemo(
    () =>
      chartPoints.map((p) => ({
        ...p,
        /** Recharts עובד נוח עם מספר בציר X */
        x: p.timeMs,
      })),
    [chartPoints],
  )

  const domainMax = useMemo(() => {
    if (data.length === 0) return 1
    return Math.max(1, ...data.map((d) => d.count))
  }, [data])

  const peakLabel = useMemo(() => {
    if (!peakMinute || peakMinute.count < 2) return null
    const start = new Date(peakMinute.minuteStartMs)
    const end = new Date(peakMinute.minuteStartMs + 60000)
    return `${peakMinute.count} כניסות בין ${formatAxisTime(start.getTime())} ל־${formatAxisTime(end.getTime())}`
  }, [peakMinute])

  if (!enabled || !eventId) {
    return null
  }

  return (
    <section className={`guest-entry-chart ${className ?? ''}`.trim()} dir="rtl">
      <div className="guest-entry-chart__head">
        <h3 className="guest-entry-chart__title">הצטברות כניסות בזמן</h3>
        <label className="guest-entry-chart__toggle">
          <input
            id={groupToggleId}
            type="checkbox"
            checked={groupByMinute}
            onChange={(e) => setGroupByMinute(e.target.checked)}
          />
          קיבוץ לפי דקה
          {suggestMinute ? (
            <span className="muted guest-entry-chart__toggle-hint"> (מומלץ כשיש הרבה נקודות)</span>
          ) : null}
        </label>
      </div>
      <p className="muted small guest-entry-chart__desc">
        ציר X — זמן כניסה (entered_at), ציר Y — מספר מצטבר של אורחים שנכנסו. כל נקודה = כניסה נוספת.
      </p>

      {loading && <p className="muted guest-entry-chart__state">טוען גרף…</p>}
      {error && <p className="banner error guest-entry-chart__state">{error}</p>}

      {!loading && !error && data.length === 0 && (
        <p className="muted guest-entry-chart__state">אין עדיין כניסות מתועדות לאירוע זה.</p>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          {peakLabel ? (
            <p className="guest-entry-chart__peak muted small" title="דקה עם הכי הרבה כניסות">
              שיא קצב: {peakLabel}
            </p>
          ) : null}
          <div className="guest-entry-chart__plot">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatAxisTime}
                  stroke="#71717a"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[0, domainMax]}
                  allowDecimals={false}
                  stroke="#71717a"
                  tick={{ fontSize: 11 }}
                  width={40}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0]!.payload as CumulativeEntryPointWithSlope & { x: number }
                    return (
                      <div className="guest-entry-chart__tooltip">
                        <div className="guest-entry-chart__tooltip-time">
                          {formatTooltipTime(p.timeMs)}
                        </div>
                        <div className="guest-entry-chart__tooltip-count">
                          <strong>{p.count}</strong> אורחים נכנסו (מצטבר)
                        </div>
                      </div>
                    )
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={renderDot}
                  activeDot={{ r: 6 }}
                  isAnimationActive={data.length < 400}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}

function renderDot(props: {
  cx?: number
  cy?: number
  payload?: CumulativeEntryPointWithSlope & { x: number }
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) {
    return <g />
  }
  const steep = payload.steep === true
  return (
    <circle
      cx={cx}
      cy={cy}
      r={steep ? 5 : 3}
      fill={steep ? '#d97706' : '#2563eb'}
      stroke={steep ? '#b45309' : '#1d4ed8'}
      strokeWidth={1}
    />
  )
}
