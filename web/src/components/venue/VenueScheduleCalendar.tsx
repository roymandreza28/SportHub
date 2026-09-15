import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { fetchVenueSchedule, type Venue } from '../../lib/venueApi'
import { renderResourceLaneLabel, laneColumnClassNames, LaneGroupBanner, isLaneResource } from '../../lib/resourceLaneLabel'
import { useIsMobile } from '../../lib/useIsMobile'
import { select } from '../../lib/formStyles'

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
  const isMobile = useIsMobile()

  const resources = venue.courts.map((court) => ({ id: String(court.id), title: court.name }))
  const [selectedResourceId, setSelectedResourceId] = useState(resources[0]?.id ?? '')
  // On mobile, showing every court/lane side by side (even at their
  // scrunched-down minimum width — see minCalendarWidth below) still
  // overflows a phone screen for any 2+-court venue, let alone BRCC's 20
  // bowling lanes; there's no per-court width small enough to fit that many
  // and stay tappable. Narrowing to one resource at a time via the picker
  // below instead fills the full (narrow) width with zero horizontal
  // scrolling, which is what "mobile responsive" actually needs here —
  // desktop keeps the side-by-side view since it has the room for it.
  const visibleResources =
    isMobile && resources.length > 1 ? resources.filter((r) => r.id === selectedResourceId) : resources

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
  const laneCount = visibleResources.filter((r) => isLaneResource(r.title)).length
  const courtCount = visibleResources.length - laneCount
  const minCalendarWidth = 64 + courtCount * 130 + laneCount * 36
  const showPicker = isMobile && resources.length > 1

  return (
    <div className="flex flex-col gap-2">
      {showPicker && (
        <select
          value={selectedResourceId}
          onChange={(e) => setSelectedResourceId(e.target.value)}
          className={select}
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      )}
      <div className="overflow-x-auto rounded border p-2">
        <div style={{ minWidth: showPicker ? undefined : minCalendarWidth }}>
          <LaneGroupBanner resources={visibleResources}>
            <FullCalendar
              schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
              plugins={[resourceTimeGridPlugin, interactionPlugin]}
              initialView="resourceTimeGridDay"
              resources={visibleResources}
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
    </div>
  )
}
