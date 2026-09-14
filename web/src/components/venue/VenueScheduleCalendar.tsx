import { useQuery } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { fetchVenueSchedule, type Venue } from '../../lib/venueApi'
import { renderResourceLaneLabel, laneColumnClassNames, LaneGroupBanner, isLaneResource } from '../../lib/resourceLaneLabel'

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

  const hasFixedHours = Boolean(venue.opens_at && venue.closes_at)

  // FullCalendar's resource-timegrid stretches every non-lane column to
  // fill 100% of its container width — fine on desktop, but on a phone
  // screen a handful of courts (let alone BRCC's 20 bowling lanes) get
  // squeezed down to illegibly thin slivers. Rather than let columns
  // shrink to fit, give each a sane minimum width and let the OUTER
  // container scroll horizontally instead — the calendar stays readable,
  // a swipe reveals whatever's off-screen. Only a floor: on a wide screen
  // this min-width sits well under the available space, so nothing here
  // changes for desktop. Lane columns already get their own fixed 36px
  // width via .fc-lane-col (index.css), so they're budgeted separately
  // rather than at a full court's width.
  const laneCount = resources.filter((r) => isLaneResource(r.title)).length
  const courtCount = resources.length - laneCount
  const minCalendarWidth = 64 + courtCount * 130 + laneCount * 36

  return (
    <div className="overflow-x-auto rounded border p-2">
      <div style={{ minWidth: minCalendarWidth }}>
        <LaneGroupBanner resources={resources}>
          <FullCalendar
            schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
            plugins={[resourceTimeGridPlugin, interactionPlugin]}
            initialView="resourceTimeGridDay"
            resources={resources}
            events={events}
            height="auto"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
            resourceLabelContent={renderResourceLaneLabel}
            resourceLabelClassNames={laneColumnClassNames}
            resourceLaneClassNames={laneColumnClassNames}
            {...(hasFixedHours
              ? {
                  businessHours: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: venue.opens_at!, endTime: venue.closes_at! },
                  slotMinTime: venue.opens_at!,
                  slotMaxTime: venue.closes_at!,
                }
              : {})}
          />
        </LaneGroupBanner>
      </div>
    </div>
  )
}
