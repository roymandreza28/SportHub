import type { ReactElement, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../lib/AuthContext'
import { IconChevronLeft, IconLogOut, IconSettings } from './icons'

export type NavItem = {
  id: string
  label: string
  icon: (props: { className?: string }) => ReactElement
}

export function DashboardShell({ navItems, children }: { navItems: NavItem[]; children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  // The only role combination an account can hold is coach+player (a coach
  // is always also a player) — everyone else has exactly one role. This is
  // the one case where there's a real choice of which dashboard to view, so
  // it's the only case that gets a switcher.
  const canSwitchCoachPlayer = !!user?.roles.includes('coach') && !!user?.roles.includes('player')

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-4 py-6">
        <Link to="/dashboard" className="mb-8 flex items-center gap-2 px-2">
          <img src="/logo.png" alt="" className="h-8 w-8" />
          <span className="text-lg font-bold text-slate-900">
            Sport<span className="text-teal-600">Hub</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item, index) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                index === 0
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </a>
          ))}
        </nav>

        {canSwitchCoachPlayer && (
          <div className="mb-1 border-t border-slate-100 pt-3">
            <p className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <IconSettings className="h-3.5 w-3.5" />
              Account settings
            </p>
            <Link
              to="/coach"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                location.pathname === '/coach'
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Coach view
            </Link>
            <Link
              to="/player"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                location.pathname === '/player'
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Player view
            </Link>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <IconLogOut className="h-5 w-5 shrink-0" />
          Logout
        </button>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-8 py-4 backdrop-blur">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </span>
            <span className="hidden sm:inline">{user?.name}</span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  )
}

export function StatCardGrid({ children }: { children: ReactNode }) {
  return <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
}

export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  open: 'bg-teal-100 text-teal-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-slate-100 text-slate-600',
  live: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-500',
  scheduled: 'bg-blue-100 text-blue-700',
  ended: 'bg-slate-100 text-slate-500',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
        STATUS_BADGE_STYLES[status] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

export function ListRow({
  primary,
  secondary,
  badge,
}: {
  primary: ReactNode
  secondary?: ReactNode
  badge?: ReactNode
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{primary}</p>
        {secondary && <p className="truncate text-xs text-slate-500">{secondary}</p>}
      </div>
      {badge}
    </li>
  )
}

export function ListPreview({
  id,
  title,
  description,
  rows,
  emptyText,
  action,
}: {
  id?: string
  title: string
  description?: string
  rows: ReactNode[]
  emptyText: string
  action?: ReactNode
}) {
  return (
    <div id={id} className="mb-8 scroll-mt-24 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{emptyText}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-slate-100">{rows}</ul>
      )}
    </div>
  )
}

export function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">{children}</div>
    </section>
  )
}
