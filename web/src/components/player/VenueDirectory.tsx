import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchVenues, type Venue } from '../../lib/venueApi'
import { VenueMap } from '../venue/VenueMap'

export function VenueDirectory({ onSelect, selectedId }: { onSelect: (venue: Venue) => void; selectedId?: number }) {
  const { data: venues, isLoading } = useQuery({ queryKey: ['venues'], queryFn: fetchVenues })
  const [search, setSearch] = useState('')

  const filtered = (venues ?? []).filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">Venues</h3>
      <input
        type="text"
        placeholder="Search venues"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
      />

      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}

      <VenueMap venues={filtered} onSelect={onSelect} />

      <ul className="flex flex-col gap-1 text-sm">
        {filtered.map((venue) => (
          <li key={venue.id}>
            <button
              onClick={() => onSelect(venue)}
              className={`w-full rounded px-2 py-1 text-left ${
                selectedId === venue.id ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100'
              }`}
            >
              {venue.name} — {venue.address}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
