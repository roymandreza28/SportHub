import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchTournamentRegistrations,
  updateRegistrationPayment,
  type TournamentRegistrationRow,
} from '../../lib/organizerApi'
import { formatPeso } from '../../lib/venueApi'
import { buttonDanger, buttonSuccess } from '../../lib/formStyles'

// Shown only while a tournament is open for registration (see
// OrganizerPage.tsx) — the roster of everyone signed up so far, plus,
// for a paid tournament, whether the organizer/facilitator has confirmed
// payment. Payment itself is arranged off-platform via the chat opened by
// TournamentPaymentReceipt.tsx — this is just the organizer's bookkeeping
// once that's actually happened.
export function TournamentRegistrationsList({
  tournamentId,
  registrationFee,
}: {
  tournamentId: number
  registrationFee: string | null
}) {
  const queryClient = useQueryClient()
  const queryKey = ['organizer', 'tournament-registrations', tournamentId]

  const { data: registrations } = useQuery({
    queryKey,
    queryFn: () => fetchTournamentRegistrations(tournamentId),
  })

  const paymentMutation = useMutation({
    mutationFn: ({ registrationId, paid }: { registrationId: number; paid: boolean }) =>
      updateRegistrationPayment(tournamentId, registrationId, paid),
    onSuccess: (updated) => {
      queryClient.setQueryData<TournamentRegistrationRow[]>(queryKey, (rows) =>
        rows?.map((r) => (r.id === updated.id ? { ...r, paid: updated.paid, paid_at: updated.paid_at } : r))
      )
    },
  })

  return (
    <div className="mb-3 rounded-lg border border-slate-200">
      <h4 className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Registered so far
      </h4>
      {registrations?.length === 0 && <p className="px-3 py-2.5 text-sm text-slate-400">No one has registered yet.</p>}
      <ul className="flex flex-col divide-y divide-slate-100">
        {registrations?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{r.name}</p>
              {r.type === 'individual' && r.email && <p className="truncate text-xs text-slate-500">{r.email}</p>}
              {r.type === 'team' && r.team_roster && r.team_roster.length > 0 && (
                <p className="truncate text-xs text-slate-500">{r.team_roster.map((m) => m.name).join(', ')}</p>
              )}
            </div>
            {registrationFee && (
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.paid ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {r.paid ? `Paid ${formatPeso(Number(registrationFee))}` : 'Not paid yet'}
                </span>
                <button
                  onClick={() => paymentMutation.mutate({ registrationId: r.id, paid: !r.paid })}
                  disabled={paymentMutation.isPending}
                  className={`${r.paid ? buttonDanger : buttonSuccess} px-2.5 py-1 text-xs`}
                >
                  {r.paid ? 'Mark unpaid' : 'Mark paid'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
