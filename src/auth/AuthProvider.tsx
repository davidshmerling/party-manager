import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User, SupabaseClient } from '@supabase/supabase-js'
import { logClientAuditEvent } from '../services/loggingApi'

export type Profile = {
  id: string
  email: string | null
  display_name: string | null
  role: string
}

export type SignInResult = {
  error: string | null
  isAdmin: boolean
  isScanner: boolean
  isMember: boolean
}

export type SignUpResult = {
  error: string | null
  /** נוצר session מיד (ללא אישור מייל) */
  isAdmin: boolean
  isScanner: boolean
  isMember: boolean
  /** Supabase דורש לעיתים אישור מייל — אין session עד לאישור */
  needsEmailConfirmation: boolean
}

type AuthContextValue = {
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  /**
   * שותף או אדמין (רמה) — ניהול אורחים/אירועים/סלקטורים; ללא כספים/ניהול שותפים אם אדמין בלבד
   * (השוואה: partner | admin, לא scanner)
   */
  isAdmin: boolean
  /** ‎profile.role === 'partner' — כספים, לוגים, ניהול שותפים */
  isPartner: boolean
  /** profiles.role === 'scanner' — סריקה/סטט לפי event_staff בלבד */
  isScanner: boolean
  /** partner | admin | scanner */
  isStaff: boolean
  /** משתמש רגיל — דף מסיבות ציבורי בלבד */
  isMember: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signUp: (email: string, password: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfileFull(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return data as Profile | null
}

export function AuthProvider({
  supabase,
  children,
}: {
  supabase: SupabaseClient
  children: ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const applySession = useCallback(
    async (sess: Session | null) => {
      setSession(sess)
      setUser(sess?.user ?? null)
      if (!sess?.user) {
        setProfile(null)
        return { isAdmin: false, isScanner: false, isMember: false }
      }
      const p = await fetchProfileFull(supabase, sess.user.id)
      setProfile(p)
      const role = p?.role
      const staffNav = role === 'partner' || role === 'admin'
      const isScannerRole = role === 'scanner'
      return {
        isAdmin: staffNav,
        isScanner: isScannerRole,
        isMember: role === 'member',
      }
    },
    [supabase],
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      await applySession(data.session)
      setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      void (async () => {
        if (cancelled) return
        await applySession(sess)
        setLoading(false)
      })()
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [applySession])

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) return { error: error.message, isAdmin: false, isScanner: false, isMember: false }
      if (!data.session)
        return { error: 'אין session', isAdmin: false, isScanner: false, isMember: false }
      const { isAdmin, isScanner, isMember } = await applySession(data.session)
      if (isAdmin || isScanner) {
        await logClientAuditEvent('auth.sign_in', {
          email: email.trim(),
          user_id: data.session.user.id,
          is_admin_nav: isAdmin,
          is_scanner: isScanner,
          is_member: isMember,
        })
      }
      return { error: null, isAdmin, isScanner, isMember }
    },
    [applySession],
  )

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (error) {
        return {
          error: error.message,
          isAdmin: false,
          isScanner: false,
          isMember: false,
          needsEmailConfirmation: false,
        }
      }
      if (!data.session) {
        return {
          error: null,
          isAdmin: false,
          isScanner: false,
          isMember: false,
          needsEmailConfirmation: true,
        }
      }
      const { isAdmin, isScanner, isMember } = await applySession(data.session)
      if (isAdmin || isScanner) {
        await logClientAuditEvent('auth.sign_up', {
          email: email.trim(),
          user_id: data.session.user.id,
          is_admin_nav: isAdmin,
          is_scanner: isScanner,
          is_member: isMember,
        })
      }
      return {
        error: null,
        isAdmin,
        isScanner,
        isMember,
        needsEmailConfirmation: false,
      }
    },
    [applySession],
  )

  const signOut = useCallback(async () => {
    const role = profile?.role
    if (role === 'partner' || role === 'admin' || role === 'scanner') {
      await logClientAuditEvent('auth.sign_out', {
        email: profile?.email ?? user?.email ?? null,
        user_id: user?.id ?? null,
        role,
      })
    }
    await supabase.auth.signOut()
    setProfile(null)
    setUser(null)
    setSession(null)
  }, [supabase, profile?.email, profile?.role, user?.email, user?.id])

  const isAdmin = Boolean(session && (profile?.role === 'partner' || profile?.role === 'admin'))
  const isPartner = Boolean(session && profile?.role === 'partner')
  const isScanner = Boolean(session && profile?.role === 'scanner')
  const isStaff = Boolean(
    session &&
      profile &&
      (profile.role === 'partner' ||
        profile.role === 'admin' ||
        profile.role === 'scanner'),
  )
  const isMember = Boolean(session && profile?.role === 'member')

  const value = useMemo(
    () => ({
      loading,
      session,
      user,
      profile,
      isAdmin,
      isPartner,
      isScanner,
      isStaff,
      isMember,
      signIn,
      signUp,
      signOut,
    }),
    [
      loading,
      session,
      user,
      profile,
      isAdmin,
      isPartner,
      isScanner,
      isStaff,
      isMember,
      signIn,
      signUp,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth חייב להיות בתוך AuthProvider')
  return ctx
}
