import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyVenues, fetchVenueSchedule, exportVenueBookings } from '../lib/venueApi'
import { extractDownloadErrorMessage } from '../lib/api'
import {
  DashboardShell,
  ListPreview,
  ListRow,
  Section,
  StatCard,
  StatusBadge,
  type NavItem,
} from '../components/layout/DashboardShell'
import { IconCalendar, IconChevronDown, IconClipboard, IconFileText, IconHome, IconMapPin, IconTrophy } from '../components/layout/icons'
import { VenueMap } from '../components/venue/VenueMap'
import { VenueList } from '../components/venue/VenueList'
import { CreateVenueModal } from '../components/venue/CreateVenueModal'
import { VenueEditModal } from '../components/venue/VenueEditModal'
import { VenueScheduleCalendar } from '../components/venue/VenueScheduleCalendar'
import { RegistrationApprovalQueue } from '../components/venue/RegistrationApprovalQueue'
import { VenueBookingsList } from '../components/venue/VenueBookingsList'
import { ManualBookingForm } from '../components/venue/ManualBookingForm'
import { NewsEditor } from '../components/organizer/NewsEditor'
import { NewsFeed } from '../components/organizer/NewsFeed'
import { useTabParam } from '../lib/useTabParam'
import { buttonGhost, buttonPrimary, select } from '../lib/formStyles'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'venues', label: 'Venues', icon: IconMapPin },
  { id: 'bookings', label: 'Bookings', icon: IconClipboard },
  { id: 'schedule', label: 'Schedule', icon: IconCalendar },
  // Reuses the organizer's own NewsEditor/NewsFeed — backend grants
  // 'manage news' to venue_facilitator too (see RolesAndPermissionsSeeder),
  // and neither component assumes the organizer role.
  { id: 'news', label: 'News', icon: IconFileText },
  // Not an in-page tab like the rest — handleNavigate() below sends this
  // one to /organizer instead, which already has the full tournament
  // create/bracket/schedule UI (also granted to this role — see
  // RolesAndPermissionsSeeder's 'manage tournaments' comment) rather than
  // duplicating that entire page's logic here.
  { id: 'tournaments', label: 'Tournaments', icon: IconTrophy },
]

const MONTHLY_TRENDS = [
  { month: 'Jan', bookings: 18, occupancy: 62 },
  { month: 'Feb', bookings: 24, occupancy: 68 },
  { month: 'Mar', bookings: 29, occupancy: 71 },
  { month: 'Apr', bookings: 36, occupancy: 75 },
  { month: 'May', bookings: 41, occupancy: 79 },
  { month: 'Jun', bookings: 48, occupancy: 84 },
]

function TrendChart({ data }: { data: number[] }) {
  const width = 460
  const height = 170
  const padding = 20
  const maxValue = Math.max(...data)
  const minValue = Math.min(...data)
  const range = Math.max(maxValue - minValue, 1)

  const points = data
    .map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (width - padding * 2)
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label="Monthly facilitator trend chart">
      <defs>
        <linearGradient id="facilitator-trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(59,130,246,0.28)" />
          <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
        </linearGradient>
      </defs>

      {[0, 1, 2, 3].map((line) => (
        <line
          key={line}
          x1={padding}
          x2={width - padding}
          y1={padding + line * 34}
          y2={padding + line * 34}
          stroke="rgba(148,163,184,0.18)"
          strokeDasharray="4 6"
        />
      ))}

      <polyline fill="none" stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <polygon points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} fill="url(#facilitator-trend-fill)" opacity="0.95" />
    </svg>
  )
}

function PerformanceBars({ values }: { values: number[] }) {
  const max = Math.max(...values)

  return (
    <div className="mt-4 flex h-36 items-end gap-3">
      {values.map((value, index) => (
        <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="flex h-full w-full items-end justify-center rounded-t-2xl bg-gradient-to-t from-blue-600 to-cyan-400/90 shadow-[0_10px_24px_rgba(59,130,246,0.18)]"
            style={{ height: `${(value / max) * 100}%` }}
          />
          <span className="text-[11px] font-medium text-slate-500">{['J', 'F', 'M', 'A', 'M', 'J'][index]}</span>
        </div>
      ))}
    </div>
  )
}

