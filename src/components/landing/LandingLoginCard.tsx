import type { FormEvent } from 'react'
import { SITE_PARTY_BRAND } from '../../config/sitePartyBrand'

export type LandingLoginMode = 'login' | 'signup'

export type LandingLoginCardProps = {
  mode: LandingLoginMode
  setMode: (m: LandingLoginMode) => void
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  error: string | null
  info: string | null
  submitting: boolean
  onLogin: (e: FormEvent) => void | Promise<void>
  onSignup: (e: FormEvent) => void | Promise<void>
}

export function LandingLoginCard({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  error,
  info,
  submitting,
  onLogin,
  onSignup,
}: LandingLoginCardProps) {
  return (
    <div
      id="landing-login"
      className="relative z-20 mx-auto w-full max-w-md px-1 sm:px-2"
    >
      <div className="rounded-[1.5rem] border border-white/[0.22] bg-white/[0.11] p-5 shadow-[0_12px_48px_-16px_rgba(139,92,246,0.35),0_24px_70px_-28px_rgba(15,23,42,0.75)] backdrop-blur-2xl sm:rounded-[1.65rem] sm:p-7">
        <div className="text-center">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
            ניהול
          </p>
          <h2 className="font-sans mt-1 text-2xl font-bold text-white sm:text-3xl">
            {SITE_PARTY_BRAND.venueLine}
          </h2>
          <p className="mx-auto mt-3 max-w-sm font-sans text-sm leading-relaxed text-white/78">
            {SITE_PARTY_BRAND.landingLoginTagline}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-black/25 p-1 shadow-inner shadow-black/20">
          <button
            type="button"
            className={`touch-manipulation min-h-[46px] rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              mode === 'login'
                ? 'bg-white text-zinc-900 shadow-md'
                : 'text-white/75 hover:text-white'
            }`}
            onClick={() => {
              setMode('login')
            }}
          >
            התחברות
          </button>
          <button
            type="button"
            className={`touch-manipulation min-h-[46px] rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              mode === 'signup'
                ? 'bg-white text-zinc-900 shadow-md'
                : 'text-white/75 hover:text-white'
            }`}
            onClick={() => {
              setMode('signup')
            }}
          >
            הרשמה
          </button>
        </div>

        {mode === 'login' ? (
          <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void onLogin(e)}>
            {error ? (
              <p className="rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-center text-sm text-red-100">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-50">
                {info}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5 text-right">
              <label htmlFor="landing-auth-email" className="text-xs font-medium text-white/65">
                אימייל
              </label>
              <input
                id="landing-auth-email"
                autoComplete="username"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[50px] w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 font-sans text-base text-white outline-none ring-white/30 placeholder:text-white/35 focus:border-white/45 focus:ring-2"
                placeholder="you@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5 text-right">
              <label htmlFor="landing-auth-pw" className="text-xs font-medium text-white/65">
                סיסמה
              </label>
              <input
                id="landing-auth-pw"
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[50px] w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 font-sans text-base text-white outline-none placeholder:text-white/35 focus:border-white/45 focus:ring-2 focus:ring-white/30"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="touch-manipulation mt-2 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-white font-sans text-base font-bold text-zinc-900 shadow-[0_6px_24px_-6px_rgba(139,92,246,0.45)] ring-1 ring-white/80 transition hover:bg-zinc-100 hover:shadow-[0_8px_28px_-6px_rgba(167,139,250,0.5)] active:scale-[0.99] disabled:opacity-60"
            >
              {submitting ? 'מתחבר…' : 'כניסה למערכת'}
            </button>
          </form>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void onSignup(e)}>
            {error ? (
              <p className="rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-center text-sm text-red-100">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-50">
                {info}
              </p>
            ) : null}
            <p className="text-center text-xs leading-relaxed text-white/58">
              אחרי הרשמה תקבלו גישה רק אם מנהל המערכת יעניק לכם הרשאת admin בפרופיל.
            </p>
            <div className="flex flex-col gap-1.5 text-right">
              <label htmlFor="landing-reg-email" className="text-xs font-medium text-white/65">
                אימייל
              </label>
              <input
                id="landing-reg-email"
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[50px] w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 font-sans text-base text-white outline-none placeholder:text-white/35 focus:border-white/45 focus:ring-2 focus:ring-white/30"
              />
            </div>
            <div className="flex flex-col gap-1.5 text-right">
              <label htmlFor="landing-reg-pw" className="text-xs font-medium text-white/65">
                סיסמה
              </label>
              <input
                id="landing-reg-pw"
                autoComplete="new-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[50px] w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 font-sans text-base text-white outline-none placeholder:text-white/35 focus:border-white/45 focus:ring-2 focus:ring-white/30"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="touch-manipulation mt-2 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-gradient-to-l from-indigo-500 to-violet-600 font-sans text-base font-bold text-white shadow-[0_8px_28px_-8px_rgba(139,92,246,0.55),0_4px_16px_-6px_rgba(99,102,241,0.45)] transition hover:brightness-110 hover:shadow-[0_12px_36px_-10px_rgba(167,139,250,0.45)] active:scale-[0.99] disabled:opacity-60"
            >
              {submitting ? 'נרשם…' : 'צור חשבון'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
