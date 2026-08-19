import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../lib/AuthContext'
import { useIsMobile } from '../../lib/useIsMobile'
import { UserSearchBar } from '../social/UserSearchBar'
import { HeaderMessagesMenu } from './HeaderMessagesMenu'
import { HeaderNotificationsMenu } from './HeaderNotificationsMenu'
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
  const { user, hasRole } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  // Mobile only — true while UserSearchBar's own icon-triggered input is
  // expanded, so the search bar can take over the whole header width with
  // the logo/other icons hidden instead of squeezing in beside them.
  const [searchExpanded, setSearchExpanded] = useState(false)
  const showSocialHeader = hasRole('player', 'coach')
  // Facilitators/organizers/admins are never self-registered through the
  // public form, so this only ever applies to player/coach accounts.
  const showVerificationBanner =
    hasRole('player', 'coach') && (user?.verification_status === 'pending' || user?.verification_status === 'rejected')

  // Mobile only: the header slides up out of view on scroll-down, and the
  // icon nav bar — a normal sticky element the whole time, never actually
  // position:fixed — slides its own sticky offset up to top-0 to take the
  // header's vacated spot once that happens. Desktop's header/sidebar stay
  // exactly as they are (plain sticky, always visible); this entire block
  // is inert there.
  const isMobile = useIsMobile()
  const headerRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const [headerHidden, setHeaderHidden] = useState(false)
  const lastScrollY = useRef(0)

  useLayoutEffect(() => {
    if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight)
  }, [isMobile, searchExpanded])

  useEffect(() => {
    if (!isMobile) {
      setHeaderHidden(false)
      return
    }

    lastScrollY.current = window.scrollY

    function handleScroll() {
      const currentY = window.scrollY
      // Ignore tiny jitters, and never hide while still within the header's
      // own height of the top — nothing to gain from hiding it that early.
      if (Math.abs(currentY - lastScrollY.current) < 8) return

      if (currentY > lastScrollY.current && currentY > headerHeight) {
        setHeaderHidden(true)
      } else if (currentY < lastScrollY.current) {
        setHeaderHidden(false)
      }
      lastScrollY.current = currentY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isMobile, headerHeight])

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop/laptop sidebar — hidden below md, where the always-visible
          icon nav bar below the header takes over instead. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white py-6 transition-all md:flex ${
          collapsed ? 'w-20 px-2' : 'w-64 px-4'
        }`}
      >
        <Link to="/dashboard" className={`mb-8 flex items-center gap-2 px-2 ${collapsed ? 'justify-center' : ''}`}>
          <img src="/logo.png" alt="" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <span className="text-lg font-bold text-slate-900">
              Sport<span className="text-teal-600">Hub</span>
            </span>
          )}
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                collapsed ? 'justify-center' : ''
              } ${
                activeId === item.id
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Header: a plain sticky element, same as before — never
            position:fixed. On mobile it additionally slides up out of view
            via transform once you've scrolled past it and keep scrolling
            down (scrolling back up brings it right back). */}
        <header
          ref={headerRef}
          style={isMobile ? { transform: headerHidden ? `translateY(-${headerHeight}px)` : 'translateY(0)' } : undefined}
          className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur transition-transform duration-300 sm:gap-4 sm:px-8"
        >
          {/* Desktop-only sidebar collapse toggle — hidden while search is
              expanded is unnecessary since expansion only ever happens
              below md:, where this button is already hidden. */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 md:flex"
          >
            <IconChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>

          {/* Mobile-only: logo + system name — hidden while search is
              expanded so the search bar can take the full header width. */}
          {!searchExpanded && (
            <Link to="/dashboard" className="flex shrink-0 items-center gap-2 rounded-lg p-1 hover:bg-slate-50 md:hidden">
              <img src="/logo.png" alt="" className="h-8 w-8 shrink-0" />
              <span className="text-base font-bold text-slate-900">
                Sport<span className="text-teal-600">Hub</span>
              </span>
            </Link>
          )}

          {/* Search sits with messages/notifications/user menu rather than
              centered on its own — it already collapses to an icon-only
              trigger below md: (see UserSearchBar), so this reads as one
              consistent icon cluster on mobile, and search-next-to-messages
              on desktop too. When expanded on mobile, this whole row
              becomes just the search input — messages/notifications/user
              menu (and the logo above) hide so it can take the full width. */}
          <div className={`flex flex-1 items-center gap-1 ${searchExpanded ? '' : 'justify-end'}`}>
            {showSocialHeader && <UserSearchBar onExpandedChange={setSearchExpanded} />}
            {!searchExpanded && showSocialHeader && <HeaderMessagesMenu />}
            {!searchExpanded && showSocialHeader && <HeaderNotificationsMenu />}
            {!searchExpanded && <UserMenu />}
          </div>
        </header>

        {/* Mobile-only: an always-visible horizontal icon bar replaces the
            desktop sidebar below md — no tap-to-open step, the icon itself
            is the button. Centered as a group; overflow-x-auto still lets it
            scroll instead of wrapping if a page has too many items to fit.
            Each icon shows its label as a hover tooltip instead of relying
            on the native browser title (which is slow/inconsistent).
            This is a normal sticky element the whole time (never
            position:fixed) — its own "top" offset animates from just below
            the header up to top-0 once the header hides, so it ends up
            occupying the header's old spot instead of leaving a gap there. */}
        <nav
          style={isMobile ? { top: headerHidden ? 0 : headerHeight } : undefined}
          className="sticky z-10 flex items-center justify-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 transition-[top] duration-300 md:hidden"
        >
          {navItems.map((item) => (
            <div key={item.id} className="group relative">
              <button
                onClick={() => onNavigate(item.id)}
                aria-label={item.label}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition ${
                  activeId === item.id
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <item.icon className="h-5 w-5" />
              </button>
              <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {item.label}
              </span>
            </div>
          ))}
        </nav>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          {showVerificationBanner && (
            <div
              className={`mb-6 rounded-lg border p-4 text-sm ${
                user?.verification_status === 'rejected'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <p className="font-semibold">
                {user?.verification_status === 'rejected'
                  ? 'Your account verification was rejected.'
                  : "Your account is under verification — you can't access other services at the moment."}
              </p>
              <p className="mt-1">
                {user?.verification_status === 'rejected'
                  ? 'Please contact an administrator for help.'
                  : "An admin needs to review the proof you submitted at registration before you can join or create a match, join a team, or register for a tournament. Your profile and browsing are still available in the meantime."}
              </p>
            </div>
          )}
          {children}
        </main>
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
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-slate-100 text-slate-500',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  open: 'bg-teal-100 text-teal-700',
  registration: 'bg-teal-100 text-teal-700',
  preparation: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  ongoing: 'bg-blue-100 text-blue-700',
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
  compact,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  // Smaller title, no description — trades the usual header for more room
  // for the actual content below it (e.g. Newsfeed, where the article list
  // is the point, not a page-title banner).
  compact?: boolean
  children: ReactNode
}) {
  return (
    <section>
      <div className={`flex items-end justify-between gap-4 ${compact ? 'mb-2' : 'mb-3'}`}>
        <div>
          <h2 className={compact ? 'text-sm font-semibold text-slate-700' : 'text-xl font-bold text-slate-900'}>
            {title}
          </h2>
          {!compact && description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">{children}</div>
    </section>
  )
}
