import { DashboardShell, Section, StatCard, type NavItem } from '../components/layout/DashboardShell'
import { IconFileText, IconHelpCircle, IconHome, IconShieldCheck, IconUserCog, IconUsers } from '../components/layout/icons'
import { useAdminMetrics } from '../components/admin/useAdminMetrics'
import { useTabParam } from '../lib/useTabParam'
import { FacilitatorCreateForm } from '../components/admin/FacilitatorCreateForm'
import { OrganizerCreateForm } from '../components/admin/OrganizerCreateForm'
import { UserManagementTable } from '../components/admin/UserManagementTable'
import { VerificationQueue } from '../components/admin/VerificationQueue'
import { AuditLogTable } from '../components/admin/AuditLogTable'
import { PublicInquiriesTable } from '../components/admin/PublicInquiriesTable'
import { AdminSupportThreads } from '../components/admin/AdminSupportThreads'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'users', label: 'Users Management', icon: IconUsers },
  { id: 'verification', label: 'Verification', icon: IconShieldCheck },
  { id: 'facilitators', label: 'Facilitators & Organizers', icon: IconUserCog },
  { id: 'inquiries', label: 'Inquiries & Support', icon: IconHelpCircle },
  { id: 'audit-log', label: 'Audit Log', icon: IconFileText },
]

const ROLE_CHIP_STYLES: Record<string, string> = {
  admin: 'bg-slate-900 text-pure-white',
  organizer: 'bg-teal-600 text-pure-white',
  venue_organizer: 'bg-teal-700 text-pure-white',
  venue_facilitator: 'bg-amber-500 text-slate-900',
  player: 'bg-emerald-600 text-pure-white',
  coach: 'bg-cyan-600 text-pure-white',
  livestream_organizer: 'bg-violet-600 text-pure-white',
  default: 'bg-slate-100 text-slate-700',
}

const MONTHLY_TRENDS = [
  { month: 'Jan', venues: 42, tournaments: 18, players: 280 },
  { month: 'Feb', venues: 46, tournaments: 22, players: 320 },
  { month: 'Mar', venues: 58, tournaments: 29, players: 391 },
  { month: 'Apr', venues: 63, tournaments: 31, players: 438 },
  { month: 'May', venues: 71, tournaments: 36, players: 502 },
  { month: 'Jun', venues: 79, tournaments: 43, players: 584 },
]

const TOP_PERFORMING_VENUES = [
  { name: 'Harbor Sports Arena', bookings: 184, occupancy: '91%', rating: 4.9, trend: '+12%' },
  { name: 'Summit Courts Club', bookings: 162, occupancy: '87%', rating: 4.8, trend: '+9%' },
  { name: 'Northside Community Hub', bookings: 149, occupancy: '82%', rating: 4.7, trend: '+14%' },
  { name: 'Crescent Indoor Complex', bookings: 138, occupancy: '79%', rating: 4.6, trend: '+8%' },
]

function TrendChart({ data }: { data: number[] }) {
  const width = 460
  const height = 160
  const padding = 20
  const maxValue = Math.max(...data)
  const minValue = Math.min(...data)
  const range = Math.max(maxValue - minValue, 1)

  const points = data
    .map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (width - padding * 2)
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')

  const barWidth = (width - padding * 2) / data.length - 12

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label="Monthly trend chart">
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(20,184,166,0.35)" />
          <stop offset="100%" stopColor="rgba(20,184,166,0.02)" />
        </linearGradient>
      </defs>

      {[0, 1, 2, 3].map((line) => (
        <line
          key={line}
          x1={padding}
          x2={width - padding}
          y1={padding + line * 34}
          y2={padding + line * 34}
          stroke="rgba(148,163,184,0.18)"
          strokeDasharray="4 6"
        />
      ))}

      {data.map((value, index) => {
        const x = padding + index * ((width - padding * 2) / data.length) + 6
        const y = height - padding - ((value - minValue) / range) * (height - padding * 2)
        const barHeight = height - padding - y

        return (
          <rect
            key={`${value}-${index}`}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={8}
            fill="rgba(20,184,166,0.14)"
          />
        )
      })}

      <polyline fill="none" stroke="#14b8a6" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <polygon points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} fill="url(#trend-fill)" opacity="0.9" />
    </svg>
  )
}

function PerformanceBars({ values }: { values: number[] }) {
  const max = Math.max(...values)

  return (
    <div className="mt-4 flex h-36 items-end gap-3">
      {values.map((value, index) => (
        <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-full w-full items-end justify-center rounded-t-2xl bg-gradient-to-t from-teal-600 to-teal-400/90 shadow-[0_10px_24px_rgba(20,184,166,0.18)]" style={{ height: `${(value / max) * 100}%` }} />
          <span className="text-[11px] font-medium text-slate-500">{['J', 'F', 'M', 'A', 'M', 'J'][index]}</span>
        </div>
      ))}
    </div>
  )
}

