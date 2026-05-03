import { useCallback, useEffect, useMemo, useState, type ClipboardEvent as ReactClipboardEvent } from 'react'
import { fetchEvents } from '../services/api/events'
import { objectPathForSlot, safeImageExt, siteMarketingPublicUrl, SITE_MARKETING_BUCKET } from '../lib/siteMarketing'
import type { SiteMarketingRecord } from '../lib/siteMarketing'
import type { EventRow } from '../types/event'
import { parseSiteMarketingRpc } from '../lib/siteMarketing'
import { sb, errMsg } from '../services/api/client'

const CORE_SLOTS = [
  { slot: 'icon', label: 'אייקון / לוגו', hint: 'מוצג בראש הנחיתה, בכרטיס אורח ובעמוד מסיבה.' },
  { slot: 'about', label: 'מי אנחנו', hint: 'תמונת אזור „חוויות שלא שוכחים”.' },
  { slot: 'hero', label: 'רקע Hero', hint: 'רקע החלק העליון של דף הנחיתה.' },
] as const
const PARTY_PHOTOS_BUCKET = 'party-photos'

type EventCoverRow = {
  id: string
  event_id: string
  storage_path: string
}

function DropUpload({
  disabled,
  onFile,
}: {
  disabled: boolean
  onFile: (file: File | null) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [pasteFocused, setPasteFocused] = useState(false)

  function firstImageFromClipboard(ev: ReactClipboardEvent<HTMLElement>): File | null {
    const items = ev.clipboardData?.items
    if (!items) return null
    for (const item of items) {
      if (item.kind !== 'file') continue
      if (!item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (file) return file
    }
    return null
  }

  const base =
    'mt-3 flex min-h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-3 py-4 text-sm transition'
  const mode = dragging
    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
    : 'border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-indigo-400 hover:bg-indigo-50/70'

  return (
    <label
      className={`${base} ${mode} ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0] ?? null
        onFile(file)
      }}
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          onFile(f ?? null)
        }}
      />
      <span>גררו תמונה לכאן או לחצו לבחירת קובץ</span>
      <textarea
        readOnly
        dir="ltr"
        value=""
        aria-label="Paste image here"
        placeholder="לחצו כאן ואז Ctrl+V / Cmd+V"
        className={`mt-3 w-full resize-none rounded-md border px-3 py-2 text-center text-xs outline-none transition ${
          pasteFocused
            ? 'border-indigo-500 bg-white text-indigo-700 ring-1 ring-indigo-500'
            : 'border-zinc-300 bg-white text-zinc-500'
        }`}
        rows={2}
        onFocus={() => setPasteFocused(true)}
        onBlur={() => setPasteFocused(false)}
        onPaste={(ev) => {
          const file = firstImageFromClipboard(ev)
          if (!file) return
          ev.preventDefault()
          onFile(file)
        }}
      />
    </label>
  )
}

export function SiteMarketingPage() {
  const [record, setRecord] = useState<SiteMarketingRecord | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [eventCovers, setEventCovers] = useState<Record<string, EventCoverRow>>({})
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busySlot, setBusySlot] = useState<string | null>(null)

  const loadEventCovers = useCallback(async (eventIds: string[]) => {
    if (eventIds.length === 0) {
      setEventCovers({})
      return
    }
    const { data, error } = await sb()
      .from('event_photos')
      .select('id,event_id,storage_path,sort_order,created_at')
      .in('event_id', eventIds)
      .eq('is_active', true)
      .order('event_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw new Error(errMsg(error))
    const out: Record<string, EventCoverRow> = {}
    for (const raw of data ?? []) {
      const row = raw as { id?: unknown; event_id?: unknown; storage_path?: unknown }
      const eventId = typeof row.event_id === 'string' ? row.event_id : ''
      const id = typeof row.id === 'string' ? row.id : ''
      const storagePath = typeof row.storage_path === 'string' ? row.storage_path : ''
      if (!eventId || !id || !storagePath) continue
      const isDedicatedCover = /\/cover\//.test(storagePath)
      if (!isDedicatedCover) continue
      if (!out[eventId]) out[eventId] = { id, event_id: eventId, storage_path: storagePath }
    }
    setEventCovers(out)
  }, [])

  const load = useCallback(async () => {
    setErr(null)
    try {
      const [{ data, error }, allEvents] = await Promise.all([
        sb().rpc('get_site_marketing_assets'),
        fetchEvents(),
      ])
      if (error) throw new Error(errMsg(error))
      setRecord(parseSiteMarketingRpc(data))
      setEvents(allEvents)
      await loadEventCovers(allEvents.map((e) => e.id))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בטעינה')
      setRecord({ icon: null, about: null, hero: null, gallery: {} })
      setEvents([])
      setEventCovers({})
    }
  }, [loadEventCovers])

  useEffect(() => {
    void load()
  }, [load])

  function pathForCoreSlot(slot: string): string | null {
    if (!record) return null
    if (slot === 'icon') return record.icon
    if (slot === 'about') return record.about
    if (slot === 'hero') return record.hero
    return null
  }

  async function onUpload(slot: string, file: File | null) {
    if (!file) return
    setBusySlot(slot)
    setErr(null)
    setInfo(null)
    try {
      const previousPath =
        slot.startsWith('gallery-') ? (record?.gallery[slot] ?? null) : pathForCoreSlot(slot)
      const path = objectPathForSlot(slot, file)
      const { error: upErr } = await sb().storage
        .from(SITE_MARKETING_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined })
      if (upErr) throw new Error(errMsg(upErr))
      const { error: rowErr } = await sb().from('site_marketing_assets').upsert(
        { slot, object_path: path },
        { onConflict: 'slot' },
      )
      if (rowErr) {
        await sb().storage.from(SITE_MARKETING_BUCKET).remove([path])
        throw new Error(errMsg(rowErr))
      }
      if (previousPath && previousPath !== path) {
        await sb().storage.from(SITE_MARKETING_BUCKET).remove([previousPath])
      }
      setInfo('העלאה נשמרה.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusySlot(null)
    }
  }

  async function onRemove(slot: string) {
    if (!window.confirm('למחוק את התמונה?')) return
    setBusySlot(slot)
    setErr(null)
    setInfo(null)
    try {
      const objectPath =
        slot.startsWith('gallery-') ? (record?.gallery[slot] ?? null) : pathForCoreSlot(slot)
      const { error: delErr } = await sb().from('site_marketing_assets').delete().eq('slot', slot)
      if (delErr) throw new Error(errMsg(delErr))
      if (objectPath) {
        await sb().storage.from(SITE_MARKETING_BUCKET).remove([objectPath])
      }
      setInfo('הוסר.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusySlot(null)
    }
  }

  const galleryItems = useMemo(() => {
    if (!record) return []
    return Object.entries(record.gallery)
      .filter(([slot, path]) => /^gallery-[0-9]{2}$/.test(slot) && Boolean(path))
      .sort((a, b) => Number.parseInt(a[0].slice(8), 10) - Number.parseInt(b[0].slice(8), 10))
  }, [record])

  function nextGallerySlot(): string | null {
    const used = new Set(Object.keys(record?.gallery ?? {}))
    for (let i = 1; i <= 99; i += 1) {
      const slot = `gallery-${String(i).padStart(2, '0')}`
      if (!used.has(slot)) return slot
    }
    return null
  }

  async function onAddGalleryPhoto(file: File | null) {
    if (!file) return
    const slot = nextGallerySlot()
    if (!slot) {
      setErr('הגעת למקסימום תמונות גלריה (99).')
      return
    }
    await onUpload(slot, file)
  }

  function eventCoverUrl(eventId: string): string | null {
    const row = eventCovers[eventId]
    if (!row) return null
    const { data } = sb().storage.from(PARTY_PHOTOS_BUCKET).getPublicUrl(row.storage_path)
    return data.publicUrl
  }

  async function onUploadEventCover(eventId: string, file: File | null) {
    if (!file) return
    const token = `event-cover:${eventId}`
    setBusySlot(token)
    setErr(null)
    setInfo(null)
    const prev = eventCovers[eventId]
    const path = `events/${eventId}/cover/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeImageExt(file)}`
    try {
      const { error: uploadError } = await sb()
        .storage.from(PARTY_PHOTOS_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined })
      if (uploadError) throw new Error(errMsg(uploadError))

      const { data: inserted, error: insertError } = await sb()
        .from('event_photos')
        .insert({
          event_id: eventId,
          storage_path: path,
          alt_text: 'event-cover',
          sort_order: -1000,
          is_active: true,
        })
        .select('id,event_id,storage_path')
        .single()
      if (insertError) {
        await sb().storage.from(PARTY_PHOTOS_BUCKET).remove([path])
        throw new Error(errMsg(insertError))
      }
      if (prev) {
        await sb().from('event_photos').delete().eq('id', prev.id)
        await sb().storage.from(PARTY_PHOTOS_BUCKET).remove([prev.storage_path])
      }
      setEventCovers((curr) => ({
        ...curr,
        [eventId]: inserted as EventCoverRow,
      }))
      setInfo('התמונה הייעודית למסיבה נשמרה.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בהעלאת תמונת מסיבה')
    } finally {
      setBusySlot(null)
    }
  }

  async function onRemoveEventCover(eventId: string) {
    const row = eventCovers[eventId]
    if (!row) return
    if (!window.confirm('למחוק את התמונה הייעודית למסיבה?')) return
    const token = `event-cover:${eventId}`
    setBusySlot(token)
    setErr(null)
    setInfo(null)
    try {
      const { error: deleteRowError } = await sb().from('event_photos').delete().eq('id', row.id)
      if (deleteRowError) throw new Error(errMsg(deleteRowError))
      await sb().storage.from(PARTY_PHOTOS_BUCKET).remove([row.storage_path])
      setEventCovers((curr) => {
        const next = { ...curr }
        delete next[eventId]
        return next
      })
      setInfo('התמונה הייעודית הוסרה.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה במחיקה')
    } finally {
      setBusySlot(null)
    }
  }

  useEffect(() => {
    function firstImageFromClipboard(ev: ClipboardEvent): File | null {
      const items = ev.clipboardData?.items
      if (!items) return null
      for (const item of items) {
        if (item.kind !== 'file') continue
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (file) return file
      }
      return null
    }

    function activeCoreSlot(): string | null {
      if (!record) return null
      if (!record.icon) return 'icon'
      if (!record.about) return 'about'
      if (!record.hero) return 'hero'
      return null
    }

    function onPaste(ev: ClipboardEvent) {
      if (busySlot !== null) return
      const file = firstImageFromClipboard(ev)
      if (!file) return
      ev.preventDefault()
      const preferredCoreSlot = activeCoreSlot()
      if (preferredCoreSlot) {
        void onUpload(preferredCoreSlot, file)
        return
      }
      void onAddGalleryPhoto(file)
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [busySlot, onAddGalleryPhoto, record])

  function Preview({ objectPath }: { objectPath: string | null }) {
    if (!objectPath) return <p className="muted small">אין תמונה</p>
    const url = siteMarketingPublicUrl(objectPath)
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
        <img src={url} alt="" className="max-h-40 w-full object-contain" decoding="async" />
        <p className="muted break-all px-2 py-1 text-[0.7rem]" dir="ltr">
          {objectPath}
        </p>
      </div>
    )
  }

  return (
    <div className="page guest-public-edit" dir="rtl">
      <header className="mb-6">
        <h2 className="sheet-section-title">ניהול תמונות האתר</h2>
        <p className="muted small">
          אחסון ב־Supabase · bucket <code dir="ltr">{SITE_MARKETING_BUCKET}</code> — יש להריץ מיגרציה בפרויקט לפני העלאה.
        </p>
        <p className="muted small mt-1">אפשר גם להדביק תמונה עם Ctrl+V (או Cmd+V במק).</p>
      </header>

      {err ? (
        <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
          {err}
        </p>
      ) : null}
      {info ? (
        <p className="muted small mb-4" role="status">
          {info}
        </p>
      ) : null}

      <div className="flex max-w-3xl flex-col gap-8">
        {CORE_SLOTS.map(({ slot, label, hint }) => (
          <section key={slot} className="rounded-xl border border-zinc-200 bg-white/95 px-4 py-4 shadow-sm">
            <h3 className="text-base font-semibold text-zinc-900">{label}</h3>
            <p className="muted mt-1 text-sm">{hint}</p>
            <Preview objectPath={pathForCoreSlot(slot)} />
            <DropUpload disabled={busySlot !== null} onFile={(f) => void onUpload(slot, f)} />
            {pathForCoreSlot(slot) ? (
              <button
                type="button"
                className="btn small secondary mt-2"
                disabled={busySlot !== null}
                onClick={() => void onRemove(slot)}
              >
                הסר
              </button>
            ) : null}
          </section>
        ))}

        <section className="rounded-xl border border-zinc-200 bg-white/95 px-4 py-4 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">תמונות לאתר</h3>
          <p className="muted mt-1 text-sm">כל התמונות הקיימות באתר. אפשר להוסיף חדשות או למחוק באישור.</p>
          <DropUpload disabled={busySlot !== null} onFile={(f) => void onAddGalleryPhoto(f)} />
          <ul className="mt-4 flex flex-col gap-4">
            {galleryItems.length === 0 ? (
              <li className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/90 px-3 py-4 text-sm text-zinc-600">
                עדיין אין תמונות. הוסיפו תמונה ראשונה.
              </li>
            ) : null}
            {galleryItems.map(([slot, path]) => (
              <li key={slot} className="rounded-lg border border-zinc-100 bg-zinc-50/90 px-3 py-3">
                <Preview objectPath={path} />
                <button
                  type="button"
                  className="btn small secondary mt-2"
                  disabled={busySlot !== null}
                  onClick={() => void onRemove(slot)}
                >
                  מחק
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white/95 px-4 py-4 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900">תמונה ייעודית לכל מסיבה</h3>
          <p className="muted mt-1 text-sm">העלאה מרוכזת מכאן בלבד — בלי להיכנס לניהול המסיבה.</p>
          <ul className="mt-4 flex flex-col gap-4">
            {events.length === 0 ? (
              <li className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/90 px-3 py-4 text-sm text-zinc-600">
                אין מסיבות להצגה כרגע.
              </li>
            ) : null}
            {events.map((event) => {
              const coverUrl = eventCoverUrl(event.id)
              const isBusy = busySlot === `event-cover:${event.id}`
              return (
                <li key={event.id} className="rounded-lg border border-zinc-100 bg-zinc-50/90 px-3 py-3">
                  <p className="text-sm font-semibold text-zinc-900">{event.name}</p>
                  <p className="muted text-xs" dir="ltr">
                    {event.id}
                  </p>
                  {coverUrl ? (
                    <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                      <img src={coverUrl} alt="" className="max-h-40 w-full object-cover" decoding="async" />
                    </div>
                  ) : (
                    <p className="muted small mt-2">אין תמונה ייעודית למסיבה זו.</p>
                  )}
                  <DropUpload disabled={busySlot !== null} onFile={(f) => void onUploadEventCover(event.id, f)} />
                  {coverUrl ? (
                    <button
                      type="button"
                      className="btn small secondary mt-2"
                      disabled={busySlot !== null || isBusy}
                      onClick={() => void onRemoveEventCover(event.id)}
                    >
                      מחק תמונה ייעודית
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
