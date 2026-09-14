import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchMatchRecord, type MatchRecord } from '../../lib/organizerApi'
import { buttonSecondary } from '../../lib/formStyles'
import type { PlayerMatchHistoryEntry } from '../../lib/socialApi'

function formatEvent(event: MatchRecord['events'][number]): string {
  const payload = event.payload
  if (payload.won_by_default) return 'Won by default'
  if (typeof payload.score_a === 'number' && typeof payload.score_b === 'number') {
    return `Score: ${payload.score_a}–${payload.score_b}`
  }
  return event.type
}

// The point in the GAME this happened, not the wall-clock time it was
// logged — matches how a real box score reads ("Period 2 / 4 · 5:42"), not
// a server timestamp nobody watching the game cares about. Only Basketball/
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

// One participant's full box score — every field the coach's stat sheet
// tracks (see StatSheetFieldSets), not just the organizer-tracked subset
// the career-stats pentagon uses. Roster mode gets one row per player;
// summary mode (racquet sports) gets a single aggregate row.
function StatSheetTable({ sheet }: { sheet: MatchRecord['stat_sheets'][number] }) {
  const rows =
    sheet.mode === 'roster'
      ? (sheet.data.rows ?? []).map((r) => ({ id: r.player_id, name: r.name, stats: r.stats }))
      : [{ id: 0, name: sheet.participant_name ?? '', stats: sheet.data.values ?? {} }]

  if (rows.length === 0) return null

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {sheet.participant_name ?? 'Stat sheet'}
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-2.5 py-1.5 font-medium">Player</th>
              {sheet.fields.map((f) => (
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
                {sheet.fields.map((f) => (
                  <td key={f.key} className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                    {row.stats[f.key] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.data.further_comments && <p className="mt-1.5 text-xs italic text-slate-400">"{sheet.data.further_comments}"</p>}
      {sheet.data.recorded_by && <p className="mt-1 text-[11px] text-slate-400">Recorded by {sheet.data.recorded_by}</p>}
    </div>
  )
}

// Opened from a Match History entry (CareerStatsModal) — the same
// tournament/opponent/score/result already known from that list, plus the
// full box score and match log fetched fresh via the public match-record
// endpoint (same one the Standings tab's match-detail popup uses).
export function MatchBoxScoreModal({ entry, onClose }: { entry: PlayerMatchHistoryEntry; onClose: () => void }) {
  const { data: record, isLoading } = useQuery({
    queryKey: ['match-record', entry.match_id],
    queryFn: () => fetchMatchRecord(entry.match_id),
  })

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-slate-950/60 p-4">
      <div
        className="flex w-full max-w-2xl min-w-0 flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6"
        style={{ maxHeight: '88vh' }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400">
              {entry.tournament_name ?? 'Tournament'}
            </p>
            <h3 className="mt-0.5 text-base font-bold text-slate-900">
              {entry.sport_name} vs {entry.opponent_name}
            </h3>
            {entry.date && (
              <p className="mt-0.5 text-xs text-slate-500">
                {new Date(entry.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </p>
            )}
          </div>
          <button onClick={onClose} className={`shrink-0 ${buttonSecondary}`}>
            Close
          </button>
        </div>

        <div className="flex items-center justify-center gap-3">
          {entry.score && <span className="text-2xl font-black tabular-nums text-slate-900">{entry.score}</span>}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              entry.result === 'win'
                ? 'bg-teal-100 text-teal-700'
                : entry.result === 'loss'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {entry.result === 'win' ? 'Win' : entry.result === 'loss' ? 'Loss' : 'Draw'}
          </span>
        </div>

        {isLoading && <p className="text-center text-sm text-slate-500">Loading full details...</p>}

        {record && record.stat_sheets.length > 0 && (
          <div className="flex flex-col gap-4">
            {record.stat_sheets.map((sheet, i) => (
              <StatSheetTable key={i} sheet={sheet} />
            ))}
          </div>
        )}

        {record && record.stat_sheets.length === 0 && (
          <p className="text-center text-sm text-slate-400">No detailed stat sheet was recorded for this match.</p>
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
    </div>,
    document.body
  )
}
