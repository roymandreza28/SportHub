import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelMatchmakingRequest, createMatchmakingRequest, fetchMyMatchmakingRequests } from '../../lib/playerApi'
import { fetchSports } from '../../lib/venueApi'

const STATUS_LABEL: Record<string, string> = {
  open: 'Looking for a match...',
  matched: 'Matched!',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

export function MatchmakingPanel() {
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })
  const { data: requests } = useQuery({
    queryKey: ['player', 'matchmaking'],
    queryFn: fetchMyMatchmakingRequests,
    refetchInterval: 5000,
  })
  const [sportId, setSportId] = useState<number | ''>('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['player', 'matchmaking'] })

  const request = useMutation({
    mutationFn: () => createMatchmakingRequest({ sport_id: Number(sportId) }),
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: cancelMatchmakingRequest,
    onSuccess: invalidate,
  })

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <h3 className="text-sm font-medium">Matchmaking</h3>

      <div className="flex gap-2">
        <select
          value={sportId}
          onChange={(e) => setSportId(e.target.value ? Number(e.target.value) : '')}
          className="flex-1 rounded border px-2 py-1 text-sm"
        >
          <option value="">Choose a sport...</option>
          {sports?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => request.mutate()}
          disabled={!sportId || request.isPending}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Find a match
        </button>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {requests?.map((req) => (
          <li key={req.id} className="flex items-center justify-between rounded border p-2">
            <div>
              <div>{req.sport.name}</div>
              <div className="text-xs text-gray-500">
                {STATUS_LABEL[req.status] ?? req.status}
                {req.opponent && ` with ${req.opponent.name} (${req.opponent.email})`}
              </div>
            </div>
            {req.status === 'open' && (
              <button onClick={() => cancel.mutate(req.id)} className="text-xs text-red-600">
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
