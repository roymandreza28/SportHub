import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../lib/AuthContext'
import { AccountSettingsModal } from './AccountSettingsModal'
import { Avatar } from './Avatar'
import { IconChevronDown, IconLogOut, IconSettings, IconSwitch } from './icons'

export function UserMenu() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleLogout() {
    // Navigate away before logout() resolves, not after: logout() sets user
    // to null as its last step, and if that commits while this page (behind
    // a role-gated ProtectedRoute) is still mounted, the route reacts to the
    // now-null user and redirects to /login itself — winning the race
    // against our own navigate('/') call. Leaving the protected route first
    // means there's nothing left to react to that state change.
    setOpen(false)
    navigate('/')
    await logout()
  }

  const canSwitchCoachPlayer = !!user?.roles.includes('coach') && !!user?.roles.includes('player')

  return (
    <>
      <div
        ref={containerRef}
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
        >
          <Avatar name={user?.name ?? '?'} url={user?.avatar_url} size="sm" />
          <span className="hidden sm:inline">{user?.name}</span>
          <IconChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-20 w-64 pt-2">
            <div className="rounded-xl border border-slate-100 bg-white p-2 shadow-2xl">
              <div className="border-b border-slate-100 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Avatar name={user?.name ?? '?'} url={user?.avatar_url} size="md" />
                  <div className="min-w-0">
                    {hasRole('player', 'coach') && user ? (
                      <Link
                        to={`/profile/${user.id}`}
                        onClick={() => setOpen(false)}
                        className="block truncate text-sm font-semibold text-slate-900 hover:text-teal-700"
                      >
                        {user.name}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
                    )}
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>
                </div>
                {!!user?.roles.length && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600"
                      >
                        {role.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setOpen(false)
                    setSettingsOpen(true)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  <IconSettings className="h-4 w-4" />
                  Account settings
                </button>

                {canSwitchCoachPlayer && (
                  <>
                    <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <IconSwitch className="h-3 w-3" />
                      Switch role
                    </p>
                    <Link
                      to="/coach"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                    >
                      Coach view
                    </Link>
                    <Link
                      to="/player"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                    >
                      Player view
                    </Link>
                  </>
                )}
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <IconLogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {settingsOpen && <AccountSettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
