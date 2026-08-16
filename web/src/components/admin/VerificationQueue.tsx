import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPendingVerifications, updateUserVerification, type PendingVerificationUser } from '../../lib/adminApi'
import { buttonDanger, buttonPrimary } from '../../lib/formStyles'

function DocumentLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return <span className="text-xs text-slate-400">{label}: not provided</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-teal-600 hover:underline">
      View {label} &rarr;
    </a>
  )
}

function VerificationCard({ user }: { user: PendingVerificationUser }) {
  const queryClient = useQueryClient()
  const isCoach = user.roles.some((r) => r.name === 'coach')

  const mutation = useMutation({
    mutationFn: (status: 'verified' | 'rejected') => updateUserVerification(user.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-verifications'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-log'] })
    },
  })

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{user.name}</p>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {user.roles.map((r) => (
            <span key={r.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
              {r.name}
            </span>
          ))}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
              user.verification_status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {user.verification_status}
          </span>
        </div>
      </div>

      <div className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
        <p>Birthday: {user.birthday ? new Date(user.birthday).toLocaleDateString() : '—'}</p>
        <p>Address: {user.address ?? '—'}</p>
        <p>Registered: {new Date(user.created_at).toLocaleDateString()}</p>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3">
        <DocumentLink url={user.proof_of_address_url} label="proof of address" />
        {isCoach && <DocumentLink url={user.coach_eligibility_proof_url} label="coaching eligibility proof" />}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => mutation.mutate('verified')}
          disabled={user.verification_status === 'verified' || mutation.isPending}
          className={buttonPrimary}
        >
          Verify account
        </button>
        <button
          onClick={() => mutation.mutate('rejected')}
          disabled={user.verification_status === 'rejected' || mutation.isPending}
          className={buttonDanger}
        >
          Reject
        </button>
      </div>
    </li>
  )
}

export function VerificationQueue() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'pending-verifications'],
    queryFn: fetchPendingVerifications,
  })

  if (isLoading) return <p className="text-sm text-slate-500">Loading...</p>

  if (!users || users.length === 0) {
    return <p className="text-sm text-slate-400">No accounts waiting for verification.</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {users.map((user) => (
        <VerificationCard key={user.id} user={user} />
      ))}
    </ul>
  )
}
