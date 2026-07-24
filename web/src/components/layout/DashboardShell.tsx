import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router'
import { IconChevronLeft } from './icons'
import { UserMenu } from './UserMenu'

export type NavItem = {
  id: string
  label: string
  icon: (props: { className?: string }) => ReactElement
}

export function DashboardShell({
  navItems,
  activeId,
  onNavigate,
  children,
}: {
  navItems: NavItem[]
  activeId: string
  onNavigate: (id: string) => void
  children: ReactNode
}) {
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
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                activeId === item.id
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
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
          <UserMenu />
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
  title,
  description,
  rows,
  emptyText,
  action,
}: {
  title: string
  description?: string
  rows: ReactNode[]
  emptyText: string
  action?: ReactNode
}) {
  return (
    <div className="mb-8 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
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
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
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
