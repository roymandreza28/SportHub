import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { Venue } from '../lib/venueApi'
import { fetchMyVenueRegistrations, fetchMyTournamentRegistrationsAsPlayer } from '../lib/playerApi'
import { fetchProfile } from '../lib/socialApi'
import { DashboardShell, Section, type NavItem } from '../components/layout/DashboardShell'
import { UpcomingEventsStrip, type UpcomingEventData } from '../components/layout/UpcomingEventsStrip'
import { IconHome, IconPinCalendar, IconTarget, IconTrophy } from '../components/layout/icons'
import { Newsfeed } from '../components/newsfeed/Newsfeed'
import { VenueDirectory } from '../components/player/VenueDirectory'
import { VenueRegistrationForm } from '../components/player/VenueRegistrationForm'
import { PlayerProfileEditor } from '../components/player/PlayerProfileEditor'
import { MatchmakingPanel } from '../components/player/MatchmakingPanel'
import { MyBookings } from '../components/player/MyBookings'
import { MyTournamentRegistrations } from '../components/player/MyTournamentRegistrations'
import { MyPosts } from '../components/social/MyPosts'
import { FriendsList } from '../components/social/FriendsList'
import { ProfileHeaderCard } from '../components/social/ProfileHeaderCard'
import { useAuth } from '../lib/AuthContext'
import { useChatUI } from '../lib/ChatUIContext'
import { useProfileMediaMutations } from '../lib/useProfileMedia'
import { extractErrorMessage } from '../lib/errors'
import { buttonSecondary, chip } from '../lib/formStyles'

// 'profile' is deliberately not in this list — the profile tab is still
// reachable via the "Edit profile" link on ProfilePage.tsx (?tab=profile),
// it's just no longer a permanent sidenav entry.
const NAV_ITEMS: NavItem[] = [
  { id: 'newsfeed', label: 'Newsfeed', icon: IconHome },
  { id: 'matchmaking', label: 'Matchmaking', icon: IconTarget },
  { id: 'tournaments', label: 'Tournament', icon: IconTrophy },
  // Bookings + Venues merged into one nav entry — a combined pin+calendar
  // icon signals it covers both, with a sub-tab pill inside to switch.
  { id: 'venues', label: 'Venues & Bookings', icon: IconPinCalendar },
]

export function PlayerPage() {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [searchParams] = useSearchParams()
  const [active, setActive] = useState(searchParams.get('tab') ?? NAV_ITEMS[0].id)
  // Re-applies ?tab= whenever it changes, not just on first mount — a
  // notification click (e.g. "you were matched" → /player?tab=matchmaking)
  // navigates to this same route while it's already mounted, which the
  // useState initializer above alone would never see.
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) setActive(tab)
  }, [searchParams])
  const [venuesSubTab, setVenuesSubTab] = useState<'venues' | 'bookings'>('venues')
  const { openChatWindow } = useChatUI()
  const { user } = useAuth()

  const { data: bookings } = useQuery({ queryKey: ['player', 'venue-registrations'], queryFn: fetchMyVenueRegistrations })
  const { data: tournamentRegistrations } = useQuery({
    queryKey: ['player', 'tournament-registrations', 'mine'],
    queryFn: fetchMyTournamentRegistrationsAsPlayer,
  })
  const { data: myProfile } = useQuery({
    queryKey: ['social', 'profile', user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: active === 'profile' && !!user,
  })
  const { avatarMutation, coverMutation } = useProfileMediaMutations(user?.id ?? 0)

  const now = Date.now()
  type UpcomingEvent = {
    key: string
    date: string
    primary: string
    secondary: string
    status: string
  } & UpcomingEventData

  const upcomingBookingEvents: UpcomingEvent[] = (bookings ?? [])
    .filter((b) => b.status === 'approved' && new Date(b.ends_at).getTime() > now)
    .map((b) => ({
      key: `booking-${b.id}`,
      date: b.starts_at,
      primary: b.court ? `${b.venue.name} — ${b.court.name}` : b.venue.name,
      secondary: `${new Date(b.starts_at).toLocaleString()} — ${new Date(b.ends_at).toLocaleTimeString()}`,
      status: b.status,
      kind: 'booking',
      booking: b,
    }))

  const upcomingTournamentEvents: UpcomingEvent[] = (tournamentRegistrations ?? [])
    .filter((r) => r.tournament.status !== 'completed' && r.tournament.status !== 'cancelled')
    .map((r) => ({
      key: `tournament-${r.tournament.id}`,
      date: r.tournament.starts_at,
      primary: r.tournament.name,
      secondary: `${r.tournament.sport.name}${r.tournament.venue ? ` — ${r.tournament.venue.name}` : ''} — ${new Date(r.tournament.starts_at).toLocaleDateString()}`,
      status: r.tournament.status,
      kind: 'tournament',
      tournament: r.tournament,
    }))

  const upcomingEvents = [...upcomingBookingEvents, ...upcomingTournamentEvents]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)

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
            <Section title="Edit profile" description="Your bio, primary sport, and skill history.">
              <PlayerProfileEditor />
            </Section>
          </div>

          <div className="mt-6">
            <Section title="My Posts">
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
          <UpcomingEventsStrip events={upcomingEvents} />
          <Newsfeed />
        </Section>
      )}

      {active === 'matchmaking' && (
        <Section title="Matchmaking" compact>
          <MatchmakingPanel />
        </Section>
      )}

      {active === 'tournaments' && (
        <Section title="Tournament" compact>
          <MyTournamentRegistrations
            selectedTournamentId={selectedTournamentId}
            onSelectTournament={setSelectedTournamentId}
          />
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
    </DashboardShell>
  )
}
