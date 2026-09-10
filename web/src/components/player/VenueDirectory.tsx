import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchVenues, type Venue } from '../../lib/venueApi'
import { VenueMap } from '../venue/VenueMap'
import { input } from '../../lib/formStyles'
import { IconChevronDown } from '../layout/icons'

export function VenueDirectory({ onSelect, selectedId }: { onSelect: (venue: Venue) => void; selectedId?: number }) {
  const { data: venues, isLoading } = useQuery({ queryKey: ['venues'], queryFn: () => fetchVenues() })
  const [search, setSearch] = useState('')
  // Collapsed by default — the map's own pin popups (name, address, photo,
  // sports, price/hours) already cover what this plain list showed, so it's
  // now just a secondary "search/scan by name" view a player can open on
  // demand instead of a full-length list always taking up the page.
  const [showList, setShowList] = useState(false)

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

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowList((s) => !s)}
          aria-expanded={showList}
          className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {showList ? 'Hide venue list' : `Show venue list (${filtered.length})`}
          <IconChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showList ? 'rotate-180' : ''}`} />
        </button>

        {showList && (
          <ul className="flex flex-col gap-1.5">
            {filtered.map((venue) => (
              <li key={venue.id}>
                <button
                  onClick={() => onSelect(venue)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    selectedId === venue.id
                      ? 'bg-teal-600 font-medium text-pure-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {venue.name} — <span className={selectedId === venue.id ? 'text-teal-50' : 'text-slate-500'}>{venue.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
