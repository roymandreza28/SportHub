import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchTournamentRegistrations,
  updateRegistrationPayment,
  updateRegistrationStatus,
  type TournamentRegistrationRow,
} from '../../lib/organizerApi'
import { formatPeso } from '../../lib/venueApi'
import { buttonDanger, buttonSuccess } from '../../lib/formStyles'
import { StatusBadge } from '../layout/DashboardShell'

// Duplicated from RegistrationApprovalQueue.tsx (the venue-booking approval
// queue) rather than imported — same approve/reject visual language, but
// that component lives under components/venue/ for a different domain.
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

// Shown only while a tournament is open for registration (see
// OrganizerPage.tsx) — the roster of everyone signed up so far, plus,
// for a paid tournament, whether the organizer/facilitator has confirmed
// payment, and an approve/reject decision on the registration itself.
// Payment is arranged off-platform via the chat opened by
// TournamentPaymentReceipt.tsx — this is just the organizer's bookkeeping
// once that's actually happened, and their call on whether what they were
// shown as proof was good enough to approve.
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

  const statusMutation = useMutation({
    mutationFn: ({ registrationId, status }: { registrationId: number; status: 'confirmed' | 'rejected' }) =>
      updateRegistrationStatus(tournamentId, registrationId, status),
    onSuccess: (updated) => {
      queryClient.setQueryData<TournamentRegistrationRow[]>(queryKey, (rows) =>
        rows?.map((r) => (r.id === updated.id ? { ...r, status: updated.status } : r))
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
            <div className="flex shrink-0 items-center gap-2">
              {registrationFee && (
                <>
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
                </>
              )}

              {r.status === 'pending' ? (
                <>
                  <button
                    onClick={() => statusMutation.mutate({ registrationId: r.id, status: 'confirmed' })}
                    disabled={statusMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckIcon /> Approve
                  </button>
                  <button
                    onClick={() => statusMutation.mutate({ registrationId: r.id, status: 'rejected' })}
                    disabled={statusMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40"
                  >
                    <XIcon /> Reject
                  </button>
                </>
              ) : (
                <StatusBadge status={r.status === 'confirmed' ? 'approved' : r.status} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
