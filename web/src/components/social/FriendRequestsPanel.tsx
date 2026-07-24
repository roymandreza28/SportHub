import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { acceptFriendRequest, declineFriendRequest, fetchFriendRequests } from '../../lib/friendsApi'
import { buttonPrimary, buttonSecondary } from '../../lib/formStyles'

export function FriendRequestsPanel() {
  const queryClient = useQueryClient()

  const { data: incoming } = useQuery({
    queryKey: ['social', 'friend-requests', 'incoming'],
    queryFn: () => fetchFriendRequests('incoming'),
  })
  const { data: outgoing } = useQuery({
    queryKey: ['social', 'friend-requests', 'outgoing'],
    queryFn: () => fetchFriendRequests('outgoing'),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['social', 'friend-requests'] })
    queryClient.invalidateQueries({ queryKey: ['social', 'friends'] })
  }

  const acceptMutation = useMutation({ mutationFn: acceptFriendRequest, onSuccess: invalidate })
  const declineMutation = useMutation({ mutationFn: declineFriendRequest, onSuccess: invalidate })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming requests</h3>
        {incoming?.length === 0 && <p className="text-sm text-slate-400">No incoming requests.</p>}
        <ul className="flex flex-col divide-y divide-slate-100">
          {incoming?.map((req) => (
            <li key={req.id} className="flex items-center justify-between gap-3 py-2.5">
              <p className="text-sm font-medium text-slate-800">{req.requester.name}</p>
              <div className="flex gap-2">
                <button onClick={() => acceptMutation.mutate(req.id)} className={buttonPrimary}>
                  Accept
                </button>
                <button onClick={() => declineMutation.mutate(req.id)} className={buttonSecondary}>
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sent requests</h3>
        {outgoing?.length === 0 && <p className="text-sm text-slate-400">No outgoing requests.</p>}
        <ul className="flex flex-col divide-y divide-slate-100">
          {outgoing?.map((req) => (
            <li key={req.id} className="flex items-center justify-between gap-3 py-2.5">
              <p className="text-sm font-medium text-slate-800">{req.addressee.name}</p>
              <span className="text-xs font-medium text-slate-400">Pending</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
