import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { scheduleMatch, type BracketMatch } from '../../lib/organizerApi'
import { fetchVenues } from '../../lib/venueApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label, select } from '../../lib/formStyles'

// datetime-local inputs need "YYYY-MM-DDTHH:mm" with no timezone suffix —
// the match's scheduled_at comes back from the API as a full ISO string.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MatchScheduleModal({
  match,
  tournamentId,
  onClose,
}: {
  match: BracketMatch
  tournamentId: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: venues } = useQuery({ queryKey: ['venues'], queryFn: () => fetchVenues() })

  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(match.scheduled_at))
  const [venueId, setVenueId] = useState<number | ''>(match.court?.venue.id ?? '')
  const [courtId, setCourtId] = useState<number | ''>(match.court_id ?? '')

  const courts = venues?.find((v) => v.id === venueId)?.courts ?? []

  const mutation = useMutation({
    mutationFn: () =>
      scheduleMatch(match.id, {
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        court_id: courtId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold text-slate-800">
          Schedule {match.participant_a?.name ?? 'TBD'} vs {match.participant_b?.name ?? 'TBD'}
        </h3>

        <div className="flex flex-col gap-4">
          <div className={fieldGroup}>
            <label className={label}>Date & time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={input}
            />
          </div>
          <div className={fieldGroup}>
            <label className={label}>Venue</label>
            <select
              value={venueId}
              onChange={(e) => {
                setVenueId(e.target.value ? Number(e.target.value) : '')
                setCourtId('')
              }}
              className={select}
            >
              <option value="">Choose a venue...</option>
              {venues?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className={fieldGroup}>
            <label className={label}>Court</label>
            <select
              value={courtId}
              onChange={(e) => setCourtId(e.target.value ? Number(e.target.value) : '')}
              disabled={!venueId}
              className={select}
            >
              <option value="">Choose a court...</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mutation.isError && <p className="mt-3 text-xs text-red-600">Could not save — try again.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className={buttonPrimary}>
            {mutation.isPending ? 'Saving...' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
