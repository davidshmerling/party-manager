/** מסך כשחסרים VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — ללא זריקת שגיאה מקבצים */
export function SupabaseConfigMissing() {
  return (
    <div className="login-page" dir="rtl" lang="he">
      <div className="login-box" style={{ maxWidth: '32rem' }}>
        <h1 className="login-title">הגדרת Supabase חסרה</h1>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          כדי להריץ את האפליקציה מקומית, צריך להגדיר את מפתחות Supabase בשורש הפרויקט.
        </p>
        <ol style={{ margin: '0 1.25rem 1rem 0', padding: 0, lineHeight: 1.6 }}>
          <li>העתיקו את הקובץ <code style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>.env.example</code> ל־<code style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>.env</code></li>
          <li>
            מלאו את הערכים מלוח הבקרה של Supabase (הגדרות → API):{' '}
            <code style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>VITE_SUPABASE_URL</code>
            {' ו־'}
            <code style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>VITE_SUPABASE_ANON_KEY</code>
          </li>
          <li>אתחלו מחדש את שרת הפיתוח (<code style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>npm run dev</code>) אחרי שינוי ב־<code style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>.env</code></li>
        </ol>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          המפתח האנונימי שונה מהמפתח הפרטי (service_role) — משתמשים רק ב־anon בצד הדפדפן.
        </p>
      </div>
    </div>
  )
}
