import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg } from '@fullcalendar/core'
import { fetchVenueAvailability, calculateVenueRent, formatPeso, type Venue } from '../../lib/venueApi'
import { createVenueRegistration, type CreatedVenueRegistration } from '../../lib/playerApi'
import { useChatUI } from '../../lib/ChatUIContext'
import { buttonGhost, buttonPrimary, input } from '../../lib/formStyles'
import { IconMessageCircle } from '../layout/icons'

export function VenueRegistrationForm({ venue }: { venue: Venue }) {
  const queryClient = useQueryClient()
  const { openChatWindow } = useChatUI()
  const { data: busy } = useQuery({
    queryKey: ['player', 'availability', venue.id],
    queryFn: () => fetchVenueAvailability(venue.id),
  })

  const [courtId, setCourtId] = useState<number | ''>('')
  const [selection, setSelection] = useState<{ start: string; end: string } | null>(null)
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<CreatedVenueRegistration | null>(null)

  const mutation = useMutation({
    mutationFn: createVenueRegistration,
    onSuccess: (data) => {
      setBooked(data)
      setError(null)
      setSelection(null)
      setPurpose('')
      queryClient.invalidateQueries({ queryKey: ['player', 'availability', venue.id] })
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not book this slot.'
      setError(message)
      setBooked(null)
    },
  })

  function handleSelect(info: DateSelectArg) {
    setBooked(null)
    setError(null)
    setSelection({ start: info.start.toISOString(), end: info.end.toISOString() })
    if (info.resource) setCourtId(Number(info.resource.id))
  }

  function handleSubmit() {
    if (!selection || !purpose.trim() || !isDurationValid) return
    mutation.mutate({
      venue_id: venue.id,
      court_id: courtId === '' ? undefined : courtId,
      starts_at: selection.start,
      ends_at: selection.end,
      purpose: purpose.trim(),
    })
  }

  const selectedCourt = courtId === '' ? null : venue.courts.find((c) => c.id === courtId)
  const selectedHours = selection
    ? (new Date(selection.end).getTime() - new Date(selection.start).getTime()) / (1000 * 60 * 60)
    : null

  // A block-priced court (e.g. BRCC's badminton gymnasium: ₱1,500 for an
  // exact 3-hour block, no hourly rate) isn't sold by the hour at all — the
  // server rejects anything that isn't a whole multiple of block_hours, so
  // mirror that here to catch it before submitting instead of after.
  const isDurationValid =
    !selectedCourt?.block_hours || !selectedHours || Math.abs(selectedHours % selectedCourt.block_hours) < 0.01

  const estimatedTotal =
    selectedCourt?.block_hours && selectedCourt.block_price && selectedHours
      ? (selectedHours / selectedCourt.block_hours) * Number(selectedCourt.block_price)
      : selection
        ? calculateVenueRent(venue, selection.start, selection.end)
        : null

  const resources = venue.courts.map((c) => ({ id: String(c.id), title: c.name }))
  const busyEvents = (busy ?? []).map((b) => ({
    id: `busy-${b.id}`,
    title: b.title,
    start: b.start,
    end: b.end,
    resourceId: b.resourceId ? String(b.resourceId) : undefined,
    color: '#9ca3af',
    editable: false,
  }))

  const hasFixedHours = Boolean(venue.opens_at && venue.closes_at)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Book {venue.name}</h3>
        <p className="text-xs text-slate-500">
          Select a free time slot on the calendar (grey = already booked)
          {hasFixedHours && ` — open ${venue.opens_at?.slice(0, 5)}–${venue.closes_at?.slice(0, 5)}`}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <FullCalendar
          schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
          plugins={[resourceTimeGridPlugin, interactionPlugin]}
          initialView="resourceTimeGridDay"
          resources={resources}
          events={busyEvents}
          selectable
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

      {selectedCourt?.block_hours && selectedCourt.block_price && (
        <p className="text-xs text-slate-500">
          {selectedCourt.name} is booked in fixed {selectedCourt.block_hours}-hour blocks at{' '}
          {formatPeso(Number(selectedCourt.block_price))} per block — select a slot that's a multiple of{' '}
          {selectedCourt.block_hours} hours.
        </p>
      )}

      {selection && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-sm font-medium text-slate-700">
            Selected: {new Date(selection.start).toLocaleString()} - {new Date(selection.end).toLocaleTimeString()}
          </p>
          {!isDurationValid && selectedCourt?.block_hours && (
            <p className="text-sm text-red-600">
              This court can only be booked in {selectedCourt.block_hours}-hour blocks.
            </p>
          )}
          {estimatedTotal !== null && (
            <p className="text-sm font-semibold text-teal-700">Estimated total: {formatPeso(estimatedTotal)}</p>
          )}
          <input
            type="text"
            placeholder="Purpose (required)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            required
            className={input}
          />
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !purpose.trim() || !isDurationValid}
            className={`${buttonPrimary} self-start`}
          >
            {mutation.isPending ? 'Requesting...' : 'Request booking'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {booked && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-green-100 bg-green-50/60 p-3">
          <p className="text-sm font-medium text-green-700">Booking requested — waiting on facilitator approval.</p>
          {booked.total_amount !== null && (
            <p className="text-sm text-slate-700">
              Total amount: <span className="font-semibold">{formatPeso(booked.total_amount)}</span>
            </p>
          )}
          <p className="text-sm text-slate-700">
            Facilitator: <span className="font-semibold">{booked.facilitator_name}</span>
            {booked.facilitator_phone && ` — ${booked.facilitator_phone}`}
          </p>
          <button
            onClick={() => openChatWindow(booked.conversation_id)}
            className={`${buttonGhost} self-start`}
          >
            <IconMessageCircle className="h-4 w-4" /> Message facilitator
          </button>
        </div>
      )}
    </div>
  )
}