export function AdminPage() {
  const { data: metrics, isLoading } = useAdminMetrics()
  const [active, setActive] = useTabParam(NAV_ITEMS[0].id)

  const playerCount = metrics?.users_by_role?.player ?? 0
  const coachCount = metrics?.users_by_role?.coach ?? 0
  const venueFacilitatorCount = metrics?.users_by_role?.venue_facilitator ?? 0
  const tournamentTrend = MONTHLY_TRENDS.map((item) => item.tournaments)
  const insights = [
    { title: 'Engagement', value: '+24%', description: 'Month-over-month player activity' },
    { title: 'Bookings', value: '+18%', description: 'Venue demand is steadily climbing' },
    { title: 'Verification', value: '12', description: 'Accounts waiting for review' },
  ]

  return (
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={setActive}>
      {active === 'overview' && (
        <>
          <div className="mb-8 overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 p-6 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-200/80">Operations overview</p>
                <h1 className="mt-2 text-3xl font-bold text-pure-white sm:text-4xl">Admin Dashboard</h1>
                <p className="mt-2 max-w-xl text-sm text-slate-200 sm:text-base">
                  Platform-wide activity across every module, with critical actions highlighted for quick review.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-50 backdrop-blur-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" />
                {metrics?.live_matches ?? 0} live matches
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">Pending requests</p>
                <p className="mt-2 text-3xl font-bold text-white">{metrics ? metrics.pending_venue_registrations : '—'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">Open matchmaking</p>
                <p className="mt-2 text-3xl font-bold text-white">{metrics ? metrics.open_matchmaking_requests : '—'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">Registered venues</p>
                <p className="mt-2 text-3xl font-bold text-white">{metrics ? metrics.total_venues : '—'}</p>
              </div>
            </div>
          </div>

          {isLoading || !metrics ? (
            <p className="mb-8 text-sm text-slate-500">Loading metrics...</p>
          ) : (
            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Venues" value={metrics.total_venues} />
              <StatCard label="Tournaments" value={metrics.total_tournaments} />
              <StatCard label="Players" value={playerCount} />
              <StatCard label="Coaches" value={coachCount} />
              <StatCard label="Facilitators" value={venueFacilitatorCount} />
            </div>
          )}

          {metrics && (
            <div className="mb-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Monthly trends</p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">Platform growth</h2>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">+18.6%</div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
                  <div>
                    <TrendChart data={tournamentTrend} />
                    <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                      {MONTHLY_TRENDS.map((item) => (
                        <span key={item.month}>{item.month}</span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tournaments</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{MONTHLY_TRENDS[MONTHLY_TRENDS.length - 1].tournaments}</p>
                      <p className="mt-1 text-xs text-emerald-600">Up from {MONTHLY_TRENDS[0].tournaments} in Jan</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Venues</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{MONTHLY_TRENDS[MONTHLY_TRENDS.length - 1].venues}</p>
                      <p className="mt-1 text-xs text-emerald-600">Up from {MONTHLY_TRENDS[0].venues} in Jan</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-900 p-6 text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Insights</p>
                <h2 className="mt-2 text-2xl font-bold text-white">What’s driving growth</h2>
                <div className="mt-5 space-y-3">
                  {insights.map((card) => (
                    <div key={card.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-200">{card.title}</span>
                        <span className="text-lg font-bold text-emerald-400">{card.value}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{card.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {metrics && (
            <div className="mb-8 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
              <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Traffic</p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">Performance by month</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Last 6 months
                  </span>
                </div>
                <PerformanceBars values={MONTHLY_TRENDS.map((item) => item.players)} />
                <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                  {MONTHLY_TRENDS.map((item) => (
                    <span key={item.month}>{item.month}</span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top venues</p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">High performers</h2>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Live
                  </span>
                </div>

                <div className="space-y-3">
                  {TOP_PERFORMING_VENUES.map((venue, index) => (
                    <div key={venue.name} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-pure-white">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-800">{venue.name}</p>
                          <span className="text-xs font-semibold text-emerald-600">{venue.trend}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                          <span>{venue.bookings} bookings</span>
                          <span>{venue.occupancy} occupancy</span>
                          <span>★ {venue.rating}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {metrics && (
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-slate-900">Users by role</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Total users
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(metrics.users_by_role).map(([role, count]) => (
                  <span
                    key={role}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${ROLE_CHIP_STYLES[role] ?? ROLE_CHIP_STYLES.default}`}
                  >
                    {role.replace('_', ' ')}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {active === 'facilitators' && (
        <>
          <Section title="Facilitators" description="Create a new venue facilitator account.">
            <FacilitatorCreateForm />
          </Section>

          <div className="mt-8">
            <Section title="Organizers" description="Create a main, venue, or livestream organizer account.">
              <OrganizerCreateForm />
            </Section>
          </div>
        </>
      )}

      {active === 'users' && (
        <Section title="Users Management" description="Search users and manage their accounts.">
          <UserManagementTable />
        </Section>
      )}

      {active === 'verification' && (
        <Section title="Verification" description="Review player and coach accounts awaiting verification.">
          <VerificationQueue />
        </Section>
      )}

      {active === 'inquiries' && (
        <>
          <Section
            title="Public Inquiries"
            description="Anonymous messages submitted from the landing page's FAQ form — reply directly to the sender's email."
          >
            <PublicInquiriesTable />
          </Section>

          <div className="mt-8">
            <Section title="Support Conversations" description="Every FAQ thread reaching you from a logged-in user.">
              <AdminSupportThreads />
            </Section>
          </div>
        </>
      )}

      {active === 'audit-log' && (
        <Section title="Audit Log" description="Every sensitive action taken on the platform.">
          <AuditLogTable />
        </Section>
      )}
    </DashboardShell>
  )
}
