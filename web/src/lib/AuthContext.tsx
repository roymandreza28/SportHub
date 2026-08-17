import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, clearStoredToken, getStoredToken, setStoredToken } from './api'

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
    try {
      const { data } = await api.get<User>('/api/user')
      if (authAction.current === gen) setUser(data)
    } catch {
      if (authAction.current === gen) setUser(null)
      clearStoredToken()
    } finally {
      setIsLoading(false)
    }
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
