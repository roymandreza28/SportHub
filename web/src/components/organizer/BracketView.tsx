import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchBracket, type BracketMatch } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'

function MatchCard({ match, onClick }: { match: BracketMatch; onClick?: () => void }) {
  const aName = match.participant_a?.name ?? (match.participant_a_id ? `#${match.participant_a_id}` : 'TBD')
  const bName = match.participant_b?.name ?? (match.participant_b_id ? `#${match.participant_b_id}` : 'TBD')

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-48 rounded border bg-white p-2 text-left text-xs shadow-sm disabled:cursor-default"
    >
      <div className={`flex justify-between ${match.winner_id === match.participant_a_id ? 'font-semibold' : ''}`}>
        <span>{aName}</span>
        <span>{match.score_a}</span>
      </div>
      <div className={`flex justify-between ${match.winner_id === match.participant_b_id ? 'font-semibold' : ''}`}>
        <span>{bName}</span>
        <span>{match.score_b}</span>
      </div>
      <div className="mt-1 text-[10px] text-gray-500">{match.status}</div>
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

  if (isLoading) return <p className="text-sm text-gray-500">Loading bracket...</p>
  if (!bracket) return <p className="text-sm text-gray-500">No bracket generated yet.</p>

  return (
    <div className="flex gap-6 overflow-x-auto rounded border p-3">
      {bracket.structure.map((round, i) => (
        <div key={i} className="flex flex-col justify-around gap-4">
          <h4 className="text-center text-xs font-medium text-gray-500">
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
