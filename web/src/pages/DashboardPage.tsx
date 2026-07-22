import { useNavigate } from 'react-router'
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
        <p className="rounded bg-amber-100 p-2 text-sm">Admin-only section (visible because you have the admin role)</p>
      </RoleGate>

      <button onClick={handleLogout} className="rounded bg-gray-800 px-3 py-2 text-white">
        Log out
      </button>
    </div>
  )
}
