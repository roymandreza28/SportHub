import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMatchScore, type BracketMatch } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'

type LiveUpdate = { score_a: number; score_b: number; status?: string }

export function ScoreboardLive({
  match,
  tournamentId,
  onClose,
}: {
  match: BracketMatch
  tournamentId: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [scoreA, setScoreA] = useState(match.score_a)
  const [scoreB, setScoreB] = useState(match.score_b)
  const [liveUpdate, setLiveUpdate] = useState<LiveUpdate | null>(null)

  useEffect(() => {
    setScoreA(match.score_a)
    setScoreB(match.score_b)
  }, [match])

  // Public channel — any spectator (and this organizer's own other tabs) sees
  // score changes the instant they're broadcast, not just after a refetch.
  useEffect(() => {
    const channel = echo.channel(`match.${match.id}`)
    channel
      .listen('.MatchEventCreated', (e: { payload: { score_a: number; score_b: number } }) => {
        setLiveUpdate((prev) => ({ ...prev, score_a: e.payload.score_a, score_b: e.payload.score_b }))
        queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
      })
      .listen('.MatchStatusChanged', (e: { status: string; score_a: number; score_b: number }) => {
        setLiveUpdate({ score_a: e.score_a, score_b: e.score_b, status: e.status })
        queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
      })

    return () => {
      echo.leave(`match.${match.id}`)
    }
  }, [match.id, tournamentId, queryClient])

  const canPlay = match.participant_a_id !== null && match.participant_b_id !== null

  const save = useMutation({
    mutationFn: (status?: 'live' | 'completed') => updateMatchScore(match.id, { score_a: scoreA, score_b: scoreB, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
    },
  })

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <div className="w-80 rounded bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-medium">Scoreboard — Match #{match.id}</h3>

        {!canPlay && <p className="mb-2 text-xs text-amber-700">Both participants aren't determined yet.</p>}

        {liveUpdate && (
          <p className="mb-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
            Live: {liveUpdate.score_a} - {liveUpdate.score_b}
            {liveUpdate.status && ` (${liveUpdate.status})`}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between text-sm">
            {match.participant_a?.name ?? 'TBD'}
            <input
              type="number"
              min={0}
              value={scoreA}
              onChange={(e) => setScoreA(Number(e.target.value))}
              className="w-16 rounded border px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            {match.participant_b?.name ?? 'TBD'}
            <input
              type="number"
              min={0}
              value={scoreB}
              onChange={(e) => setScoreB(Number(e.target.value))}
              className="w-16 rounded border px-2 py-1 text-right"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm">
            Close
          </button>
          <button
            onClick={() => save.mutate('live')}
            disabled={!canPlay || save.isPending}
            className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Update score
          </button>
          <button
            onClick={() => save.mutate('completed')}
            disabled={!canPlay || save.isPending}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Finish match
          </button>
        </div>
      </div>
    </div>
  )
}
