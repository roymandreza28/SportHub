import { useQuery } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg } from '@fullcalendar/core'
import { fetchVenueAvailability, type Venue } from '../../lib/venueApi'

// Matchmaking never picks a specific court (see MatchmakingRequestController
// ::store(), which always reserves venue-wide — court_id null), so unlike
// VenueRegistrationForm's resourceTimeGridDay (one column per court), this
// is a single-column day view: every existing booking at this venue, on any
// court, blocks the slot — a venue-wide reservation can't coexist with a
// court-specific one either (see VenueRegistration::hasOverlap()).
export function MatchVenueScheduler({
  venue,
  onSelect,
}: {
  venue: Venue
  onSelect: (selection: { start: string; end: string }) => void
}) {
  const { data: busy } = useQuery({
    queryKey: ['player', 'availability', venue.id],
    queryFn: () => fetchVenueAvailability(venue.id),
  })

  // Earliest pickable start — "not in the past" is already implied by this,
  // since now()+3h is always later than now().
  const minStart = new Date(Date.now() + 3 * 60 * 60 * 1000)

  function handleSelect(info: DateSelectArg) {
    if (info.start < minStart) return
    onSelect({ start: info.start.toISOString(), end: info.end.toISOString() })
  }

  const busyEvents = (busy ?? []).map((b) => ({
    id: `busy-${b.id}`,
    title: b.title,
    start: b.start,
    end: b.end,
    color: '#9ca3af',
    editable: false,
  }))

  // A shaded background block, not just a functional block on drag-select —
  // "already booked" is visible as grey busy events above, so "too soon to
  // book" needs its own equally-visible reason or it just looks like a
  // silent, unexplained failure to select. Spans from the epoch (rather than
  // just "today") so it still renders correctly if minStart spills past
  // midnight into the next calendar day.
  const tooSoonEvent = {
    id: 'too-soon',
    start: new Date(0).toISOString(),
    end: minStart.toISOString(),
    display: 'background' as const,
    color: '#fca5a5',
  }

  const hasFixedHours = Boolean(venue.opens_at && venue.closes_at)

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-slate-500">
        Pick a free slot (grey = already booked, red = too soon — matches must be booked at least 3 hours ahead).
        Earliest available: {minStart.toLocaleString()}
        {hasFixedHours && ` — open ${venue.opens_at?.slice(0, 5)}–${venue.closes_at?.slice(0, 5)}`}
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridDay"
          events={[tooSoonEvent, ...busyEvents]}
          selectable
          selectOverlap={false}
          // FullCalendar's own validRange keeps every day before today
          // entirely un-navigable — the harder "at least 3 hours from now"
          // rule (which today itself is still subject to) can't be
          // expressed by validRange (it's date-only, not time-of-day), so
          // selectAllow enforces it too: the drag-select itself refuses to
          // start inside the next 3 hours, rather than letting the user
          // drag a selection there and only rejecting it silently on drop.
          validRange={{ start: new Date().toISOString().slice(0, 10) }}
          selectAllow={(span) => span.start >= minStart}
          select={handleSelect}
          height="auto"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          {...(hasFixedHours
            ? {
                businessHours: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: venue.opens_at!, endTime: venue.closes_at! },
                selectConstraint: 'businessHours',
                slotMinTime: venue.opens_at!,
                slotMaxTime: venue.closes_at!,
              }
            : {})}
        />
      </div>
    </div>
  )
}
