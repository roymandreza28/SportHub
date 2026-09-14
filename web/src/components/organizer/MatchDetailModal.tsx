import { useQuery } from '@tanstack/react-query'
import { fetchMatchRecord, type BracketMatch, type MatchRecord, type ScoringType } from '../../lib/organizerApi'
import { STATUS_STYLE } from './BracketView'
import { IconX } from '../layout/icons'

// Every rostered player on one side, stats merged in by user id — a player
// with no recorded stat tick (never scored/fouled/etc.) still shows up at
// all-zero rather than silently disappearing, since MatchPlayerStat only
// has a row for someone who was actually tapped at least once. Falls back
// to just the one participant for an individual (non-team) tournament,
// where there's no roster at all.
function playerRows(record: MatchRecord, side: 'a' | 'b', match: BracketMatch) {
  const team = side === 'a' ? record.team_a : record.team_b
  if (team) {
    return team.members.map((member) => ({
      id: member.id,
      name: member.name,
      stats: record.player_stats.find((s) => s.user_id === member.id)?.stats ?? {},
    }))
  }

  const participant = side === 'a' ? match.participant_a : match.participant_b
  if (!participant) return []
  const stat = record.player_stats.find((s) => s.user_id === participant.id)
  return stat ? [{ id: participant.id, name: participant.name, stats: stat.stats }] : []
}

function formatEvent(event: MatchRecord['events'][number]): string {
  const payload = event.payload
  if (payload.won_by_default) return 'Won by default'
  if (typeof payload.score_a === 'number' && typeof payload.score_b === 'number') {
    return `Score: ${payload.score_a}–${payload.score_b}`
  }
  return event.type
}

// The point in the GAME this happened, not the wall-clock time it was
// logged — matches how a real box score reads ("Q2 5:42"), not a
// server timestamp nobody watching the game cares about. Only Basketball/
// 3x3 matches ever have a period/clock (see MatchController::updateScore()'s
// own comment) — every other sport falls back to the real timestamp, since
// it has no equivalent "point in the game" concept to show instead.
function formatEventTime(event: MatchRecord['events'][number]): string {
  const { period_label: periodLabel, clock_seconds_remaining: secondsRemaining } = event.payload
  if (typeof periodLabel === 'string' && typeof secondsRemaining === 'number') {
    const m = Math.floor(secondsRemaining / 60)
    const s = Math.round(secondsRemaining % 60)
    return `${periodLabel} · ${m}:${s.toString().padStart(2, '0')}`
  }
  return new Date(event.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function PlayerStatsTable({
  title,
  rows,
  fields,
}: {
  title: string
  rows: { id: number; name: string; stats: Record<string, number> }[]
  fields: MatchRecord['stat_fields']
}) {
  if (rows.length === 0) return null

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-2.5 py-1.5 font-medium">Player</th>
              {fields.map((f) => (
                <th key={f.key} className="px-2 py-1.5 text-right font-medium">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="truncate px-2.5 py-1.5 font-medium text-slate-700">{row.name}</td>
                {fields.map((f) => (
                  <td key={f.key} className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                    {row.stats[f.key] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// The "click a specific game" endpoint of the Standings tab (BracketView ->
// TournamentStandingsView -> here) — a read-only record of one match: both
// sides, the final/current score (and a set-by-set breakdown for
// best-of-sets sports), status, when/where it was or will be played, every
// rostered player's individual stat line, and the chronological score
// log. Deliberately not live-subscribed like MatchScoreboardViewer — this
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
  const { data: record } = useQuery({
    queryKey: ['organizer', 'match-record', match.id],
    queryFn: () => fetchMatchRecord(match.id),
  })

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
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
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

        <div className="flex flex-col gap-4 overflow-y-auto">
          <div>
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[match.status] ?? 'bg-slate-100 text-slate-500'}`}
            >
              {match.won_by_default ? 'Won by default' : match.status}
            </span>

            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span
                  className={`truncate text-base ${aWon ? 'font-bold text-teal-700' : 'font-medium text-slate-800'}`}
                >
                  {aName}
                </span>
                {!match.won_by_default && (
                  <span className="text-xl font-black tabular-nums text-slate-900">{match.score_a}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span
                  className={`truncate text-base ${bWon ? 'font-bold text-teal-700' : 'font-medium text-slate-800'}`}
                >
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

          {record && record.stat_fields.length > 0 && (
            <>
              <PlayerStatsTable title={`${aName} — player stats`} rows={playerRows(record, 'a', match)} fields={record.stat_fields} />
              <PlayerStatsTable title={`${bName} — player stats`} rows={playerRows(record, 'b', match)} fields={record.stat_fields} />
            </>
          )}

          {record && record.events.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Match log</p>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                {record.events.map((event, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-1.5 py-1 text-xs">
                    <span className="text-slate-600">{formatEvent(event)}</span>
                    <span className="shrink-0 tabular-nums text-slate-400">{formatEventTime(event)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
