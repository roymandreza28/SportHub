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
    <div className="mx-auto flex min-h-screen max-w-sm flex-col gap-4 bg-slate-50 p-8">
      <span className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <img src="/logo.png" alt="" className="h-8 w-8" />
        Sport<span className="text-teal-600">Hub</span>
      </span>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-slate-700">
        Logged in as <strong>{user?.name}</strong> ({user?.email})
      </p>
      <p className="text-sm text-slate-500">Roles: {user?.roles.join(', ') || 'none'}</p>

      <div className="flex flex-col gap-2">
        <RoleGate roles={['admin']}>
          <Link
            to="/admin"
            className="rounded-lg border border-slate-100 bg-white p-3 text-sm font-medium text-slate-700 shadow-sm hover:border-teal-100 hover:text-teal-700"
          >
            Go to Admin panel
          </Link>
        </RoleGate>

        <RoleGate roles={['venue_facilitator', 'admin']}>
          <Link
            to="/facilitator"
            className="rounded-lg border border-slate-100 bg-white p-3 text-sm font-medium text-slate-700 shadow-sm hover:border-teal-100 hover:text-teal-700"
          >
            Go to Facilitator panel
          </Link>
        </RoleGate>

        <RoleGate roles={['player']}>
          <Link
            to="/player"
            className="rounded-lg border border-slate-100 bg-white p-3 text-sm font-medium text-slate-700 shadow-sm hover:border-teal-100 hover:text-teal-700"
          >
            Go to Player panel
          </Link>
        </RoleGate>

        <RoleGate roles={['coach']}>
          <Link
            to="/coach"
            className="rounded-lg border border-slate-100 bg-white p-3 text-sm font-medium text-slate-700 shadow-sm hover:border-teal-100 hover:text-teal-700"
          >
            Go to Coach panel
          </Link>
        </RoleGate>

        <RoleGate roles={['organizer']}>
          <Link
            to="/organizer"
            className="rounded-lg border border-slate-100 bg-white p-3 text-sm font-medium text-slate-700 shadow-sm hover:border-teal-100 hover:text-teal-700"
          >
            Go to Organizer panel
          </Link>
        </RoleGate>
      </div>

      <button
        onClick={handleLogout}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Log out
      </button>
    </div>
  )
}
