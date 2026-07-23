import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMatchScore, type BracketMatch } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'
import { buttonPrimary, buttonSecondary, buttonSuccess } from '../../lib/formStyles'

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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Scoreboard — Match #{match.id}</h3>

        {!canPlay && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Both participants aren&apos;t determined yet.
          </p>
        )}

        {liveUpdate && (
          <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            Live: {liveUpdate.score_a} - {liveUpdate.score_b}
            {liveUpdate.status && ` (${liveUpdate.status})`}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <label className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm font-medium text-slate-700">
            {match.participant_a?.name ?? 'TBD'}
            <input
              type="number"
              min={0}
              value={scoreA}
              onChange={(e) => setScoreA(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right tabular-nums focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm font-medium text-slate-700">
            {match.participant_b?.name ?? 'TBD'}
            <input
              type="number"
              min={0}
              value={scoreB}
              onChange={(e) => setScoreB(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right tabular-nums focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
          <button onClick={() => save.mutate('live')} disabled={!canPlay || save.isPending} className={buttonPrimary}>
            Update score
          </button>
          <button onClick={() => save.mutate('completed')} disabled={!canPlay || save.isPending} className={buttonSuccess}>
            Finish match
          </button>
        </div>
      </div>
    </div>
  )
}
