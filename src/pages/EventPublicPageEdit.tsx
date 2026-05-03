import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { datetimeLocalToIso, isoToDatetimeLocalValue } from '../lib/publicPartyDatetime'
import {
  deleteEventPhoto,
  eventPhotoPublicUrl,
  fetchEventPhotos,
  updateEventPhoto,
  uploadEventPhoto,
} from '../services/api/eventPhotos'
import {
  fetchAdminPublicPartyPage,
  upsertAdminPublicPartyPage,
} from '../services/api/publicPartyPages'
import { UUID_RE } from '../services/api/client'
import type { EventPhotoRow } from '../types/eventPhoto'
import type { AdminPublicPartyRow, PublicPageStatus } from '../types/publicParty'
import { STAFF_HOME_PATH } from '../constants/appRoutes'

export function EventPublicPageEdit() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [publicTitle, setPublicTitle] = useState('')
  const [publicDescription, setPublicDescription] = useState('')
  const [publicDateLocal, setPublicDateLocal] = useState('')
  const [publicLocation, setPublicLocation] = useState('')
  const [publicImageUrl, setPublicImageUrl] = useState('')
  const [payboxUrl, setPayboxUrl] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [publicStatus, setPublicStatus] = useState<PublicPageStatus>('draft')
  const [whatIncluded, setWhatIncluded] = useState('')
  const [notes, setNotes] = useState('')
  const [publicDisplayUntilLocal, setPublicDisplayUntilLocal] = useState('')
  const [eventName, setEventName] = useState<string | null>(null)
  const [photos, setPhotos] = useState<EventPhotoRow[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoActionId, setPhotoActionId] = useState<string | null>(null)
  const [newPhotoSortOrder, setNewPhotoSortOrder] = useState(0)
  const [newPhotoAltText, setNewPhotoAltText] = useState('')

  async function refreshPhotos(): Promise<void> {
    if (!UUID_RE.test(eventId)) return
    const list = await fetchEventPhotos(eventId)
    setPhotos(list)
  }

  function applyRow(row: AdminPublicPartyRow) {
    setPublicTitle(row.public_title ?? '')
    setPublicDescription(row.public_description ?? '')
    setPublicDateLocal(isoToDatetimeLocalValue(row.public_date))
    setPublicLocation(row.public_location ?? '')
    setPublicImageUrl(row.public_image_url ?? '')
    setPayboxUrl(row.paybox_url ?? '')
    setIsPublic(Boolean(row.is_public))
    setPublicStatus(row.public_status ?? 'draft')
    setWhatIncluded(row.public_what_included ?? '')
    setNotes(row.public_notes ?? '')
    setPublicDisplayUntilLocal(isoToDatetimeLocalValue(row.public_display_until))
    setEventName(row.event_name ?? null)
  }

  function buildBody(): Parameters<typeof upsertAdminPublicPartyPage>[1] {
    return {
      public_title: publicTitle.trim() || null,
      public_description: publicDescription.trim() || null,
      public_date: datetimeLocalToIso(publicDateLocal),
      public_location: publicLocation.trim() || null,
      public_image_url: publicImageUrl.trim() || null,
      paybox_url: payboxUrl.trim() || null,
      is_public: isPublic,
      public_status: publicStatus,
      public_what_included: whatIncluded.trim() || null,
      public_notes: notes.trim() || null,
      public_display_until: datetimeLocalToIso(publicDisplayUntilLocal),
    }
  }

  useEffect(() => {
    if (!UUID_RE.test(eventId)) {
      navigate(STAFF_HOME_PATH, { replace: true })
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      setErr(null)
      try {
        const [row, list] = await Promise.all([
          fetchAdminPublicPartyPage(eventId),
          fetchEventPhotos(eventId),
        ])
        if (cancelled) return
        setPhotos(list)
        if (row) applyRow(row)
        else setErr('אירוע לא נמצא')
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'שגיאה בטעינה')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eventId, navigate])

  async function save(next?: Partial<{ status: PublicPageStatus; isPub: boolean }>) {
    if (!UUID_RE.test(eventId)) return
    setSaving(true)
    setErr(null)
    setInfo(null)
    try {
      const body = buildBody()
      if (next?.status !== undefined) body.public_status = next.status
      if (next?.isPub !== undefined) body.is_public = next.isPub
      const row = await upsertAdminPublicPartyPage(eventId, body)
      if (row) applyRow(row)
      setInfo('נשמר.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    await save({ status: 'published', isPub: true })
  }

  async function toDraft() {
    await save({ status: 'draft', isPub: false })
  }

  function preview() {
    window.open(`/parties/${eventId}`, '_blank', 'noopener,noreferrer')
  }

  async function onUploadPhoto(file: File | null) {
    if (!file || !UUID_RE.test(eventId)) return
    setUploadingPhoto(true)
    setErr(null)
    setInfo(null)
    try {
      await uploadEventPhoto(eventId, file, {
        sortOrder: newPhotoSortOrder,
        altText: newPhotoAltText,
      })
      await refreshPhotos()
      setNewPhotoAltText('')
      setInfo('התמונה הועלתה ונשמרה.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בהעלאת התמונה')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function savePhotoMeta(photo: EventPhotoRow, patch: Partial<Pick<EventPhotoRow, 'alt_text' | 'sort_order' | 'is_active'>>) {
    setPhotoActionId(photo.id)
    setErr(null)
    setInfo(null)
    try {
      await updateEventPhoto(photo.id, patch)
      await refreshPhotos()
      setInfo('תמונת האירוע עודכנה.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה בעדכון תמונה')
    } finally {
      setPhotoActionId(null)
    }
  }

  async function removePhoto(photo: EventPhotoRow) {
    if (!window.confirm('למחוק את התמונה מהאירוע ומה־Storage?')) return
    setPhotoActionId(photo.id)
    setErr(null)
    setInfo(null)
    try {
      await deleteEventPhoto(photo)
      await refreshPhotos()
      setInfo('התמונה נמחקה.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה במחיקה')
    } finally {
      setPhotoActionId(null)
    }
  }

  if (!UUID_RE.test(eventId)) return null

  if (loading) {
    return (
      <div className="page">
        <p className="muted">טוען עמוד ציבורי…</p>
      </div>
    )
  }

  const inputClass =
    'mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="page guest-public-edit" dir="rtl">
      <header className="mb-6">
        <h2 className="sheet-section-title">עריכת עמוד ציבורי</h2>
        {eventName ? <p className="muted small">{eventName}</p> : null}
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

      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">כותרת ציבורית</span>
          <input
            type="text"
            className={inputClass}
            value={publicTitle}
            onChange={(e) => setPublicTitle(e.target.value)}
            placeholder="ברירת מחדל: שם האירוע במערכת"
            autoComplete="off"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">תיאור המסיבה</span>
          <textarea className={`${inputClass} min-h-[120px]`} value={publicDescription} onChange={(e) => setPublicDescription(e.target.value)} rows={5} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">תאריך ושעה להצגה</span>
          <input type="datetime-local" className={inputClass} value={publicDateLocal} onChange={(e) => setPublicDateLocal(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">הצג באתר הציבורי עד</span>
          <input
            type="datetime-local"
            className={inputClass}
            value={publicDisplayUntilLocal}
            onChange={(e) => setPublicDisplayUntilLocal(e.target.value)}
          />
          <span className="text-xs text-zinc-500">
            ריק = ללא הגבלה. אחרי התאריך והשעה העמוד יוסר מהרשימה ומעמוד הפרטים (מותנה גם בפרסום ובציבוריות).
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">מיקום להצגה</span>
          <input type="text" className={inputClass} value={publicLocation} onChange={(e) => setPublicLocation(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">כתובת תמונת קאבר (URL)</span>
          <input type="url" className={inputClass} value={publicImageUrl} onChange={(e) => setPublicImageUrl(e.target.value)} placeholder="https://..." />
          <span className="text-xs text-zinc-500">
            אופציונלי בלבד. אם העלית תמונות אירוע ב־Supabase (למטה), הן יקבלו עדיפות.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">קישור PayBox</span>
          <input type="url" className={inputClass} value={payboxUrl} onChange={(e) => setPayboxUrl(e.target.value)} placeholder="https://..." />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">מה כלול</span>
          <textarea className={`${inputClass} min-h-[96px]`} value={whatIncluded} onChange={(e) => setWhatIncluded(e.target.value)} rows={4} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">הערות חשובות</span>
          <textarea className={`${inputClass} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        <label className="flex items-start gap-2 text-sm leading-snug">
          <input type="checkbox" className="mt-1" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <span>העמוד מסומן כציבורי (יוצג ברשימה רק עם סטטוס &quot;מפורסם&quot;)</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">סטטוס</span>
          <select className={inputClass} value={publicStatus} onChange={(e) => setPublicStatus(e.target.value as PublicPageStatus)}>
            <option value="draft">טיוטה</option>
            <option value="published">מפורסם</option>
            <option value="closed">סגור</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            disabled={saving}
          >
            שמור
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            disabled={saving}
            onClick={() => preview()}
          >
            צפה בעמוד
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            disabled={saving}
            onClick={() => void publish()}
          >
            פרסם
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            disabled={saving}
            onClick={() => void toDraft()}
          >
            העבר לטיוטה
          </button>
        </div>
      </form>

      <section className="mt-10 max-w-4xl rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h3 className="text-lg font-semibold text-zinc-900">ניהול תמונות אירוע (Supabase Storage)</h3>
        <p className="mt-1 text-sm text-zinc-600">
          העלאה ל־bucket <code>party-photos</code>, מסלול: <code>events/{eventId}/timestamp-filename.ext</code>
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Sort Order</span>
            <input
              type="number"
              className={inputClass}
              value={newPhotoSortOrder}
              onChange={(e) => setNewPhotoSortOrder(Number(e.target.value) || 0)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Alt Text (אופציונלי)</span>
            <input
              type="text"
              className={inputClass}
              value={newPhotoAltText}
              onChange={(e) => setNewPhotoAltText(e.target.value)}
            />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium">Upload Photo</span>
          <input
            type="file"
            accept="image/*"
            className="block w-full text-sm text-zinc-700 file:ml-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-500"
            disabled={uploadingPhoto}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              void onUploadPhoto(file)
              e.currentTarget.value = ''
            }}
          />
        </label>

        {photos.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
            אין תמונות פעילות עדיין. בעמוד הציבורי יוצג fallback גרדיאנט בלי תמונה שבורה.
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {photos.map((photo) => {
              const disabled = photoActionId === photo.id
              return (
                <li key={photo.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-[140px,1fr]">
                    <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-indigo-950 via-violet-900 to-zinc-900">
                      <img
                        src={eventPhotoPublicUrl(photo.storage_path)}
                        alt={photo.alt_text ?? ''}
                        className="h-24 w-full object-cover"
                        onError={(ev) => {
                          ev.currentTarget.style.opacity = '0'
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="truncate text-xs text-zinc-600">{photo.storage_path}</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="flex flex-col gap-1 text-sm">
                          <span>Sort</span>
                          <input
                            type="number"
                            className={inputClass}
                            value={photo.sort_order}
                            onChange={(e) =>
                              setPhotos((prev) =>
                                prev.map((item) =>
                                  item.id === photo.id
                                    ? { ...item, sort_order: Number(e.target.value) || 0 }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                          <span>Alt Text</span>
                          <input
                            type="text"
                            className={inputClass}
                            value={photo.alt_text ?? ''}
                            onChange={(e) =>
                              setPhotos((prev) =>
                                prev.map((item) =>
                                  item.id === photo.id
                                    ? { ...item, alt_text: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={photo.is_active}
                          onChange={(e) =>
                            setPhotos((prev) =>
                              prev.map((item) =>
                                item.id === photo.id
                                  ? { ...item, is_active: e.target.checked }
                                  : item,
                              ),
                            )
                          }
                        />
                        פעילה להצגה באתר
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                          disabled={disabled}
                          onClick={() =>
                            void savePhotoMeta(photo, {
                              sort_order: photo.sort_order,
                              alt_text: photo.alt_text,
                              is_active: photo.is_active,
                            })
                          }
                        >
                          שמור תמונה
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                          disabled={disabled}
                          onClick={() => void removePhoto(photo)}
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="muted small mt-8">
        קישור ציבורי:{' '}
        <Link to={`/parties/${eventId}`} target="_blank" rel="noreferrer">
          /parties/{eventId.slice(0, 8)}…
        </Link>
      </p>
    </div>
  )
}
