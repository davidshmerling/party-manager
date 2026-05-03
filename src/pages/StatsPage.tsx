import { useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useMemo } from 'react'
import { useEvent } from '../context/EventContext'
import { usePartyViewMode } from '../context/PartyViewModeContext'
import { partyQueryKeys, PARTY_EVENT_STALE_MS } from '../lib/partyEventQueries'
import { fetchEventStatsPageBundle, fetchEventStatsRpc } from '../services/api'
import type { EventStatsRpc, GuestStats } from '../types/event'

const GuestEntryChart = lazy(() =>
  import('../components/GuestEntryChart').then((m) => ({ default: m.GuestEntryChart })),
)

const STATS_POLL_MS = 30_000

export function StatsPage({ embedded = false }: { embedded?: boolean }) {
  const { showScannerExperience } = usePartyViewMode()
  const useStatsRpcOnly = showScannerExperience
  const { currentEvent, currentEventId, loading: evLoading } = useEvent()
  const queryClient = useQueryClient()

  const statsQueryScanner = useQuery({
    queryKey: currentEventId
      ? partyQueryKeys.eventStats(currentEventId)
      : (['event', 'none', 'eventStats'] as const),
    queryFn: () => fetchEventStatsRpc(currentEventId!),
    enabled: Boolean(currentEventId) && useStatsRpcOnly,
    staleTime: PARTY_EVENT_STALE_MS,
    refetchInterval: STATS_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const statsBundleQuery = useQuery({
    queryKey: currentEventId
      ? partyQueryKeys.eventStatsBundle(currentEventId)
      : (['event', 'none', 'statsPageBundle'] as const),
    queryFn: async () => {
      const bundle = await fetchEventStatsPageBundle(currentEventId!)
      queryClient.setQueryData(partyQueryKeys.eventStats(currentEventId!), bundle.stats)
      queryClient.setQueryData(partyQueryKeys.eventGuestEntryTimes(currentEventId!), bundle.entryTimes)
      return bundle
    },
    enabled: Boolean(currentEventId) && !useStatsRpcOnly,
    staleTime: PARTY_EVENT_STALE_MS,
    refetchInterval: STATS_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const rpcStats = (useStatsRpcOnly
    ? (statsQueryScanner.data as EventStatsRpc | undefined)
    : statsBundleQuery.data?.stats) ?? null
  const statsLoading = Boolean(
    currentEventId &&
      !evLoading &&
      (useStatsRpcOnly ? statsQueryScanner.isLoading : statsBundleQuery.isLoading),
  )
  const statsRefetching = Boolean(
    currentEventId &&
      (useStatsRpcOnly
        ? statsQueryScanner.isFetching && !statsQueryScanner.isLoading
        : statsBundleQuery.isFetching && !statsBundleQuery.isLoading),
  )
  const chartQueryReady =
    !useStatsRpcOnly &&
    Boolean(
      currentEventId && (statsBundleQuery.isSuccess || Boolean(statsBundleQuery.isError)),
    )

  const stats = useMemo((): GuestStats => {
    if (!rpcStats) return { total: 0, pending: 0, entered: 0 }
    return {
      total: rpcStats.total_guests,
      pending: rpcStats.not_checked_in_count,
      entered: rpcStats.checked_in_count,
    }
  }, [rpcStats])

  const enteredPctOfTotal =
    rpcStats != null
      ? String(rpcStats.checked_in_percentage)
      : stats.total > 0
        ? ((stats.entered / stats.total) * 100).toFixed(1)
        : '0'

  const inner = (
    <>
      {(statsLoading || evLoading) && !rpcStats && <p className="muted">טוען…</p>}

      {((!statsLoading && !evLoading) || rpcStats) && currentEventId && (
        <>
          {statsRefetching && (
            <p className="muted small" style={{ marginBottom: '0.35rem' }} aria-live="polite">
              מעדכן…
            </p>
          )}
          <div className="stats-grid">
            <div className="stat-box">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">סה״כ ברשימה</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{stats.pending}</div>
              <div className="stat-label">לא נכנסו</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{stats.entered}</div>
              <div className="stat-label">נכנסו (כמות)</div>
            </div>
            <div className="stat-box stat-box-highlight">
              <div className="stat-value">{enteredPctOfTotal}%</div>
              <div className="stat-label">אחוז הגעה מסך המוזמנים</div>
            </div>
          </div>

          {rpcStats?.last_check_in_at && (
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              כניסה אחרונה:{' '}
              {new Date(rpcStats.last_check_in_at).toLocaleString('he-IL', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </p>
          )}

          {useStatsRpcOnly ? null : (
            <section className="stats-section stats-section--chart-wide">
              <Suspense fallback={<p className="muted">טוען גרף…</p>}>
                <GuestEntryChart eventId={currentEventId} enabled={chartQueryReady} />
              </Suspense>
            </section>
          )}
        </>
      )}
    </>
  )

  if (embedded) {
    return (
      <section className="scanner-event-home__stats" aria-labelledby="scanner-stats-heading">
        <h2 id="scanner-stats-heading" className="scanner-section-title">
          סטטיסטיקה
        </h2>
        <p className="muted small" style={{ marginBottom: '0.75rem' }}>
          {currentEvent ? (
            <>
              נתונים עבור: <strong>{currentEvent.name}</strong>
            </>
          ) : (
            'לא נבחרה מסיבה.'
          )}
        </p>
        {inner}
      </section>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>סטטיסטיקה</h1>
        <p className="muted">
          {currentEvent ? <>נתונים עבור: <strong>{currentEvent.name}</strong></> : 'לא נבחרה מסיבה.'}
        </p>
      </header>
      {inner}
    </div>
  )
}
