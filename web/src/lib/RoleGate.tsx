import type { ReactNode } from 'react'
import { useAuth, type Role } from './AuthContext'

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth()

  if (!hasRole(...roles)) return null

  return <>{children}</>
}
