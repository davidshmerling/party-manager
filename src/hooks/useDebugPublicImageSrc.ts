import { useEffect, useRef } from 'react'

/**
 * דיבאג בלבד (DEV): מדפיס את ה־URL הסופי של תמונה — מתאים לבדיקת Network / נתיבים ב־Vercel.
 */
export function useDebugPublicImageSrc(context: string, src: string | null | undefined): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (src == null || src === '') return
    console.debug(`[qr-party img] ${context}`, src)
  }, [context, src])
}

/**
 * רשימת כתובות (למשל קרוסלת hero) — לוג אחד לכל אינדקס; משווה לפי תוכן כדי לא להציף כשהמערך משתנה לפי רפרנס.
 */
export function useDebugPublicImageSrcList(context: string, urls: readonly string[]): void {
  const prev = useRef<string>('')
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const key = urls.join('\0')
    if (key === prev.current) return
    prev.current = key
    urls.forEach((u, i) => {
      if (u) console.debug(`[qr-party img] ${context}[${i}]`, u)
    })
  }, [context, urls])
}
