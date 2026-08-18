import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createManualBooking, type Venue } from '../../lib/venueApi'
import { buttonGhost, buttonPrimary, fieldGroup, input, label, select } from '../../lib/formStyles'

export function ManualBookingForm({ venue, onClose }: { venue: Venue; onClose: () => void }) {
  const queryClient = useQueryClient()

  const [courtId, setCourtId] = useState<number | ''>('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [walkInContact, setWalkInContact] = useState('')
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      createManualBooking(venue.id, {
        court_id: courtId === '' ? undefined : courtId,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        walk_in_name: walkInName,
        walk_in_contact: walkInContact || undefined,
        purpose: purpose || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'schedule', venue.id] })
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })
      onClose()
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not add this booking — it may overlap an existing one.'
      setError(message)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/60 p-4" data-testid="manual-booking-modal">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Add walk-in booking</h3>
            <p className="text-xs text-slate-500">Blocks this slot at {venue.name} for a customer who isn't using the app.</p>
          </div>
          <button onClick={onClose} className={buttonGhost}>
            Close
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className={fieldGroup}>
              <label className={label} htmlFor="manual-booking-court">Court</label>
              <select
                id="manual-booking-court"
                value={courtId}
                onChange={(e) => setCourtId(e.target.value ? Number(e.target.value) : '')}
                className={select}
              >
                <option value="">Whole venue (no specific court)</option>
                {venue.courts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={fieldGroup}>
                <label className={label} htmlFor="manual-booking-starts">Starts</label>
                <input
                  id="manual-booking-starts"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className={input}
                  required
                />
              </div>
              <div className={fieldGroup}>
                <label className={label} htmlFor="manual-booking-ends">Ends</label>
                <input
                  id="manual-booking-ends"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className={input}
                  required
                />
              </div>
            </div>

            <div className={fieldGroup}>
              <label className={label} htmlFor="manual-booking-name">Walk-in customer name</label>
              <input
                id="manual-booking-name"
                type="text"
                placeholder="e.g. Juan Dela Cruz"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                className={input}
                required
              />
            </div>

            <div className={fieldGroup}>
              <label className={label} htmlFor="manual-booking-contact">Contact (optional)</label>
              <input
                id="manual-booking-contact"
                type="text"
                placeholder="Phone number or note"
                value={walkInContact}
                onChange={(e) => setWalkInContact(e.target.value)}
                className={input}
              />
            </div>

            <div className={fieldGroup}>
              <label className={label} htmlFor="manual-booking-purpose">Purpose (optional)</label>
              <input
                id="manual-booking-purpose"
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className={input}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={mutation.isPending} className={`${buttonPrimary} self-start`}>
              {mutation.isPending ? 'Adding...' : 'Add booking'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
