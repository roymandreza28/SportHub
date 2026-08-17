import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { Venue } from '../lib/venueApi'
import {
  fetchMySkillLevels,
  fetchMyMatchmakingRequests,
  fetchMyVenueRegistrations,
  fetchMyTournamentRegistrationsAsPlayer,
} from '../lib/playerApi'
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
import { IconCalendar, IconHome, IconMapPin, IconNewspaper, IconTarget, IconTrophy, IconUsers } from '../components/layout/icons'
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
import { buttonSecondary } from '../lib/formStyles'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'profile', label: 'Profile', icon: IconUsers },
  { id: 'newsfeed', label: 'Newsfeed', icon: IconNewspaper },
  { id: 'matchmaking', label: 'Matchmaking', icon: IconTarget },
  { id: 'tournaments', label: 'Tournament', icon: IconTrophy },
  { id: 'bookings', label: 'Bookings', icon: IconCalendar },
  { id: 'venues', label: 'Venues', icon: IconMapPin },
]

export function PlayerPage() {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [searchParams] = useSearchParams()
  const [active, setActive] = useState(searchParams.get('tab') ?? NAV_ITEMS[0].id)
  const { openChatWindow } = useChatUI()
  const { user } = useAuth()

  const { data: skillLevels } = useQuery({ queryKey: ['skill-levels', 'mine'], queryFn: fetchMySkillLevels })
  const { data: matchmaking } = useQuery({ queryKey: ['player', 'matchmaking'], queryFn: fetchMyMatchmakingRequests })
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

  const openRequests = (matchmaking ?? []).filter((r) => r.status === 'open').length

  const now = Date.now()
  type UpcomingEvent = { key: string; date: string; primary: string; secondary: string; status: string }

  const upcomingBookingEvents: UpcomingEvent[] = (bookings ?? [])
    .filter((b) => b.status === 'approved' && new Date(b.ends_at).getTime() > now)
    .map((b) => ({
      key: `booking-${b.id}`,
      date: b.starts_at,
      primary: b.court ? `${b.venue.name} — ${b.court.name}` : b.venue.name,
      secondary: `${new Date(b.starts_at).toLocaleString()} — ${new Date(b.ends_at).toLocaleTimeString()}`,
      status: b.status,
    }))

  const upcomingTournamentEvents: UpcomingEvent[] = (tournamentRegistrations ?? [])
    .filter((r) => r.tournament.status !== 'completed' && r.tournament.status !== 'cancelled')
    .map((r) => ({
      key: `tournament-${r.tournament.id}`,
      date: r.tournament.starts_at,
      primary: r.tournament.name,
      secondary: `${r.tournament.sport.name}${r.tournament.venue ? ` — ${r.tournament.venue.name}` : ''} — ${new Date(r.tournament.starts_at).toLocaleDateString()}`,
      status: r.tournament.status,
    }))

  const upcomingEvents = [...upcomingBookingEvents, ...upcomingTournamentEvents]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)

  return (
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={setActive}>
      {active === 'overview' && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Player</h1>
            <p className="mt-1 text-sm text-slate-500">Your profile, matches, and bookings.</p>
          </div>

          <StatCardGrid>
            <StatCard label="Skill levels tracked" value={skillLevels?.length ?? '-'} />
            <StatCard label="Open matchmaking requests" value={openRequests} />
            <StatCard label="Bookings" value={bookings?.length ?? '-'} />
          </StatCardGrid>

          <ListPreview
            title="My Upcoming Events"
            description="Approved bookings and ongoing tournaments you're part of, soonest first."
            emptyText="No upcoming events — visit Venues to request a booking."
            rows={upcomingEvents.map((e) => (
              <ListRow key={e.key} primary={e.primary} secondary={e.secondary} badge={<StatusBadge status={e.status} />} />
            ))}
            action={
              <button
                onClick={() => setActive('venues')}
                className="text-sm font-medium text-teal-600 hover:text-teal-700"
              >
                Browse venues &rarr;
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
        <Section title="Newsfeed" description="News from organizers — react, comment, and share with friends.">
          <Newsfeed />
        </Section>
      )}

      {active === 'matchmaking' && (
        <Section title="Matchmaking" description="Find an opponent for a sport, live.">
          <MatchmakingPanel />
        </Section>
      )}

      {active === 'tournaments' && (
        <Section title="Tournament" description="Tournaments you're registered in, and their results.">
          <MyTournamentRegistrations
            selectedTournamentId={selectedTournamentId}
            onSelectTournament={setSelectedTournamentId}
          />
        </Section>
      )}

      {active === 'bookings' && (
        <Section title="Bookings" description="Venue slots you've requested.">
          <MyBookings />
        </Section>
      )}

      {active === 'venues' && (
        <Section title="Venues" description="Browse venues and request a booking.">
          <VenueDirectory onSelect={setSelectedVenue} selectedId={selectedVenue?.id} />
          {selectedVenue && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <VenueRegistrationForm venue={selectedVenue} />
            </div>
          )}
        </Section>
      )}
    </DashboardShell>
  )
}
