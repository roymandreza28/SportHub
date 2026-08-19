import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchVenue } from '../../lib/venueApi'
import { VenueMap } from '../venue/VenueMap'
import { BracketView } from '../organizer/BracketView'
import { StatusBadge } from './DashboardShell'
import { IconChevronLeft, IconMapPin, IconTrophy, IconX } from './icons'
import type { MyVenueRegistration } from '../../lib/playerApi'

// Deliberately structural (not tied to PlayerTournamentRegistration or
// CoachTournamentRegistration specifically) — both Player's and Coach's own
// registration types already nest a tournament shaped like this, so either
// can feed this component without an adapter.
export type UpcomingTournamentInfo = {
  id: number
  name: string
  status: string
  starts_at: string
  sport: { name: string }
  venue: { id: number; name: string } | null
}

// A booking already carries its venue's address/lat/lng inline; a tournament
// only carries {id, name} for its venue, so that branch needs its own
// on-demand fetch to get map-able coordinates.
export type UpcomingEventData =
  | { kind: 'booking'; booking: MyVenueRegistration }
  | { kind: 'tournament'; tournament: UpcomingTournamentInfo }

export type UpcomingEventCardData = {
  key: string
  primary: string
  secondary: string
  status: string
} & UpcomingEventData

function EventDetailModal({ event, onClose }: { event: UpcomingEventCardData; onClose: () => void }) {
  const tournamentVenueId = event.kind === 'tournament' ? event.tournament.venue?.id : undefined

  const { data: fullVenue, isLoading: venueLoading } = useQuery({
    queryKey: ['venue', tournamentVenueId],
    queryFn: () => fetchVenue(tournamentVenueId!),
    enabled: event.kind === 'tournament' && tournamentVenueId != null,
  })

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        // A bracket needs real horizontal room to lay out rounds side by
        // side — widen the modal for tournament events, where the booking
        // branch's card-of-details stays comfortable at max-w-sm.
        className={`w-full max-h-[85vh] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl ${
          event.kind === 'tournament' ? 'max-w-3xl' : 'max-w-sm'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{event.primary}</p>
            <p className="mt-0.5 text-xs text-slate-500">{event.secondary}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-600">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3">
          <StatusBadge status={event.status} />
        </div>

        <div className="mt-4 flex flex-col gap-2 text-xs text-slate-600">
          {event.kind === 'booking' ? (
            <>
              <p>
                <span className="font-semibold text-slate-700">When:</span>{' '}
                {new Date(event.booking.starts_at).toLocaleString()} &ndash;{' '}
                {new Date(event.booking.ends_at).toLocaleTimeString()}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Where:</span> {event.booking.venue.name}
                {event.booking.court ? ` — ${event.booking.court.name}` : ''}
              </p>
              <p className="text-slate-500">{event.booking.venue.address}</p>
              <div className="mt-1 overflow-hidden rounded-lg">
                <VenueMap venues={[event.booking.venue]} />
              </div>
            </>
          ) : (
            <>
              <p>
                <span className="font-semibold text-slate-700">When:</span>{' '}
                {new Date(event.tournament.starts_at).toLocaleString()}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Sport:</span> {event.tournament.sport.name}
              </p>
              {event.tournament.venue ? (
                <>
                  <p>
                    <span className="font-semibold text-slate-700">Where:</span> {event.tournament.venue.name}
                  </p>
                  {venueLoading && <p className="text-slate-400">Loading map...</p>}
                  {fullVenue && (
                    <>
                      <p className="text-slate-500">{fullVenue.address}</p>
                      <div className="mt-1 overflow-hidden rounded-lg">
                        <VenueMap venues={[fullVenue]} />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-slate-400">Venue not assigned yet.</p>
              )}
            </>
          )}
        </div>

        {event.kind === 'tournament' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bracket</p>
            <BracketView tournamentId={event.tournament.id} />
          </div>
        )}
      </div>
    </div>
  )
}

// A Facebook-"Stories"-style horizontal swipe strip, sitting above the
// Newsfeed content — identical markup on mobile and desktop, a plain
// overflow-x-auto row that swipes natively on touch and scrolls/drags with
// a mouse on desktop. Shared by Player (bookings + tournament
// registrations) and Coach (tournament registrations only) newsfeed tabs.
export function UpcomingEventsStrip({
  events,
  title = 'My Upcoming Events',
}: {
  events: UpcomingEventCardData[]
  title?: string
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = events.find((e) => e.key === selectedKey) ?? null
  const scrollRef = useRef<HTMLDivElement>(null)

  if (events.length === 0) return null

  function slide(direction: 'left' | 'right') {
    scrollRef.current?.scrollBy({ left: direction === 'left' ? -240 : 240, behavior: 'smooth' })
  }

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="relative">
        {/* Cards already swipe natively on touch — these are just an extra
            click target for a mouse/trackpad, so they're transparent (icon
            only, no button chrome) rather than competing visually with the
            cards themselves. */}
        <button
          onClick={() => slide('left')}
          aria-label="Scroll left"
          className="absolute -left-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-transparent text-slate-500 transition hover:text-slate-900"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => slide('right')}
          aria-label="Scroll right"
          className="absolute -right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-transparent text-slate-500 transition hover:text-slate-900"
        >
          <IconChevronLeft className="h-5 w-5 rotate-180" />
        </button>

        <div
          ref={scrollRef}
          className="flex scroll-smooth justify-center gap-3 overflow-x-auto px-8 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {events.map((e) => (
            <button
              key={e.key}
              onClick={() => setSelectedKey(e.key)}
              className="flex w-36 shrink-0 flex-col items-start gap-2 rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                {e.kind === 'booking' ? <IconMapPin className="h-4 w-4" /> : <IconTrophy className="h-4 w-4" />}
              </div>
              <p className="line-clamp-2 text-xs font-semibold text-slate-800">{e.primary}</p>
              <p className="line-clamp-2 text-[11px] text-slate-500">{e.secondary}</p>
              <StatusBadge status={e.status} />
            </button>
          ))}
        </div>
      </div>

      {selected && <EventDetailModal event={selected} onClose={() => setSelectedKey(null)} />}
    </div>
  )
}
