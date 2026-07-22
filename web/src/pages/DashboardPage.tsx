import { Link, useNavigate } from 'react-router'
import { useAuth } from '../lib/AuthContext'
import { RoleGate } from '../lib/RoleGate'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p>
        Logged in as <strong>{user?.name}</strong> ({user?.email})
      </p>
      <p className="text-sm text-gray-600">Roles: {user?.roles.join(', ') || 'none'}</p>

      <RoleGate roles={['admin']}>
        <Link to="/admin" className="rounded bg-amber-100 p-2 text-sm text-amber-900">
          Go to Admin panel
        </Link>
      </RoleGate>

      <RoleGate roles={['venue_facilitator', 'admin']}>
        <Link to="/facilitator" className="rounded bg-sky-100 p-2 text-sm text-sky-900">
          Go to Facilitator panel
        </Link>
      </RoleGate>

      <RoleGate roles={['player']}>
        <Link to="/player" className="rounded bg-emerald-100 p-2 text-sm text-emerald-900">
          Go to Player panel
        </Link>
      </RoleGate>

      <button onClick={handleLogout} className="rounded bg-gray-800 px-3 py-2 text-white">
        Log out
      </button>
    </div>
  )
}
