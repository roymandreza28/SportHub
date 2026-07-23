import { DashboardShell, Section, StatCard, StatCardGrid, type NavItem } from '../components/layout/DashboardShell'
import { IconFileText, IconHome, IconUserCog, IconUsers } from '../components/layout/icons'
import { useAdminMetrics } from '../components/admin/useAdminMetrics'
import { FacilitatorCreateForm } from '../components/admin/FacilitatorCreateForm'
import { UserManagementTable } from '../components/admin/UserManagementTable'
import { AuditLogTable } from '../components/admin/AuditLogTable'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'users', label: 'Users Management', icon: IconUsers },
  { id: 'facilitators', label: 'Facilitators', icon: IconUserCog },
  { id: 'audit-log', label: 'Audit Log', icon: IconFileText },
]

export function AdminPage() {
  const { data: metrics, isLoading } = useAdminMetrics()

  return (
    <DashboardShell navItems={NAV_ITEMS}>
      <div id="overview" className="mb-6 scroll-mt-24">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Platform-wide activity across every module.</p>
      </div>

      {isLoading || !metrics ? (
        <p className="mb-8 text-sm text-slate-500">Loading metrics...</p>
      ) : (
        <StatCardGrid>
          <StatCard label="Venues" value={metrics.total_venues} />
          <StatCard label="Tournaments" value={metrics.total_tournaments} />
          <StatCard label="Pending venue requests" value={metrics.pending_venue_registrations} />
          <StatCard label="Open matchmaking requests" value={metrics.open_matchmaking_requests} />
          <StatCard label="Live matches" value={metrics.live_matches} />
        </StatCardGrid>
      )}

      <Section id="facilitators" title="Facilitators" description="Create a new venue facilitator account.">
        <FacilitatorCreateForm />
        {metrics && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {Object.entries(metrics.users_by_role).map(([role, count]) => (
              <span key={role} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {role}: {count}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section id="users" title="Users Management" description="Search users and manage their roles.">
        <UserManagementTable />
      </Section>

      <Section id="audit-log" title="Audit Log" description="Every sensitive action taken on the platform.">
        <AuditLogTable />
      </Section>
    </DashboardShell>
  )
}
