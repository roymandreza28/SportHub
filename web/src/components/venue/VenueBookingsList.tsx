import type { Venue } from '../../lib/venueApi'

export function VenueBookingsList({ venues, onSelect }: { venues: Venue[]; onSelect: (venue: Venue) => void }) {
  if (venues.length === 0) {
    return <p className="text-sm text-slate-400">No venues yet — create one under the Venues tab first.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {venues.map((venue) => (
        <li key={venue.id}>
          <button
            type="button"
            onClick={() => onSelect(venue)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:bg-slate-50"
          >
            <div>
              <p className="font-medium text-slate-800">{venue.name}</p>
              <p className="text-xs text-slate-500">{venue.address}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!!venue.pending_bookings_count && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                  {venue.pending_bookings_count} pending
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {venue.venue_registrations_count ?? 0} booking{venue.venue_registrations_count === 1 ? '' : 's'}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
