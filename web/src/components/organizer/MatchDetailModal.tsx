import type { BracketMatch, ScoringType } from '../../lib/organizerApi'
import { STATUS_STYLE } from './BracketView'
import { IconX } from '../layout/icons'

// The "click a specific game" endpoint of the Standings tab (BracketView ->
// TournamentStandingsView -> here) — a static, read-only record of one
// match: both sides, the final/current score (and a set-by-set breakdown
// for best-of-sets sports), status, and when/where it was or will be
// played. Deliberately not live-subscribed like MatchScoreboardViewer — this
// is for browsing a tournament's history, not for watching a game in
// progress (the Bracket tab's own click-to-view already covers that case).
export function MatchDetailModal({
  match,
  tournamentName,
  roundLabel,
  scoringType,
  onClose,
}: {
  match: BracketMatch
  tournamentName?: string
  roundLabel: string
  scoringType?: ScoringType
  onClose: () => void
}) {
  const aName = match.participant_a?.name ?? 'TBD'
  const bName = match.participant_b?.name ?? 'TBD'
  // Compares the shaped {id, name} objects, not the raw participant_a_id/
  // winner_id columns — those stay null for a team match, which populates
  // participant_a_team_id/winner_team_id instead (same reasoning as
  // MatchCard's own winner highlight in BracketView).
  const aWon = !!match.winner && match.winner.id === match.participant_a?.id
  const bWon = !!match.winner && match.winner.id === match.participant_b?.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400">
              {tournamentName ?? 'Tournament'} · {roundLabel}
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-slate-800">Match details</h3>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <span
          className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[match.status] ?? 'bg-slate-100 text-slate-500'}`}
        >
          {match.won_by_default ? 'Won by default' : match.status}
        </span>

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <span className={`truncate text-base ${aWon ? 'font-bold text-teal-700' : 'font-medium text-slate-800'}`}>
              {aName}
            </span>
            {!match.won_by_default && (
              <span className="text-xl font-black tabular-nums text-slate-900">{match.score_a}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <span className={`truncate text-base ${bWon ? 'font-bold text-teal-700' : 'font-medium text-slate-800'}`}>
              {bName}
            </span>
            {!match.won_by_default && (
              <span className="text-xl font-black tabular-nums text-slate-900">{match.score_b}</span>
            )}
          </div>
        </div>

        {scoringType === 'best_of_sets' && match.sets && match.sets.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Set scores</p>
            <div className="flex flex-col gap-1">
              {match.sets.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs">
                  <span className="text-slate-500">Set {i + 1}</span>
                  <span className="tabular-nums font-medium text-slate-700">
                    {s.score_a} – {s.score_b}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {match.won_by_default && match.winner && (
          <p className="mt-3 text-center text-sm font-medium text-slate-500">{match.winner.name} won by default.</p>
        )}
        {match.status === 'completed' && !match.won_by_default && match.winner && (
          <p className="mt-3 text-center text-sm font-semibold text-teal-700">🏆 {match.winner.name} wins!</p>
        )}

        {(match.scheduled_at || match.court) && (
          <p className="mt-3 text-center text-xs text-slate-500">
            {match.scheduled_at &&
              new Date(match.scheduled_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            {match.court && ` — ${match.court.venue.name} (${match.court.name})`}
          </p>
        )}
      </div>
    </div>
  )
}
