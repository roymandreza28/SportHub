import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ensureCsrfCookie } from './api'

export type Role = 'admin' | 'organizer' | 'venue_facilitator' | 'player' | 'coach'

type User = {
  id: number
  name: string
  email: string
  roles: Role[]
}

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, passwordConfirmation: string) => Promise<void>
  logout: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
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
    try {
      const { data } = await api.get<User>('/api/user')
      if (authAction.current === gen) setUser(data)
    } catch {
      if (authAction.current === gen) setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true
    // Establish the session/CSRF cookie before any other request touches the
    // API. Firing fetchUser() concurrently with a later login/register call's
    // own ensureCsrfCookie() lets two requests race to create independent
    // sessions — whichever Set-Cookie the browser applies last silently wins,
    // which can leave the XSRF token mismatched with the active session
    // (419). Sequencing this first guarantees a single session for the page.
    ensureCsrfCookie().finally(fetchUser)
  }, [])

  async function login(email: string, password: string) {
    authAction.current++
    await ensureCsrfCookie()
    const { data } = await api.post<User>('/api/login', { email, password })
    setUser(data)
  }

  async function register(name: string, email: string, password: string, passwordConfirmation: string) {
    authAction.current++
    await ensureCsrfCookie()
    const { data } = await api.post<User>('/api/register', {
      name,
      email,
      password,
      password_confirmation: passwordConfirmation,
    })
    setUser(data)
  }

  async function logout() {
    authAction.current++
    await api.post('/api/logout')
    setUser(null)
  }

  function hasRole(...roles: Role[]) {
    return roles.some((role) => user?.roles.includes(role))
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
