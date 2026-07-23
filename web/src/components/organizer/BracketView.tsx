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
  const aName = match.participant_a?.name ?? (match.participant_a_id ? `#${match.participant_a_id}` : 'TBD')
  const bName = match.participant_b?.name ?? (match.participant_b_id ? `#${match.participant_b_id}` : 'TBD')

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-52 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs shadow-sm transition enabled:hover:border-teal-200 enabled:hover:shadow-md disabled:cursor-default"
    >
      <div
        className={`flex justify-between ${
          match.winner_id === match.participant_a_id ? 'font-semibold text-teal-700' : 'text-slate-700'
        }`}
      >
        <span className="truncate">{aName}</span>
        <span className="tabular-nums">{match.score_a}</span>
      </div>
      <div
        className={`mt-1 flex justify-between ${
          match.winner_id === match.participant_b_id ? 'font-semibold text-teal-700' : 'text-slate-700'
        }`}
      >
        <span className="truncate">{bName}</span>
        <span className="tabular-nums">{match.score_b}</span>
      </div>
      <div className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[match.status] ?? 'bg-slate-100 text-slate-500'}`}>
        {match.status}
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

  return (
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
  )
}
