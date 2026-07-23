import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchVenues, fetchVenueSchedule } from '../lib/venueApi'
import { useAuth } from '../lib/AuthContext'
import {
  DashboardShell,
  ListPreview,
  ListRow,
  Section,
  StatCard,
  StatCardGrid,
  StatusBadge,
  type NavItem,
} from '../components/layout/DashboardShell'
import { IconCalendar, IconClipboard, IconHome, IconMapPin } from '../components/layout/icons'
import { VenueMap } from '../components/venue/VenueMap'
import { VenueForm } from '../components/venue/VenueForm'
import { CourtEquipmentManager } from '../components/venue/CourtEquipmentManager'
import { VenueScheduleCalendar } from '../components/venue/VenueScheduleCalendar'
import { RegistrationApprovalQueue } from '../components/venue/RegistrationApprovalQueue'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'venues', label: 'Venues', icon: IconMapPin },
  { id: 'bookings', label: 'Bookings', icon: IconClipboard },
  { id: 'schedule', label: 'Schedule', icon: IconCalendar },
]

export function FacilitatorPage() {
  const { user } = useAuth()
  const { data: venues, isLoading } = useQuery({ queryKey: ['facilitator', 'venues'], queryFn: fetchVenues })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const myVenues = (venues ?? []).filter((v) => v.facilitator_id === user?.id)
  const selected = myVenues.find((v) => v.id === selectedId) ?? myVenues[0] ?? null

  const { data: schedule } = useQuery({
    queryKey: ['facilitator', 'schedule', selected?.id],
    queryFn: () => fetchVenueSchedule(selected!.id),
    enabled: !!selected,
  })

  const totalCourts = myVenues.reduce((sum, v) => sum + v.courts.length, 0)
  const totalEquipment = myVenues.reduce((sum, v) => sum + v.equipment.length, 0)
  const pendingRequests = (schedule ?? []).filter((e) => e.status === 'pending')
  const upcomingBookings = (schedule ?? [])
    .filter((e) => e.status === 'approved' && new Date(e.start) > new Date())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5)

  return (
    <DashboardShell navItems={NAV_ITEMS}>
      <div id="overview" className="mb-6 scroll-mt-24">
        <h1 className="text-2xl font-bold text-slate-900">Venue Facilitator</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your venues, courts, and bookings.</p>
      </div>

      <StatCardGrid>
        <StatCard label="Venues" value={myVenues.length} />
        <StatCard label="Courts" value={totalCourts} />
        <StatCard label="Equipment items" value={totalEquipment} />
        <StatCard label="Pending requests" value={selected ? pendingRequests.length : '-'} />
      </StatCardGrid>

      {isLoading && <p className="mb-8 text-sm text-slate-500">Loading venues...</p>}

      <ListPreview
        title="Upcoming Bookings"
        description={selected ? `Approved bookings coming up at ${selected.name}.` : 'Select a venue to see its schedule.'}
        emptyText={selected ? 'No upcoming approved bookings.' : 'No venue selected yet.'}
        rows={upcomingBookings.map((event) => (
          <ListRow
            key={event.id}
            primary={event.title}
            secondary={`${new Date(event.start).toLocaleString()} — ${new Date(event.end).toLocaleTimeString()}`}
            badge={<StatusBadge status={event.status} />}
          />
        ))}
        action={
          pendingRequests.length > 0 ? (
            <a href="#bookings" className="text-sm font-medium text-teal-600 hover:text-teal-700">
              {pendingRequests.length} pending &rarr;
            </a>
          ) : undefined
        }
      />

      <Section id="venues" title="Venues" description="Your venues on the map, and adding a new one.">
        {myVenues.length > 0 && <VenueMap venues={myVenues} onSelect={(v) => setSelectedId(v.id)} />}
        <div className="mt-4">
          <VenueForm />
        </div>

        {myVenues.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {myVenues.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  selected?.id === v.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <CourtEquipmentManager venue={selected} />
          </div>
        )}
      </Section>

      <Section
        id="bookings"
        title="Bookings"
        description={selected ? `Pending registration requests for ${selected.name}.` : 'Select a venue above.'}
      >
        {selected ? (
          <RegistrationApprovalQueue venue={selected} />
        ) : (
          <p className="text-sm text-slate-500">No venue selected yet.</p>
        )}
      </Section>

      <Section id="schedule" title="Schedule" description={selected ? selected.name : undefined}>
        {selected ? (
          <VenueScheduleCalendar venue={selected} />
        ) : (
          <p className="text-sm text-slate-500">No venue selected yet.</p>
        )}
      </Section>
    </DashboardShell>
  )
}
