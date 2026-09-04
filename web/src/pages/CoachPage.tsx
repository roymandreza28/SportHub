import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { Venue } from '../lib/venueApi'
import { fetchMyTournamentRegistrations, fetchMyUpcomingStatSheetMatches } from '../lib/coachApi'
import { fetchProfile } from '../lib/socialApi'
import { DashboardShell, Section, type NavItem } from '../components/layout/DashboardShell'
import { UpcomingEventsStrip, type UpcomingEventCardData } from '../components/layout/UpcomingEventsStrip'
import { IconClipboard, IconHome, IconPinCalendar, IconTarget, IconTrophy } from '../components/layout/icons'
import { Newsfeed } from '../components/newsfeed/Newsfeed'
import { MatchmakingPanel } from '../components/player/MatchmakingPanel'
import { VenueDirectory } from '../components/player/VenueDirectory'
import { VenueRegistrationForm } from '../components/player/VenueRegistrationForm'
import { MyBookings } from '../components/player/MyBookings'
import { MyTournamentRegistrations } from '../components/coach/MyTournamentRegistrations'
import { RegisterPlayerModal } from '../components/coach/RegisterPlayerModal'
import { EvaluationForm } from '../components/coach/EvaluationForm'
import { StatSheetTrigger } from '../components/coach/StatSheetTrigger'
import { StatSheetModal } from '../components/coach/StatSheetModal'
import { MyPosts } from '../components/social/MyPosts'
import { FriendsList } from '../components/social/FriendsList'
import { ProfileHeaderCard } from '../components/social/ProfileHeaderCard'
import { useAuth } from '../lib/AuthContext'
import { useChatUI } from '../lib/ChatUIContext'
import { useProfileMediaMutations } from '../lib/useProfileMedia'
import { extractErrorMessage } from '../lib/errors'
import { buttonPrimary, buttonSecondary, chip } from '../lib/formStyles'

// 'profile' is deliberately not in this list — the profile tab is still
// reachable via the "Edit profile" link on ProfilePage.tsx (?tab=profile),
// it's just no longer a permanent sidenav entry.
const NAV_ITEMS: NavItem[] = [
  { id: 'newsfeed', label: 'Newsfeed', icon: IconHome },
  { id: 'matchmaking', label: 'Matchmaking', icon: IconTarget },
  { id: 'registrations', label: 'Tournament', icon: IconTrophy },
  { id: 'evaluations', label: 'Evaluations', icon: IconClipboard },
  // Same combined venue-booking entry as the player dashboard — the
  // /venue-registrations endpoints already allow role:player|coach, this
  // was just never surfaced in the coach UI.
  { id: 'venues', label: 'Venues & Bookings', icon: IconPinCalendar },
]

export function CoachPage() {
  const [searchParams] = useSearchParams()
  const [active, setActive] = useState(searchParams.get('tab') ?? NAV_ITEMS[0].id)
  // Re-applies ?tab= whenever it changes, not just on first mount — a
  // notification click (e.g. a team invite → /coach?tab=matchmaking)
  // navigates to this same route while it's already mounted, which the
  // useState initializer above alone would never see.
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) setActive(tab)
  }, [searchParams])
  const { openChatWindow } = useChatUI()
  const { user } = useAuth()
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [venuesSubTab, setVenuesSubTab] = useState<'venues' | 'bookings'>('venues')
  const [statSheetMatchId, setStatSheetMatchId] = useState<number | null>(null)

  const { data: upcomingStatSheetMatches } = useQuery({
    queryKey: ['coach', 'matches', 'upcoming-stat-sheets'],
    queryFn: fetchMyUpcomingStatSheetMatches,
    refetchInterval: 30000,
  })

  const { data: myProfile } = useQuery({
    queryKey: ['social', 'profile', user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: active === 'profile' && !!user,
  })
  const { avatarMutation, coverMutation } = useProfileMediaMutations(user?.id ?? 0)

  // Every tournament a player or a team the coach registered is part of —
  // one card per tournament, same "upcoming events" concept as the player
  // dashboard, just sourced from the coach's own registrations instead of
  // venue bookings + a player's own tournament entries. Withdrawn/completed/
  // cancelled ones are filtered the same way the player side does (by the
  // tournament's own status, not the registration's).
  const { data: myRegistrations } = useQuery({
    queryKey: ['coach', 'tournament-registrations', 'mine'],
    queryFn: fetchMyTournamentRegistrations,
  })

  const upcomingEvents: UpcomingEventCardData[] = (myRegistrations ?? [])
    .filter((r) => r.tournament.status !== 'completed' && r.tournament.status !== 'cancelled')
    .sort((a, b) => new Date(a.tournament.starts_at).getTime() - new Date(b.tournament.starts_at).getTime())
    .slice(0, 5)
    .map((r) => ({
      key: `tournament-${r.tournament.id}`,
      primary: r.tournament.name,
      secondary: `${r.tournament.sport.name}${r.tournament.venue ? ` — ${r.tournament.venue.name}` : ''} — ${new Date(r.tournament.starts_at).toLocaleDateString()}`,
      status: r.tournament.status,
      kind: 'tournament',
      tournament: r.tournament,
    }))

  return (
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={setActive}>
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
        <Section title="Newsfeed" compact>
          <UpcomingEventsStrip events={upcomingEvents} title="Upcoming Tournaments" />
          <Newsfeed />
        </Section>
      )}

      {active === 'matchmaking' && (
        <Section title="Matchmaking" compact>
          <MatchmakingPanel />
        </Section>
      )}

      {active === 'registrations' && (
        <Section
          title="Tournament"
          compact
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

          {(upcomingStatSheetMatches ?? []).length > 0 && (
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stat Sheets</p>
              {upcomingStatSheetMatches!.map((m) => (
                <button
                  key={m.match_id}
                  onClick={() => setStatSheetMatchId(m.match_id)}
                  className={`${buttonSecondary} self-start`}
                >
                  Stat Sheet — {m.participant_name} vs {m.opponent_name}
                </button>
              ))}
            </div>
          )}
        </Section>
      )}

      {active === 'evaluations' && (
        <Section title="Evaluations" compact>
          <EvaluationForm />
        </Section>
      )}

      {active === 'venues' && (
        <Section title="Venues & Bookings" compact>
          <div className="mb-4 flex gap-2">
            <button type="button" className={chip(venuesSubTab === 'venues')} onClick={() => setVenuesSubTab('venues')}>
              Venues
            </button>
            <button type="button" className={chip(venuesSubTab === 'bookings')} onClick={() => setVenuesSubTab('bookings')}>
              My Bookings
            </button>
          </div>

          {venuesSubTab === 'venues' ? (
            <>
              <VenueDirectory onSelect={setSelectedVenue} selectedId={selectedVenue?.id} />
              {selectedVenue && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <VenueRegistrationForm venue={selectedVenue} />
                </div>
              )}
            </>
          ) : (
            <MyBookings />
          )}
        </Section>
      )}

      {showRegisterModal && <RegisterPlayerModal onClose={() => setShowRegisterModal(false)} />}
      {statSheetMatchId !== null && (
        <StatSheetModal matchId={statSheetMatchId} onClose={() => setStatSheetMatchId(null)} />
      )}
      <StatSheetTrigger />
    </DashboardShell>
  )
}
