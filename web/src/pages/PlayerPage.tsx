import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Venue } from '../lib/venueApi'
import { fetchMySkillLevels, fetchMyMatchmakingRequests, fetchMyVenueRegistrations } from '../lib/playerApi'
import { DashboardShell, Section, StatCard, StatCardGrid, type NavItem } from '../components/layout/DashboardShell'
import { IconCalendar, IconHome, IconMapPin, IconTarget, IconUsers } from '../components/layout/icons'
import { VenueDirectory } from '../components/player/VenueDirectory'
import { VenueRegistrationForm } from '../components/player/VenueRegistrationForm'
import { PlayerProfileEditor } from '../components/player/PlayerProfileEditor'
import { MatchmakingPanel } from '../components/player/MatchmakingPanel'
import { MyBookings } from '../components/player/MyBookings'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'profile', label: 'Profile', icon: IconUsers },
  { id: 'matchmaking', label: 'Matchmaking', icon: IconTarget },
  { id: 'bookings', label: 'Bookings', icon: IconCalendar },
  { id: 'venues', label: 'Venues', icon: IconMapPin },
]

export function PlayerPage() {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)

  const { data: skillLevels } = useQuery({ queryKey: ['skill-levels', 'mine'], queryFn: fetchMySkillLevels })
  const { data: matchmaking } = useQuery({ queryKey: ['player', 'matchmaking'], queryFn: fetchMyMatchmakingRequests })
  const { data: bookings } = useQuery({ queryKey: ['player', 'venue-registrations'], queryFn: fetchMyVenueRegistrations })

  const openRequests = (matchmaking ?? []).filter((r) => r.status === 'open').length

  return (
    <DashboardShell navItems={NAV_ITEMS}>
      <div id="overview" className="mb-6 scroll-mt-24">
        <h1 className="text-2xl font-bold text-slate-900">Player</h1>
        <p className="mt-1 text-sm text-slate-500">Your profile, matches, and bookings.</p>
      </div>

      <StatCardGrid>
        <StatCard label="Skill levels tracked" value={skillLevels?.length ?? '-'} />
        <StatCard label="Open matchmaking requests" value={openRequests} />
        <StatCard label="Bookings" value={bookings?.length ?? '-'} />
      </StatCardGrid>

      <Section id="profile" title="Profile" description="Your bio, primary sport, and skill history.">
        <PlayerProfileEditor />
      </Section>

      <Section id="matchmaking" title="Matchmaking" description="Find an opponent for a sport, live.">
        <MatchmakingPanel />
      </Section>

      <Section id="bookings" title="Bookings" description="Venue slots you've requested.">
        <MyBookings />
      </Section>

      <Section id="venues" title="Venues" description="Browse venues and request a booking.">
        <VenueDirectory onSelect={setSelectedVenue} selectedId={selectedVenue?.id} />
        {selectedVenue && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <VenueRegistrationForm venue={selectedVenue} />
          </div>
        )}
      </Section>
    </DashboardShell>
  )
}
