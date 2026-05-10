type Props = {
  pasteText: string
  setPasteText: (v: string) => void
  pasteSubmitting: boolean
  listDisabled: boolean
  onPasteBulk: () => void | Promise<void>
}

export function GuestListPasteBulk({
  pasteText,
  setPasteText,
  pasteSubmitting,
  listDisabled,
  onPasteBulk,
}: Props) {
  return (
    <div className="paste-bulk">
      <label className="paste-bulk-label" htmlFor="guest-paste">
        הוספת רשימה
      </label>
      <p className="paste-bulk-hint" dir="rtl">
        בשורת ייבוא אין לכתוב «שולם» או «לא שולם» — צריך רק ארבעה חלקים:{' '}
        <strong>שם מלא</strong>, <strong>מספר טלפון</strong>, <strong>למי מיוחסת ההכנסה</strong> (שם קצר של
        שותף או המילה פייבוקס / סלקטור), <strong>סכום</strong>.
      </p>
      <p className="paste-bulk-hint" dir="rtl">
        הייבוא רץ בשרת. שורה זהה פעמיים ברשימה נחשבת לשני כרטיסים לאותה זהות (אותו צמד שם וטלפון).
      </p>
      <figure className="paste-bulk-sample-wrap">
        <figcaption className="paste-bulk-sample-cap">דוגמאות</figcaption>
        <pre className="paste-bulk-sample" dir="rtl">
          {`דוד כהן 972-543966264 דוד 50
רחל לוי 972-523380978 פייבוקס 60
יוסי 972-528123456 סלקטור 40`}
        </pre>
      </figure>
      <textarea
        id="guest-paste"
        className="input paste-bulk-text"
        rows={5}
        dir="rtl"
        placeholder="הדבקה…"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        disabled={pasteSubmitting || listDisabled}
        aria-label="הדבקת רשימת אורחים"
      />
      <button
        type="button"
        className="btn btn-mob btn-mob--primary guest-add-mob__btn guest-add-mob__btn--primary"
        disabled={pasteSubmitting || !pasteText.trim() || listDisabled}
        onClick={() => void onPasteBulk()}
      >
        {pasteSubmitting ? 'מייבא…' : 'ייבוא מהרשימה'}
      </button>
    </div>
  )
}
