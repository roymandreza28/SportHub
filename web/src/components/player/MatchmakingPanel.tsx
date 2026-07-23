import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelMatchmakingRequest, createMatchmakingRequest, fetchMyMatchmakingRequests } from '../../lib/playerApi'
import { fetchSports } from '../../lib/venueApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'
import { buttonPrimary, select } from '../../lib/formStyles'

const STATUS_LABEL: Record<string, string> = {
  open: 'Looking for a match...',
  matched: 'Matched!',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-teal-100 text-teal-700',
  matched: 'bg-green-100 text-green-700',
  expired: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
}

export function MatchmakingPanel() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })
  const { data: requests } = useQuery({
    queryKey: ['player', 'matchmaking'],
    queryFn: fetchMyMatchmakingRequests,
    // Real-time (below) is the primary update path; this is just a safety
    // net in case the socket connection drops.
    refetchInterval: 30000,
  })
  const [sportId, setSportId] = useState<number | ''>('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['player', 'matchmaking'] })

  useEffect(() => {
    if (!user) return

    const channel = echo.private(`matchmaking.${user.id}`)
    channel.listen('.MatchmakingPairFound', () => invalidate())

    return () => {
      echo.leave(`matchmaking.${user.id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const request = useMutation({
    mutationFn: () => createMatchmakingRequest({ sport_id: Number(sportId) }),
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: cancelMatchmakingRequest,
    onSuccess: invalidate,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <select
          value={sportId}
          onChange={(e) => setSportId(e.target.value ? Number(e.target.value) : '')}
          className={`${select} flex-1`}
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
          className={buttonPrimary}
        >
          Find a match
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {requests?.map((req) => (
          <li
            key={req.id}
            className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-slate-800">{req.sport.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[req.status] ?? ''}`}>
                  {STATUS_LABEL[req.status] ?? req.status}
                </span>
                {req.opponent && ` with ${req.opponent.name} (${req.opponent.email})`}
              </p>
            </div>
            {req.status === 'open' && (
              <button onClick={() => cancel.mutate(req.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
