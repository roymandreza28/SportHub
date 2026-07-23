import { Navigate } from 'react-router'
import { useAuth } from '../lib/AuthContext'
import { primaryDashboardPath } from '../lib/roles'

// No more role picker here — a user goes straight to their role's dashboard.
// This route still exists as a landing pad: login/register navigate here,
// and ProtectedRoute sends role-mismatched visits here too, so it just
// works out which real dashboard that resolves to and forwards immediately.
export function DashboardPage() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={primaryDashboardPath(user.roles)} replace />
}
