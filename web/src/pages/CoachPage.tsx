import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchTournaments } from '../lib/coachApi'
import {
  DashboardShell,
  ListPreview,
  ListRow,
  Section,
  StatCard,
  StatCardGrid,
  StatusBadge,
  type NavItem,
} from '../components/layout/DashboardShell'
import { IconClipboard, IconHome, IconTrophy } from '../components/layout/icons'
import { TournamentRegistrationForm } from '../components/coach/TournamentRegistrationForm'
import { EvaluationForm } from '../components/coach/EvaluationForm'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'registrations', label: 'Tournament Registration', icon: IconTrophy },
  { id: 'evaluations', label: 'Evaluations', icon: IconClipboard },
]

export function CoachPage() {
  const { data: openTournaments } = useQuery({ queryKey: ['tournaments', 'open'], queryFn: () => fetchTournaments('open') })
  const [active, setActive] = useState(NAV_ITEMS[0].id)

  return (
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={setActive}>
      {active === 'overview' && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Coach</h1>
            <p className="mt-1 text-sm text-slate-500">Register players and track their skill.</p>
          </div>

          <StatCardGrid>
            <StatCard label="Open tournaments" value={openTournaments?.length ?? '-'} />
          </StatCardGrid>

          <ListPreview
            title="Open Tournaments"
            description="Tournaments currently accepting registrations."
            emptyText="No open tournaments right now."
            rows={(openTournaments ?? []).map((t) => (
              <ListRow
                key={t.id}
                primary={t.name}
                secondary={`${t.sport.name} — starts ${new Date(t.starts_at).toLocaleDateString()}`}
                badge={<StatusBadge status={t.status} />}
              />
            ))}
            action={
              <button
                onClick={() => setActive('registrations')}
                className="text-sm font-medium text-teal-600 hover:text-teal-700"
              >
                Register a player &rarr;
              </button>
            }
          />
        </>
      )}

      {active === 'registrations' && (
        <Section title="Tournament Registration" description="Enter a player into an open tournament.">
          <TournamentRegistrationForm />
        </Section>
      )}

      {active === 'evaluations' && (
        <Section title="Evaluations" description="Record a skill level and see a player's history.">
          <EvaluationForm />
        </Section>
      )}
    </DashboardShell>
  )
}
