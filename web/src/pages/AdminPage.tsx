import { useState } from 'react'
import { DashboardShell, Section, StatCard, StatCardGrid, type NavItem } from '../components/layout/DashboardShell'
import { IconFileText, IconHelpCircle, IconHome, IconShieldCheck, IconUserCog, IconUsers } from '../components/layout/icons'
import { useAdminMetrics } from '../components/admin/useAdminMetrics'
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

export function AdminPage() {
  const { data: metrics, isLoading } = useAdminMetrics()
  const [active, setActive] = useState(NAV_ITEMS[0].id)

  return (
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={setActive}>
      {active === 'overview' && (
        <>
          <div className="mb-6">
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

          {metrics && (
            <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">Users by role</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(metrics.users_by_role).map(([role, count]) => (
                  <span key={role} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {role}: {count}
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
