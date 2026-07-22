import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import FullCalendar from '@fullcalendar/react'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg } from '@fullcalendar/core'
import { fetchVenueAvailability, type Venue } from '../../lib/venueApi'
import { createVenueRegistration } from '../../lib/playerApi'

export function VenueRegistrationForm({ venue }: { venue: Venue }) {
  const queryClient = useQueryClient()
  const { data: busy } = useQuery({
    queryKey: ['player', 'availability', venue.id],
    queryFn: () => fetchVenueAvailability(venue.id),
  })

  const [courtId, setCourtId] = useState<number | ''>('')
  const [selection, setSelection] = useState<{ start: string; end: string } | null>(null)
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: createVenueRegistration,
    onSuccess: () => {
      setSuccess(true)
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
      setSuccess(false)
    },
  })

  function handleSelect(info: DateSelectArg) {
    setSuccess(false)
    setError(null)
    setSelection({ start: info.start.toISOString(), end: info.end.toISOString() })
    if (info.resource) setCourtId(Number(info.resource.id))
  }

  function handleSubmit() {
    if (!selection) return
    mutation.mutate({
      venue_id: venue.id,
      court_id: courtId === '' ? undefined : courtId,
      starts_at: selection.start,
      ends_at: selection.end,
      purpose: purpose || undefined,
    })
  }

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

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">Book {venue.name}</h3>
      <p className="text-xs text-gray-600">Select a free time slot on the calendar (grey = already booked)</p>

      <FullCalendar
        plugins={[resourceTimeGridPlugin, interactionPlugin]}
        initialView="resourceTimeGridDay"
        resources={resources}
        events={busyEvents}
        selectable
        select={handleSelect}
        height="auto"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
      />

      {selection && (
        <div className="flex flex-col gap-2 rounded border bg-gray-50 p-2 text-sm">
          <p>
            Selected: {new Date(selection.start).toLocaleString()} - {new Date(selection.end).toLocaleTimeString()}
          </p>
          <input
            type="text"
            placeholder="Purpose (optional)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          />
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {mutation.isPending ? 'Requesting...' : 'Request booking'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-600">Booking requested — waiting on facilitator approval.</p>}
    </div>
  )
}
