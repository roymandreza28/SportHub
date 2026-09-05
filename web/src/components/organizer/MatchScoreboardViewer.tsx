import { useEffect, useState } from 'react'
import { echo } from '../../lib/echo'
import type { BracketMatch } from '../../lib/organizerApi'

// The spectator counterpart to the venue organizer's editable ScoreboardLive
// — anyone who can already see a tournament's bracket (every role, plus the
// bracket endpoint itself is fully public/unauthenticated) can open this for
// a live or just-finished game, but it has zero score-changing controls
// anywhere. Subscribes to match.{id} — the exact same fully public channel
// ScoreboardLive itself broadcasts every change on — so every tap the venue
// organizer makes on the real scoreboard reaches every open viewer here
// live, with no polling and no special access needed.
type MatchStatusChangedPayload = {
  id: number
  status: 'scheduled' | 'live' | 'completed'
  score_a: number
  score_b: number
  winner_id: number | null
  winner_team_id: number | null
  won_by_default: boolean
}

export function MatchScoreboardViewer({
  match,
  tournamentName,
  onClose,
}: {
  match: BracketMatch
  tournamentName?: string
  onClose: () => void
}) {
  const [live, setLive] = useState(match)

  useEffect(() => {
    const channel = echo.channel(`match.${match.id}`)
    channel.listen('.MatchStatusChanged', (e: MatchStatusChangedPayload) => {
      setLive((prev) => {
        // Exactly one of winner_id/winner_team_id is ever populated for a
        // given match (individual vs. team) — participant_a/b.id already
        // carry whichever id-space this match uses.
        const winnerId = e.winner_id ?? e.winner_team_id ?? null
        const winner =
          winnerId === prev.participant_a?.id ? prev.participant_a : winnerId === prev.participant_b?.id ? prev.participant_b : null

        return { ...prev, status: e.status, score_a: e.score_a, score_b: e.score_b, won_by_default: e.won_by_default, winner }
      })
    })

    return () => {
      echo.leave(`match.${match.id}`)
    }
  }, [match.id])

  const aName = live.participant_a?.name ?? 'TBD'
  const bName = live.participant_b?.name ?? 'TBD'
  const isLive = live.status === 'live'
  const isCompleted = live.status === 'completed'

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {tournamentName ?? 'Tournament'} · Round {live.round}
            </p>
            {live.court && (
              <p className="mt-0.5 text-xs text-slate-400">
                {live.court.venue.name} ({live.court.name})
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {isLive && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" /> LIVE
          </span>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <span className={`truncate text-base ${live.winner?.id === live.participant_a?.id ? 'font-bold text-teal-700' : 'font-medium text-slate-800'}`}>
              {aName}
            </span>
            {!live.won_by_default && <span className="text-2xl font-black tabular-nums text-slate-900">{live.score_a}</span>}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <span className={`truncate text-base ${live.winner?.id === live.participant_b?.id ? 'font-bold text-teal-700' : 'font-medium text-slate-800'}`}>
              {bName}
            </span>
            {!live.won_by_default && <span className="text-2xl font-black tabular-nums text-slate-900">{live.score_b}</span>}
          </div>
        </div>

        {live.won_by_default && live.winner && (
          <p className="mt-3 text-center text-sm font-medium text-slate-500">{live.winner.name} won by default.</p>
        )}
        {isCompleted && !live.won_by_default && live.winner && (
          <p className="mt-3 text-center text-sm font-semibold text-teal-700">{live.winner.name} wins!</p>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">
          View only — scores are updated live by the venue organizer running this game.
        </p>
      </div>
    </div>
  )
}
