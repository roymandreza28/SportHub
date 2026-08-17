import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchTournaments } from '../lib/coachApi'
import { fetchProfile } from '../lib/socialApi'
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
import { IconClipboard, IconHome, IconNewspaper, IconTarget, IconTrophy, IconUsers } from '../components/layout/icons'
import { Newsfeed } from '../components/newsfeed/Newsfeed'
import { MatchmakingPanel } from '../components/player/MatchmakingPanel'
import { MyTournamentRegistrations } from '../components/coach/MyTournamentRegistrations'
import { RegisterPlayerModal } from '../components/coach/RegisterPlayerModal'
import { EvaluationForm } from '../components/coach/EvaluationForm'
import { MyPosts } from '../components/social/MyPosts'
import { FriendsList } from '../components/social/FriendsList'
import { ProfileHeaderCard } from '../components/social/ProfileHeaderCard'
import { useAuth } from '../lib/AuthContext'
import { useChatUI } from '../lib/ChatUIContext'
import { useProfileMediaMutations } from '../lib/useProfileMedia'
import { extractErrorMessage } from '../lib/errors'
import { buttonPrimary, buttonSecondary } from '../lib/formStyles'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'profile', label: 'Profile', icon: IconUsers },
  { id: 'newsfeed', label: 'Newsfeed', icon: IconNewspaper },
  { id: 'matchmaking', label: 'Matchmaking', icon: IconTarget },
  { id: 'registrations', label: 'Tournament', icon: IconTrophy },
  { id: 'evaluations', label: 'Evaluations', icon: IconClipboard },
]

export function CoachPage() {
  const { data: openTournaments } = useQuery({ queryKey: ['tournaments', 'open'], queryFn: () => fetchTournaments('open') })
  const [searchParams] = useSearchParams()
  const [active, setActive] = useState(searchParams.get('tab') ?? NAV_ITEMS[0].id)
  const { openChatWindow } = useChatUI()
  const { user } = useAuth()
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)

  const { data: myProfile } = useQuery({
    queryKey: ['social', 'profile', user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: active === 'profile' && !!user,
  })
  const { avatarMutation, coverMutation } = useProfileMediaMutations(user?.id ?? 0)

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
                onClick={() => {
                  setActive('registrations')
                  setShowRegisterModal(true)
                }}
                className="text-sm font-medium text-teal-600 hover:text-teal-700"
              >
                Register a player &rarr;
              </button>
            }
          />
        </>
      )}

      {active === 'profile' && user && (
        <>
          <ProfileHeaderCard
            name={user.name}
            roles={user.roles}
            friendsCount={myProfile?.user.friends_count ?? 0}
            avatarUrl={user.avatar_url}
            coverUrl={myProfile?.user.cover_url ?? null}
            editable
            onAvatarChange={(file) => avatarMutation.mutate(file)}
            avatarPending={avatarMutation.isPending}
            onCoverChange={(file) => coverMutation.mutate(file)}
            coverPending={coverMutation.isPending}
            error={
              avatarMutation.isError || coverMutation.isError
                ? extractErrorMessage(avatarMutation.error ?? coverMutation.error)
                : null
            }
            actions={
              <Link to={`/profile/${user.id}`} className={buttonSecondary}>
                View public profile
              </Link>
            }
          />

          <div className="mt-6">
            <Section title="My Posts" description="Share photos with other players and coaches.">
              <MyPosts />
            </Section>
          </div>

          <div className="mt-6">
            <Section title="Friends">
              <FriendsList onMessage={openChatWindow} />
            </Section>
          </div>
        </>
      )}

      {active === 'newsfeed' && (
        <Section title="Newsfeed" description="News from organizers — react, comment, and share with friends.">
          <Newsfeed />
        </Section>
      )}

      {active === 'matchmaking' && (
        <Section title="Matchmaking" description="Find an opponent for a sport, live.">
          <MatchmakingPanel />
        </Section>
      )}

      {active === 'registrations' && (
        <Section
          title="Tournament"
          description="Tournaments your players are registered in, and their results."
          action={
            <button onClick={() => setShowRegisterModal(true)} className={buttonPrimary}>
              Register for tournament
            </button>
          }
        >
          <MyTournamentRegistrations
            selectedTournamentId={selectedTournamentId}
            onSelectTournament={setSelectedTournamentId}
          />
        </Section>
      )}

      {active === 'evaluations' && (
        <Section title="Evaluations" description="Record a skill level and see a player's history.">
          <EvaluationForm />
        </Section>
      )}

      {showRegisterModal && <RegisterPlayerModal onClose={() => setShowRegisterModal(false)} />}
    </DashboardShell>
  )
}
