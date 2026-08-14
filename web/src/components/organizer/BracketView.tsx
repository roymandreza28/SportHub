import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchBracket, type BracketMatch } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-500',
  live: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
}

function MatchCard({ match, onClick }: { match: BracketMatch; onClick?: () => void }) {
  const aDetermined = !!match.participant_a_id
  const bDetermined = !!match.participant_b_id
  const isOpen = !aDetermined && !bDetermined
  const aName = match.participant_a?.name ?? 'TBD'
  const bName = match.participant_b?.name ?? 'TBD'

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`w-52 rounded-lg border p-3 text-left text-xs shadow-sm transition enabled:hover:border-teal-200 enabled:hover:shadow-md disabled:cursor-default ${
        isOpen ? 'border-dashed border-slate-200 bg-slate-50/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div
        className={`flex justify-between ${
          !aDetermined
            ? 'italic text-slate-400'
            : match.winner_id === match.participant_a_id
              ? 'font-semibold text-teal-700'
              : 'text-slate-700'
        }`}
      >
        <span className="truncate">{aName}</span>
        {aDetermined && <span className="tabular-nums">{match.score_a}</span>}
      </div>
      <div
        className={`mt-1 flex justify-between ${
          !bDetermined
            ? 'italic text-slate-400'
            : match.winner_id === match.participant_b_id
              ? 'font-semibold text-teal-700'
              : 'text-slate-700'
        }`}
      >
        <span className="truncate">{bName}</span>
        {bDetermined && <span className="tabular-nums">{match.score_b}</span>}
      </div>
      <div
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
          isOpen ? 'bg-slate-100 text-slate-400' : STATUS_STYLE[match.status] ?? 'bg-slate-100 text-slate-500'
        }`}
      >
        {isOpen ? 'awaiting players' : match.status}
      </div>
    </button>
  )
}

export function BracketView({
  tournamentId,
  onSelectMatch,
}: {
  tournamentId: number
  onSelectMatch?: (match: BracketMatch) => void
}) {
  const queryClient = useQueryClient()
  const { data: bracket, isLoading } = useQuery({
    queryKey: ['organizer', 'bracket', tournamentId],
    queryFn: () => fetchBracket(tournamentId),
    retry: false,
  })

  // Public channel — spectators watching the bracket see round advances and
  // score-driven bracket changes live, without a manual refresh.
  useEffect(() => {
    const channel = echo.channel(`tournament.${tournamentId}`)
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })

    channel.listen('.BracketUpdated', invalidate).listen('.RoundAdvanced', invalidate)

    return () => {
      echo.leave(`tournament.${tournamentId}`)
    }
  }, [tournamentId, queryClient])

  if (isLoading) return <p className="text-sm text-slate-500">Loading bracket...</p>
  if (!bracket) return <p className="text-sm text-slate-400">No bracket generated yet.</p>

  // A true single "Final" only exists for single-elimination brackets —
  // round-robin's last (and only) round is several matches, not one, so
  // there's no single champion slot to call out there.
  const finalRound = bracket.structure[bracket.structure.length - 1]
  const champion =
    finalRound?.length === 1 && finalRound[0].status === 'completed' ? finalRound[0].winner : null

  return (
    <div className="flex flex-col gap-4">
      {champion && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-center">
          <span className="text-sm font-semibold text-teal-800">🏆 Champion: {champion.name}</span>
        </div>
      )}

      <div className="flex gap-8 overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/60 p-4">
        {bracket.structure.map((round, i) => (
          <div key={i} className="flex flex-col justify-around gap-4">
            <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              {i === bracket.structure.length - 1 ? 'Final' : `Round ${i + 1}`}
            </h4>
            {round.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onClick={onSelectMatch ? () => onSelectMatch(match) : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
