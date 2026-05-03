import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchGuestEntryTimesAsc } from '../services/api'
import { partyQueryKeys, PARTY_EVENT_STALE_MS } from '../lib/partyEventQueries'
import type { GuestEntryTimeRow } from '../utils/guestEntrySeries'
import {
  aggregateSeriesToMinuteBuckets,
  buildCumulativeEntrySeries,
  findPeakMinuteByArrivals,
  markSteepSegments,
  type CumulativeEntryPointWithSlope,
} from '../utils/guestEntrySeries'

export type UseGuestEntryChartOptions = {
  /** כש־false לא מבצע fetch (למשל אין eventId) */
  enabled?: boolean
  /** כש־true משתמש בנקודה לכל דקה במקום לכל אורח */
  groupByMinute?: boolean
  /** מסמן נקודות בקצב גבוה (אחרי קיבוץ אם יש) */
  highlightSteep?: boolean
}

export function useGuestEntryChart(
  eventId: string | null | undefined,
  options: UseGuestEntryChartOptions = {},
) {
  const { enabled = true, groupByMinute = false, highlightSteep = true } = options

  const entryQuery = useQuery({
    queryKey: eventId
      ? partyQueryKeys.eventGuestEntryTimes(eventId)
      : (['event', 'none', 'guestEntryTimes'] as const),
    queryFn: () => fetchGuestEntryTimesAsc(eventId!),
    enabled: Boolean(eventId) && enabled,
    staleTime: PARTY_EVENT_STALE_MS,
    refetchOnWindowFocus: true,
  })

  const rows: GuestEntryTimeRow[] = entryQuery.data ?? []
  const loading = Boolean(entryQuery.isLoading && !entryQuery.data)
  const error = entryQuery.error
    ? entryQuery.error instanceof Error
      ? entryQuery.error.message
      : 'שגיאה בטעינת נתונים'
    : null

  const cumulative = useMemo(() => buildCumulativeEntrySeries(rows), [rows])

  const chartBase = useMemo(() => {
    const base = groupByMinute ? aggregateSeriesToMinuteBuckets(cumulative) : cumulative
    if (!highlightSteep || base.length === 0) {
      return base.map((p) => ({ ...p, steep: false })) as CumulativeEntryPointWithSlope[]
    }
    return markSteepSegments(base)
  }, [cumulative, groupByMinute, highlightSteep])

  const peakMinute = useMemo(() => findPeakMinuteByArrivals(cumulative), [cumulative])

  return {
    loading,
    error,
    rawRows: rows,
    cumulativePoints: cumulative,
    chartPoints: chartBase,
    peakMinute,
  }
}
