import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchVenues, type Venue } from '../../lib/venueApi'
import { VenueMap } from '../venue/VenueMap'
import { input } from '../../lib/formStyles'

export function VenueDirectory({ onSelect, selectedId }: { onSelect: (venue: Venue) => void; selectedId?: number }) {
  const { data: venues, isLoading } = useQuery({ queryKey: ['venues'], queryFn: fetchVenues })
  const [search, setSearch] = useState('')

  const filtered = (venues ?? []).filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Search venues"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${input} max-w-sm`}
      />

      {isLoading && <p className="text-sm text-slate-500">Loading...</p>}

      <VenueMap venues={filtered} onSelect={onSelect} />

      <ul className="flex flex-col gap-1.5">
        {filtered.map((venue) => (
          <li key={venue.id}>
            <button
              onClick={() => onSelect(venue)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === venue.id
                  ? 'bg-teal-600 font-medium text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {venue.name} — <span className={selectedId === venue.id ? 'text-teal-50' : 'text-slate-500'}>{venue.address}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
