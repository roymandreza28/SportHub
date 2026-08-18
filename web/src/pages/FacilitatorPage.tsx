import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyVenues, fetchVenueSchedule } from '../lib/venueApi'
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
import { VenueList } from '../components/venue/VenueList'
import { CreateVenueModal } from '../components/venue/CreateVenueModal'
import { VenueEditModal } from '../components/venue/VenueEditModal'
import { VenueScheduleCalendar } from '../components/venue/VenueScheduleCalendar'
import { RegistrationApprovalQueue } from '../components/venue/RegistrationApprovalQueue'
import { VenueBookingsList } from '../components/venue/VenueBookingsList'
import { ManualBookingForm } from '../components/venue/ManualBookingForm'
import { buttonGhost, buttonPrimary, select } from '../lib/formStyles'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'venues', label: 'Venues', icon: IconMapPin },
  { id: 'bookings', label: 'Bookings', icon: IconClipboard },
  { id: 'schedule', label: 'Schedule', icon: IconCalendar },
]

export function FacilitatorPage() {
  const queryClient = useQueryClient()
  const { data: venues, isLoading } = useQuery({ queryKey: ['facilitator', 'venues'], queryFn: fetchMyVenues })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [active, setActive] = useState(NAV_ITEMS[0].id)

  // Booking/pending counts on this query only change from actions taken
  // elsewhere (a player booking a slot, another session approving one) —
  // there's no live push for "one of my venues' booking counts changed", so
  // refetch whenever the facilitator actually looks at a tab that shows
  // those counts rather than trusting whatever was cached at page load.
  function handleNavigate(id: string) {
    setActive(id)
    if (id === 'bookings' || id === 'schedule') {
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })
    }
  }
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingVenueId, setEditingVenueId] = useState<number | null>(null)
  // Independent of `selectedId` (the Venues tab's court/equipment selection)
  // so opening a venue's bookings or schedule doesn't silently change what's
  // selected elsewhere, and so Bookings always lands on the venue list first
  // rather than jumping straight into whatever was last picked.
  const [bookingsVenueId, setBookingsVenueId] = useState<number | null>(null)
  const [scheduleVenueId, setScheduleVenueId] = useState<number | null>(null)
  const [showManualBookingForm, setShowManualBookingForm] = useState(false)

  const myVenues = venues ?? []
  const selected = myVenues.find((v) => v.id === selectedId) ?? myVenues[0] ?? null
  // Looked up by id every render (not stored as a snapshot) so that editing
  // courts/equipment inside the modal — which invalidates this same query —
  // is reflected immediately instead of showing stale data until reopened.
  const editingVenue = myVenues.find((v) => v.id === editingVenueId) ?? null
  const bookingsVenue = myVenues.find((v) => v.id === bookingsVenueId) ?? null
  const scheduleVenue = myVenues.find((v) => v.id === scheduleVenueId) ?? myVenues[0] ?? null

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
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={handleNavigate}>
      {active === 'overview' && (
        <>
          <div className="mb-6">
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
            description={
              selected ? `Approved bookings coming up at ${selected.name}.` : 'Select a venue to see its schedule.'
            }
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
                <button
                  onClick={() => setActive('bookings')}
                  className="text-sm font-medium text-teal-600 hover:text-teal-700"
                >
                  {pendingRequests.length} pending &rarr;
                </button>
              ) : undefined
            }
          />
        </>
      )}

      {active === 'venues' && (
        <Section
          title="Venues"
          description="Every venue you've registered. Deactivate one that's closed for a long time to hide it from players."
          action={
            <button onClick={() => setShowCreateModal(true)} className={buttonPrimary}>
              + Create Venue
            </button>
          }
        >
          {myVenues.length > 0 && <VenueMap venues={myVenues} onSelect={(v) => setSelectedId(v.id)} />}

          <div className="mt-4">
            <VenueList
              venues={myVenues}
              selectedId={selected?.id ?? null}
              onSelect={(v) => setSelectedId(v.id)}
              onEdit={(v) => setEditingVenueId(v.id)}
            />
          </div>

          {showCreateModal && <CreateVenueModal onClose={() => setShowCreateModal(false)} />}
          {editingVenue && <VenueEditModal venue={editingVenue} onClose={() => setEditingVenueId(null)} />}
        </Section>
      )}

      {active === 'bookings' && (
        <Section
          title="Bookings"
          description={
            bookingsVenue
              ? `Every booking at ${bookingsVenue.name} — approve or reject the pending ones.`
              : 'Pick a venue to see its bookings.'
          }
          action={
            bookingsVenue ? (
              <div className="flex items-center gap-4">
                <button onClick={() => setShowManualBookingForm(true)} className={buttonPrimary}>
                  + Add walk-in booking
                </button>
                <button onClick={() => setBookingsVenueId(null)} className={buttonGhost}>
                  &larr; Back to venues
                </button>
              </div>
            ) : undefined
          }
        >
          {bookingsVenue ? (
            <RegistrationApprovalQueue venue={bookingsVenue} />
          ) : (
            <VenueBookingsList venues={myVenues} onSelect={(v) => setBookingsVenueId(v.id)} />
          )}

          {bookingsVenue && showManualBookingForm && (
            <ManualBookingForm venue={bookingsVenue} onClose={() => setShowManualBookingForm(false)} />
          )}
        </Section>
      )}

      {active === 'schedule' && (
        <Section title="Schedule" description="Pick a venue to view its booking calendar.">
          {myVenues.length > 0 && (
            <select
              value={scheduleVenue?.id ?? ''}
              onChange={(e) => setScheduleVenueId(e.target.value ? Number(e.target.value) : null)}
              className={`${select} mb-4 max-w-xs`}
            >
              {myVenues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          {scheduleVenue ? (
            <VenueScheduleCalendar venue={scheduleVenue} />
          ) : (
            <p className="text-sm text-slate-500">No venues yet.</p>
          )}
        </Section>
      )}
    </DashboardShell>
  )
}
