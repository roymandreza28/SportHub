import { useNavigate } from 'react-router'
import { useAuth } from '../lib/AuthContext'

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
      <button onClick={handleLogout} className="rounded bg-gray-800 px-3 py-2 text-white">
        Log out
      </button>
    </div>
  )
}
