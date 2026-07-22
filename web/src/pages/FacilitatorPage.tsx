import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchVenues } from '../lib/venueApi'
import { useAuth } from '../lib/AuthContext'
import { VenueMap } from '../components/venue/VenueMap'
import { VenueForm } from '../components/venue/VenueForm'
import { CourtEquipmentManager } from '../components/venue/CourtEquipmentManager'
import { VenueScheduleCalendar } from '../components/venue/VenueScheduleCalendar'
import { RegistrationApprovalQueue } from '../components/venue/RegistrationApprovalQueue'

export function FacilitatorPage() {
  const { user } = useAuth()
  const { data: venues, isLoading } = useQuery({ queryKey: ['facilitator', 'venues'], queryFn: fetchVenues })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const myVenues = (venues ?? []).filter((v) => v.facilitator_id === user?.id)
  const selected = myVenues.find((v) => v.id === selectedId) ?? myVenues[0] ?? null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Venue Facilitator</h1>
        <Link to="/dashboard" className="text-sm text-indigo-600">
          Back to dashboard
        </Link>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading venues...</p>}

      {myVenues.length > 0 && <VenueMap venues={myVenues} onSelect={(v) => setSelectedId(v.id)} />}

      <VenueForm />

      {myVenues.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {myVenues.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              className={`rounded px-2 py-1 text-xs ${
                selected?.id === v.id ? 'bg-indigo-600 text-white' : 'bg-gray-100'
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <CourtEquipmentManager venue={selected} />
          <div>
            <h3 className="mb-1 text-sm font-medium">Pending registration requests</h3>
            <RegistrationApprovalQueue venue={selected} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">Schedule</h3>
            <VenueScheduleCalendar venue={selected} />
          </div>
        </>
      )}
    </div>
  )
}
