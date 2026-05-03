/** קבצים מ־`public/` — תואם ‎`import.meta.env.BASE_URL`‎ (Vite) */
export function publicAssetUrl(path: string): string {
  const p = path.startsWith('/') ? path.slice(1) : path
  const base = import.meta.env.BASE_URL || '/'
  if (base === '/') return `/${p}`
  return `${base.replace(/\/?$/, '/')}${p}`
}

/** נכסים סטטיים תחת ‎`public/images/‎` — נתיב מוחלט מהשורש (עם ‎`BASE_URL`‎ אם מוגדר) */
export function publicImageBrand(file: string): string {
  const f = file.replace(/^\/+/, '')
  return publicAssetUrl(`/images/brand/${f}`)
}

/**
 * כש־URL נכשל, מסתירים את התמונה כדי שה־gradient של המעטפת יישאר נקי בלי אייקון תמונה שבורה.
 */
export function handlePublicImageError(ev: { currentTarget: HTMLImageElement }): void {
  const el = ev.currentTarget
  if (el.dataset.publicImgFallback === '1') return
  el.dataset.publicImgFallback = '1'
  el.onerror = null
  el.style.opacity = '0'
}

/** כשהקישור / הקובץ לא נטען — מעלימים את ה־img כדי שישלפו הרקעים בלי „תמונת דמה” מטעה */
export function hideBrokenPublicImage(ev: { currentTarget: HTMLImageElement }): void {
  const el = ev.currentTarget
  if (el.dataset.publicImgHide === '1') return
  el.dataset.publicImgHide = '1'
  el.onerror = null
  el.style.opacity = '0'
}

/** כש־img נטען בהצלחה אחרי ניסיון כושל קודם, מחזירים אותו לתצוגה רגילה. */
export function resetPublicImageVisibility(ev: { currentTarget: HTMLImageElement }): void {
  const el = ev.currentTarget
  if (el.dataset.publicImgHide === '1') {
    delete el.dataset.publicImgHide
    el.style.opacity = '1'
  }
  if (el.dataset.publicImgFallback === '1') {
    delete el.dataset.publicImgFallback
    el.style.opacity = '1'
  }
}
