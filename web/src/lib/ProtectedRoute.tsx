import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth, type Role } from './AuthContext'

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, isLoading, hasRole } = useAuth()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  if (roles && !hasRole(...roles)) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