export function FacilitatorPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: venues, isLoading } = useQuery({ queryKey: ['facilitator', 'venues'], queryFn: fetchMyVenues })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [active, setActive] = useTabParam(NAV_ITEMS[0].id)

  // Booking/pending counts on this query only change from actions taken
  // elsewhere (a player booking a slot, another session approving one) —
  // there's no live push for "one of my venues' booking counts changed", so
  // refetch whenever the facilitator actually looks at a tab that shows
  // those counts rather than trusting whatever was cached at page load.
  function handleNavigate(id: string) {
    if (id === 'tournaments') {
      navigate('/organizer?tab=tournaments')
      return
    }
    setActive(id)
    if (id === 'bookings' || id === 'schedule') {
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })
    }
  }
  const [showCreateModal, setShowCreateModal] = useState(false)
  // Collapsed by default, same reasoning as the player-facing venue
  // directory — the map above already shows each venue's name/address/
  // photo on hover, so the full action list (Edit/Deactivate/Delete per
  // venue) is now an on-demand expansion rather than always taking up the
  // page.
  const [showVenueList, setShowVenueList] = useState(false)
  const [editingVenueId, setEditingVenueId] = useState<number | null>(null)
  // Independent of `selectedId` (the Venues tab's court/equipment selection)
  // so opening a venue's bookings or schedule doesn't silently change what's
  // selected elsewhere, and so Bookings always lands on the venue list first
  // rather than jumping straight into whatever was last picked.
  const [bookingsVenueId, setBookingsVenueId] = useState<number | null>(null)
  const [scheduleVenueId, setScheduleVenueId] = useState<number | null>(null)
  const [showManualBookingForm, setShowManualBookingForm] = useState(false)
  const [exportingBookings, setExportingBookings] = useState(false)
  const [exportBookingsError, setExportBookingsError] = useState<string | null>(null)

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
  const totalBookings = myVenues.reduce((sum, venue) => sum + (venue.venue_registrations_count ?? 0), 0)
  const topVenues = [...myVenues]
    .map((venue) => ({
      name: venue.name,
      bookings: venue.venue_registrations_count ?? 0,
      pending: venue.pending_bookings_count ?? 0,
    }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 4)
  const trendData = MONTHLY_TRENDS.map((item) => item.bookings)
  const insights = [
    { title: 'Occupancy', value: '+18%', description: 'Utilization is trending upward this month' },
    { title: 'Approved bookings', value: `${Math.max(totalBookings, 0)}`, description: 'Confirmed venue activity across your portfolio' },
    { title: 'Pending review', value: `${pendingRequests.length}`, description: 'Requests still awaiting approval' },
  ]

  return (
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={handleNavigate}>
      {active === 'overview' && (
        <>
          <div className="mb-8 overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-700 p-6 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-200/80">Operations overview</p>
                <h1 className="mt-2 text-3xl font-bold text-pure-white sm:text-4xl">Venue Facilitator Dashboard</h1>
                <p className="mt-2 max-w-xl text-sm text-slate-200 sm:text-base">
                  Monitor venue performance, upcoming bookings, and the actions that need your attention across all managed facilities.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-50 backdrop-blur-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
                {upcomingBookings.length} upcoming bookings
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">Active venues</p>
                <p className="mt-2 text-3xl font-bold text-white">{myVenues.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">Pending requests</p>
                <p className="mt-2 text-3xl font-bold text-white">{pendingRequests.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">Total bookings</p>
                <p className="mt-2 text-3xl font-bold text-white">{totalBookings}</p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <p className="mb-8 text-sm text-slate-500">Loading venue metrics...</p>
          ) : (
            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Venues" value={myVenues.length} />
              <StatCard label="Courts" value={totalCourts} />
              <StatCard label="Equipment" value={totalEquipment} />
              <StatCard label="Pending" value={pendingRequests.length} />
            </div>
          )}

          <div className="mb-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Monthly trends</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">Booking momentum</h2>
                </div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">+21.4%</div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
                <div>
                  <TrendChart data={trendData} />
                  <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                    {MONTHLY_TRENDS.map((item) => (
                      <span key={item.month}>{item.month}</span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Bookings</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{MONTHLY_TRENDS[MONTHLY_TRENDS.length - 1].bookings}</p>
                    <p className="mt-1 text-xs text-emerald-600">Up from {MONTHLY_TRENDS[0].bookings} in Jan</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Occupancy</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{MONTHLY_TRENDS[MONTHLY_TRENDS.length - 1].occupancy}%</p>
                    <p className="mt-1 text-xs text-blue-600">Average venue utilization</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-slate-900 p-6 text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Insights</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What needs attention</h2>
              <div className="mt-5 space-y-3">
                {insights.map((card) => (
                  <div key={card.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-200">{card.title}</span>
                      <span className="text-lg font-bold text-cyan-400">{card.value}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{card.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-8 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Performance</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">Past 6 months</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Bookings</span>
              </div>
              <PerformanceBars values={trendData} />
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top venues</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">Your busiest spaces</h2>
                </div>
              </div>

              <div className="space-y-3">
                {topVenues.length > 0 ? (
                  topVenues.map((venue, index) => (
                    <div key={venue.name} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{venue.name}</p>
                          <p className="text-xs text-slate-500">{venue.pending} pending approvals</p>
                        </div>
                      </div>
                      <span className="text-lg font-bold text-slate-900">{venue.bookings}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No venue booking data available yet.</p>
                )}
              </div>
            </div>
          </div>

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

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowVenueList((s) => !s)}
              aria-expanded={showVenueList}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {showVenueList ? 'Hide venue list' : `Show venue list (${myVenues.length})`}
              <IconChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showVenueList ? 'rotate-180' : ''}`} />
            </button>

            {showVenueList && (
              <VenueList
                venues={myVenues}
                selectedId={selected?.id ?? null}
                onSelect={(v) => setSelectedId(v.id)}
                onEdit={(v) => setEditingVenueId(v.id)}
              />
            )}
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
                <button
                  onClick={async () => {
                    setExportingBookings(true)
                    setExportBookingsError(null)
                    try {
                      await exportVenueBookings(bookingsVenue.id)
                    } catch (error) {
                      setExportBookingsError(await extractDownloadErrorMessage(error))
                    } finally {
                      setExportingBookings(false)
                    }
                  }}
                  disabled={exportingBookings}
                  className={buttonGhost}
                >
                  {exportingBookings ? 'Exporting...' : 'Export bookings (CSV)'}
                </button>
                <button onClick={() => setBookingsVenueId(null)} className={buttonGhost}>
                  &larr; Back to venues
                </button>
              </div>
            ) : undefined
          }
        >
          {exportBookingsError && <p className="mb-3 text-xs text-red-600">{exportBookingsError}</p>}
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

      {active === 'news' && (
        <Section title="News" description="Publish an update for the community.">
          <NewsEditor />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <NewsFeed />
          </div>
        </Section>
      )}
    </DashboardShell>
  )
}
