import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { api, clearStoredToken, getStoredToken, setStoredToken } from './api'

// Retry delays for a transient failure fetching /api/user on startup (network
// hiccup, or Render's free-tier API waking from sleep, which can take 30-60s).
// Spans ~31s of retries so a cold start doesn't get misread as an invalid
// session — see fetchUser() below for why only a real 401/403 clears the token.
const AUTH_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]

export type Role =
  | 'admin'
  | 'organizer'
  | 'venue_organizer'
  | 'livestream_organizer'
  | 'venue_facilitator'
  | 'player'
  | 'coach'
export type VerificationStatus = 'pending' | 'verified' | 'rejected'

type User = {
  id: number
  name: string
  email: string
  roles: Role[]
  avatar_url: string | null
  verification_status: VerificationStatus
}

type LoginResponse = User & { token: string }

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (formData: FormData) => Promise<void>
  logout: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Bumped by every explicit login/register/logout so a slower-resolving
  // background fetchUser() can detect it's stale and not clobber a result
  // that arrived after it started.
  const authAction = useRef(0)
  // StrictMode double-invokes effects with no cleanup; without this guard the
  // one-time initial auth check would fire twice as two independent requests.
  const hasInitialized = useRef(false)

  async function fetchUser() {
    const gen = authAction.current
    // No stored token means there's nothing to authenticate with — skip the
    // request entirely rather than making a call that can only 401.
    if (!getStoredToken()) {
      setIsLoading(false)
      return
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const { data } = await api.get<User>('/api/user')
        if (authAction.current === gen) setUser(data)
        break
      } catch (error) {
        // A newer login/register/logout already ran while this request was
        // in flight — this attempt's result (success or failure) is stale.
        if (authAction.current !== gen) return

        const status = isAxiosError(error) ? error.response?.status : undefined
        // Only a genuine rejection from the server (invalid/expired token,
        // or a deactivated account) means the session is actually over.
        // Anything else — a network error, a timeout, a 5xx — is transient
        // (most commonly Render's free-tier API waking up from sleep) and
        // must never silently sign the user out just because one request
        // couldn't reach the server; the token they logged in with is still
        // good, so retry instead of clearing it.
        if (status === 401 || status === 403) {
          setUser(null)
          clearStoredToken()
          break
        }

        if (attempt >= AUTH_RETRY_DELAYS_MS.length) {
          // Stop showing a loading state, but deliberately leave the token
          // in storage — the user never clicked logout, the API was just
          // unreachable. Reloading the page (with the still-valid token)
          // can restore the session without asking for a password again.
          break
        }

        await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAYS_MS[attempt]))
      }
    }

    if (authAction.current === gen) setIsLoading(false)
  }

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true
    fetchUser()
  }, [])

  async function login(email: string, password: string) {
    authAction.current++
    const { data } = await api.post<LoginResponse>('/api/login', { email, password })
    setStoredToken(data.token)
    setUser(data)
  }

  async function register(formData: FormData) {
    authAction.current++
    const { data } = await api.post<LoginResponse>('/api/register', formData)
    setStoredToken(data.token)
    setUser(data)
  }

  async function logout() {
    authAction.current++
    try {
      await api.post('/api/logout')
    } finally {
      clearStoredToken()
      setUser(null)
    }
  }

  function hasRole(...roles: Role[]) {
    return roles.some((role) => user?.roles.includes(role))
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, hasRole, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
