import { useQuery } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { fetchVenueSchedule, type Venue } from '../../lib/venueApi'

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#16a34a',
  rejected: '#dc2626',
  cancelled: '#9ca3af',
}

export function VenueScheduleCalendar({ venue }: { venue: Venue }) {
  const { data } = useQuery({
    queryKey: ['facilitator', 'schedule', venue.id],
    queryFn: () => fetchVenueSchedule(venue.id),
  })

  const resources = venue.courts.map((court) => ({ id: String(court.id), title: court.name }))
  const events = (data ?? []).map((event) => ({
    id: String(event.id),
    title: event.title,
    start: event.start,
    end: event.end,
    resourceId: event.resourceId ? String(event.resourceId) : undefined,
    color: STATUS_COLORS[event.status],
  }))

  return (
    <div className="rounded border p-2">
      <FullCalendar
        plugins={[resourceTimeGridPlugin, interactionPlugin]}
        initialView="resourceTimeGridDay"
        resources={resources}
        events={events}
        height="auto"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
      />
    </div>
  )
}
