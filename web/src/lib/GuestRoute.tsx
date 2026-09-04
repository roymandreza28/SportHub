import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from './AuthContext'
import { LoadingScreen } from '../components/layout/LoadingScreen'

// Wraps /login and /register — an already-authenticated visitor (most often
// via the browser Back button after logging in, since the token and user
// state are untouched by client-side navigation) gets sent straight back to
// their dashboard instead of being shown a bare login form, which would look
// exactly like they'd been signed out even though their session is still valid.
export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (user) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
