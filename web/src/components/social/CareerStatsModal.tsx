import { createPortal } from 'react-dom'
import type { PlayerStatSummary } from '../../lib/socialApi'
import { buttonSecondary } from '../../lib/formStyles'
import { PlayerStatsPentagon } from './PlayerStatsPentagon'

// The full career-stats detail (win-rate-by-sport pentagon, each sport's own
// stat pentagon, and the match-by-match history) — ProfilePage.tsx's Career
// Stats card shows only the one-line overall record and opens this on "Show
// details" instead of expanding inline, since there can be several
// pentagons plus a long match list to show at once.
export function CareerStatsModal({ statSummary, onClose }: { statSummary: PlayerStatSummary; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-hidden bg-slate-950/60 p-4">
      <div
        className="flex w-full max-w-lg min-w-0 flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6"
        style={{ maxHeight: '88vh' }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">Career Stats</h3>
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
        </div>

        {statSummary.overall.by_sport.length >= 3 && (
          <div className="flex flex-col items-center gap-1 border-b border-slate-100 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overall Record</p>
            <p className="text-sm text-slate-700">
              {statSummary.overall.wins}W&ndash;{statSummary.overall.losses}L{' '}
              <span className="text-slate-400">({statSummary.overall.win_rate}% win rate)</span>
            </p>
            {/* Reuses PlayerStatsPentagon's same N-gon radar chart — one axis
                per sport actually played, showing that sport's win rate out
                of 100 — rather than a separate chart type. */}
            <PlayerStatsPentagon
              sportName="Win Rate by Sport"
              axes={statSummary.overall.by_sport.map((s) => ({ key: String(s.sport_id), label: s.sport_name, scale_max: 100 }))}
              totals={Object.fromEntries(statSummary.overall.by_sport.map((s) => [String(s.sport_id), s.win_rate]))}
              matchesPlayed={statSummary.overall.matches_played}
            />
          </div>
        )}

        {statSummary.sports.map((entry) => (
          <div key={entry.sport_id} className="flex flex-col items-center">
            <PlayerStatsPentagon
              sportName={entry.sport_name}
              axes={entry.pentagon_fields}
              totals={entry.totals}
              matchesPlayed={entry.matches_played}
            />
            <p className="-mt-1 text-xs text-slate-400">
              {entry.wins}W&ndash;{entry.losses}L ({entry.win_rate}%)
            </p>
          </div>
        ))}

        {statSummary.history.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Match History</p>
            <ul className="mt-2 flex flex-col gap-2">
              {statSummary.history.map((h) => (
                <li key={h.match_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {h.sport_name} vs {h.opponent_name}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {h.tournament_name ?? 'Tournament'}
                      {h.date ? ` · ${new Date(h.date).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {h.score && <span className="text-xs text-slate-400">{h.score}</span>}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        h.result === 'win'
                          ? 'bg-teal-100 text-teal-700'
                          : h.result === 'loss'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {h.result === 'win' ? 'W' : h.result === 'loss' ? 'L' : 'D'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
