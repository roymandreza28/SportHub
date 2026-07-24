import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
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
import { IconClipboard, IconHome, IconMessageCircle, IconTrophy, IconUserPlus, IconUsers } from '../components/layout/icons'
import { TournamentRegistrationForm } from '../components/coach/TournamentRegistrationForm'
import { EvaluationForm } from '../components/coach/EvaluationForm'
import { MyPosts } from '../components/social/MyPosts'
import { FriendsPanel } from '../components/social/FriendsPanel'
import { ChatPanel } from '../components/social/ChatPanel'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'profile', label: 'Profile', icon: IconUsers },
  { id: 'friends', label: 'Friends', icon: IconUserPlus },
  { id: 'chat', label: 'Messages', icon: IconMessageCircle },
  { id: 'registrations', label: 'Tournament Registration', icon: IconTrophy },
  { id: 'evaluations', label: 'Evaluations', icon: IconClipboard },
]

export function CoachPage() {
  const { data: openTournaments } = useQuery({ queryKey: ['tournaments', 'open'], queryFn: () => fetchTournaments('open') })
  const [searchParams, setSearchParams] = useSearchParams()
  const [active, setActive] = useState(searchParams.get('tab') ?? NAV_ITEMS[0].id)
  const initialConversationId = searchParams.get('conversation') ? Number(searchParams.get('conversation')) : undefined

  // Consumes the one-time deep-link params from a "Message" redirect (see
  // ProfilePage) so they don't linger in the URL after the initial render.
  useEffect(() => {
    if (searchParams.get('tab') || searchParams.get('conversation')) {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

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

      {active === 'profile' && (
        <Section title="Profile" description="Share photos with other players and coaches.">
          <MyPosts />
        </Section>
      )}

      {active === 'friends' && (
        <Section title="Friends" description="Find and connect with other players and coaches.">
          <FriendsPanel
            onMessage={(conversationId) => {
              setActive('chat')
              setSearchParams({ conversation: String(conversationId) })
            }}
          />
        </Section>
      )}

      {active === 'chat' && (
        <Section title="Messages" description="Chat with friends, or start a group.">
          <ChatPanel initialConversationId={initialConversationId} />
        </Section>
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
