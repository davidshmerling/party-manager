import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { createEventRow, deleteEventWithPassword, fetchEvents, fetchEventsForStaffUser } from '../services/api'
import type { EventRow } from '../types/event'

const STORAGE_KEY = 'qr_party_current_event_id'

type Ctx = {
  events: EventRow[]
  currentEvent: EventRow | null
  currentEventId: string | null
  loading: boolean
  setCurrentEventId: (id: string) => void
  createEvent: (name: string) => Promise<EventRow>
  deleteEvent: (eventId: string, password: string) => Promise<void>
  refreshEvents: () => Promise<void>
}

const EventContext = createContext<Ctx | null>(null)

export function EventProvider({ children }: { children: ReactNode }) {
  const { isAdmin, isScanner } = useAuth()
  const [events, setEvents] = useState<EventRow[]>([])
  const [currentEventId, setCurrentIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshEvents = useCallback(async () => {
    const list =
      isAdmin || !isScanner ? await fetchEvents() : await fetchEventsForStaffUser()
    setEvents(list)
    setCurrentIdState((prev) => {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      const validStored = stored && list.some((e) => e.id === stored)
      if (validStored) return stored!
      if (prev && list.some((e) => e.id === prev)) return prev
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    })
  }, [isAdmin, isScanner])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await refreshEvents()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshEvents])

  const setCurrentEventId = useCallback((id: string) => {
    const t = id.trim()
    if (!t) {
      sessionStorage.removeItem(STORAGE_KEY)
      setCurrentIdState(null)
      return
    }
    sessionStorage.setItem(STORAGE_KEY, t)
    setCurrentIdState(t)
  }, [])

  const createEvent = useCallback(
    async (name: string) => {
      const e = await createEventRow(name)
      setEvents((prev) => [...prev, e].sort((a, b) => a.created_at.localeCompare(b.created_at)))
      setCurrentEventId(e.id)
      return e
    },
    [setCurrentEventId],
  )

  const deleteEvent = useCallback(async (eventId: string, password: string) => {
    await deleteEventWithPassword(eventId, password)
    setEvents((prev) => prev.filter((e) => e.id !== eventId))
    setCurrentIdState((prev) => {
      if (prev !== eventId) return prev
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    })
  }, [])

  const currentEvent = useMemo(
    () => events.find((e) => e.id === currentEventId) ?? null,
    [events, currentEventId],
  )

  const value = useMemo(
    () => ({
      events,
      currentEvent,
      currentEventId,
      loading,
      setCurrentEventId,
      createEvent,
      deleteEvent,
      refreshEvents,
    }),
    [events, currentEvent, currentEventId, loading, setCurrentEventId, createEvent, deleteEvent, refreshEvents],
  )

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}

export function useEvent(): Ctx {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error('useEvent חייב בתוך EventProvider')
  return ctx
}
