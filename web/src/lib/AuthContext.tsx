import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ensureCsrfCookie } from './api'

type User = {
  id: number
  name: string
  email: string
}

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, passwordConfirmation: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function fetchUser() {
    try {
      const { data } = await api.get<User>('/api/user')
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()
  }, [])

  async function login(email: string, password: string) {
    await ensureCsrfCookie()
    const { data } = await api.post<User>('/api/login', { email, password })
    setUser(data)
  }

  async function register(name: string, email: string, password: string, passwordConfirmation: string) {
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
    await api.post('/api/logout')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
