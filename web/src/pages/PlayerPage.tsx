import { useState } from 'react'
import { Link } from 'react-router'
import type { Venue } from '../lib/venueApi'
import { VenueDirectory } from '../components/player/VenueDirectory'
import { VenueRegistrationForm } from '../components/player/VenueRegistrationForm'
import { PlayerProfileEditor } from '../components/player/PlayerProfileEditor'
import { MatchmakingPanel } from '../components/player/MatchmakingPanel'

export function PlayerPage() {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Player</h1>
        <Link to="/dashboard" className="text-sm text-indigo-600">
          Back to dashboard
        </Link>
      </div>

      <PlayerProfileEditor />
      <MatchmakingPanel />

      <VenueDirectory onSelect={setSelectedVenue} selectedId={selectedVenue?.id} />
      {selectedVenue && <VenueRegistrationForm venue={selectedVenue} />}
    </div>
  )
}
