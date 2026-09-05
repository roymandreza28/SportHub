import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMatchStatSheet,
  updateMatchStatSheet,
  type MatchStatSheetRosterData,
  type MatchStatSheetRosterRow,
  type MatchStatSheetSummaryData,
} from '../../lib/coachApi'
import { buttonPrimary, buttonSecondary, input, label, textarea } from '../../lib/formStyles'
import { extractErrorMessage } from '../../lib/errors'
import { useIsMobile } from '../../lib/useIsMobile'

// Basketball's total-points formula is the one place this modal special-cases
// a sport by name — every other sport's columns are purely data-driven from
// sheet.fields (see api/app/Support/StatSheetFieldSets.php), but this
// specific derived stat was explicitly requested for basketball and none of
// the other sheets define an equivalent computed column.
function basketballTotalPoints(stats: Record<string, number>) {
  return 2 * (stats.fg2_made || 0) + 3 * (stats.fg3_made || 0) + (stats.ft_made || 0)
}

export function StatSheetModal({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()

  const {
    data: sheet,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['coach', 'stat-sheet', matchId],
    queryFn: () => fetchMatchStatSheet(matchId),
    retry: false,
  })

  const [rows, setRows] = useState<MatchStatSheetRosterRow[]>([])
  const [values, setValues] = useState<Record<string, number>>({})
  const [totalPercent, setTotalPercent] = useState<Record<string, number | null>>({})
  const [furtherComments, setFurtherComments] = useState('')
  const [recordedBy, setRecordedBy] = useState('')
  const [signed, setSigned] = useState('')

  useEffect(() => {
    if (!sheet) return
    if (sheet.mode === 'roster') {
      const data = sheet.data as MatchStatSheetRosterData
      setRows(data.rows)
      setFurtherComments(data.further_comments ?? '')
      setRecordedBy(data.recorded_by ?? '')
      setSigned(data.signed ?? '')
    } else {
      const data = sheet.data as MatchStatSheetSummaryData
      setValues(data.values)
      setTotalPercent(data.total_percent)
      setFurtherComments(data.further_comments ?? '')
      setRecordedBy(data.recorded_by ?? '')
      setSigned(data.signed ?? '')
    }
  }, [sheet])

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => {})
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const common = { further_comments: furtherComments || null, recorded_by: recordedBy || null, signed: signed || null }
      const data: MatchStatSheetRosterData | MatchStatSheetSummaryData =
        sheet?.mode === 'roster' ? { rows, ...common } : { values, total_percent: totalPercent, ...common }
      return updateMatchStatSheet(matchId, data)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['coach', 'stat-sheet', matchId], data)
    },
  })

  function updateRowStat(index: number, key: string, value: number) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, stats: { ...row.stats, [key]: value } } : row)))
  }

  function updateRowField<K extends keyof MatchStatSheetRosterRow>(index: number, key: K, value: MatchStatSheetRosterRow[K]) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  const isLocked = sheet?.is_locked ?? false
  const fields = sheet?.fields ?? []
  const isBasketball = sheet?.sport_name === 'Basketball'

  return (
    <div
      className={
        isMobile
          ? 'fixed inset-0 z-30 overflow-hidden bg-white'
          : 'fixed inset-0 z-30 flex items-center justify-center overflow-hidden bg-slate-950/60 p-2 sm:p-4'
      }
    >
      <div
        ref={containerRef}
        className={
          isMobile
            ? 'flex h-full w-full min-w-0 flex-col gap-3 overflow-x-hidden overflow-y-auto p-3'
            : 'flex w-full min-w-0 max-w-6xl flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-xl bg-white p-3 shadow-2xl sm:p-6'
        }
        style={isMobile ? undefined : { maxHeight: '92vh' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-900">
              {sheet ? `${sheet.participant_name} ${sheet.sport_name} Stat Sheet` : 'Stat Sheet'}
            </h3>
            {sheet && <p className="mt-0.5 truncate text-xs text-slate-500">{sheet.tournament_name}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!isMobile && (
              <button onClick={toggleFullscreen} className={buttonSecondary}>
                {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              </button>
            )}
            <button onClick={onClose} className={buttonSecondary}>
              Close
            </button>
          </div>
        </div>

        {isLoading && <p className="text-sm text-slate-500">Loading stat sheet...</p>}
        {isError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {extractErrorMessage(error) || "You don't have access to this match's stat sheet."}
          </p>
        )}

        {sheet && (
          <>
            {isLocked && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                This stat sheet was locked when the match finished. It can no longer be edited.
              </p>
            )}

            <div className="grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-3">
              <p>
                <span className="font-semibold text-slate-800">Date:</span>{' '}
                {sheet.scheduled_at ? new Date(sheet.scheduled_at).toLocaleDateString() : 'TBD'}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Time:</span>{' '}
                {sheet.scheduled_at ? new Date(sheet.scheduled_at).toLocaleTimeString() : 'TBD'}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Opposition:</span> {sheet.opponent_name}
              </p>
            </div>

            {sheet.mode === 'roster' ? (
              isMobile ? (
                <div className="flex min-w-0 flex-col gap-2.5">
                  {rows.map((row, i) => (
                    <div key={row.player_id ?? i} className="min-w-0 rounded-lg border border-slate-200 p-3">
                      {/* Stacked, not a truncated single line next to the
                          jersey field — a long name wraps to a second line
                          instead of ever being clipped, since the whole
                          point is that the coach can always tell whose
                          stats these are. */}
                      <p className="break-words text-sm font-semibold text-slate-800">{row.name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Jersey #
                        </span>
                        {isLocked ? (
                          <span className="text-xs font-medium text-slate-600">{row.jersey_number || '—'}</span>
                        ) : (
                          <input
                            value={row.jersey_number}
                            onChange={(e) => updateRowField(i, 'jersey_number', e.target.value)}
                            placeholder="#"
                            className={`${input} w-14 shrink-0 px-1.5 py-1 text-center text-sm`}
                          />
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {fields.map((f) => (
                          <div key={f.key} className="rounded-md bg-slate-50 p-1.5 text-center">
                            <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                              {f.label}
                            </p>
                            {isLocked ? (
                              <p className="mt-0.5 text-sm font-semibold text-slate-800">{row.stats[f.key] ?? 0}</p>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                value={row.stats[f.key] ?? 0}
                                onChange={(e) => updateRowStat(i, f.key, Number(e.target.value) || 0)}
                                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1 py-1 text-center text-sm"
                              />
                            )}
                          </div>
                        ))}
                        {isBasketball && (
                          <div className="rounded-md bg-teal-50 p-1.5 text-center">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-teal-600">Total Pts</p>
                            <p className="mt-0.5 text-sm font-bold text-teal-700">{basketballTotalPoints(row.stats)}</p>
                          </div>
                        )}
                      </div>
                      <div className="mt-2">
                        {isLocked ? (
                          <p className="text-xs text-slate-500">{row.notes || '—'}</p>
                        ) : (
                          <input
                            value={row.notes}
                            onChange={(e) => updateRowField(i, 'notes', e.target.value)}
                            placeholder="Notes"
                            className={`${input} w-full px-2 py-1 text-sm`}
                          />
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-900">Team Totals</p>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {fields.map((f) => (
                        <div key={f.key} className="rounded-md bg-white p-1.5 text-center">
                          <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                            {f.label}
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-slate-900">
                            {rows.reduce((sum, r) => sum + (Number(r.stats[f.key]) || 0), 0)}
                          </p>
                        </div>
                      ))}
                      {isBasketball && (
                        <div className="rounded-md bg-teal-50 p-1.5 text-center">
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-teal-600">Total Pts</p>
                          <p className="mt-0.5 text-sm font-bold text-teal-700">
                            {rows.reduce((sum, r) => sum + basketballTotalPoints(r.stats), 0)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-2">Player</th>
                      <th className="py-2 pr-2">#</th>
                      {fields.map((f) => (
                        <th key={f.key} className="py-2 pr-2 text-center">
                          {f.label}
                        </th>
                      ))}
                      {isBasketball && <th className="py-2 pr-2 text-center">Total Pts</th>}
                      <th className="py-2 pr-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.player_id ?? i} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 font-medium text-slate-800">{row.name}</td>
                        <td className="py-1.5 pr-2">
                          {isLocked ? (
                            row.jersey_number
                          ) : (
                            <input
                              value={row.jersey_number}
                              onChange={(e) => updateRowField(i, 'jersey_number', e.target.value)}
                              className={`${input} w-12 px-1.5 py-1 text-center`}
                            />
                          )}
                        </td>
                        {fields.map((f) => (
                          <td key={f.key} className="py-1.5 pr-2 text-center">
                            {isLocked ? (
                              row.stats[f.key] ?? 0
                            ) : (
                              <input
                                type="number"
                                min={0}
                                value={row.stats[f.key] ?? 0}
                                onChange={(e) => updateRowStat(i, f.key, Number(e.target.value) || 0)}
                                className={`${input} w-14 px-1.5 py-1 text-center`}
                              />
                            )}
                          </td>
                        ))}
                        {isBasketball && (
                          <td className="py-1.5 pr-2 text-center font-semibold text-slate-800">
                            {basketballTotalPoints(row.stats)}
                          </td>
                        )}
                        <td className="py-1.5 pr-2">
                          {isLocked ? (
                            row.notes
                          ) : (
                            <input
                              value={row.notes}
                              onChange={(e) => updateRowField(i, 'notes', e.target.value)}
                              className={`${input} w-28 px-1.5 py-1`}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                      <td className="py-2 pr-2" colSpan={2}>
                        Team Totals
                      </td>
                      {fields.map((f) => (
                        <td key={f.key} className="py-2 pr-2 text-center">
                          {rows.reduce((sum, r) => sum + (Number(r.stats[f.key]) || 0), 0)}
                        </td>
                      ))}
                      {isBasketball && (
                        <td className="py-2 pr-2 text-center">
                          {rows.reduce((sum, r) => sum + basketballTotalPoints(r.stats), 0)}
                        </td>
                      )}
                      <td className="py-2 pr-2" />
                    </tr>
                  </tbody>
                </table>
              </div>
              )
            ) : isMobile ? (
              <div className="flex flex-col gap-2">
                {/* The desktop table's <th> makes this explicit ("Team
                    Performance Stats" / "Player Performance Stats") — the
                    mobile card grid below has no row header to fall back
                    on, so it's stated here instead of relying solely on the
                    (truncatable) modal title. */}
                <p className="break-words text-sm font-semibold text-slate-800">
                  {sheet.participant_name} — {sheet.participant_type === 'team' ? 'Team Performance Stats' : 'Player Performance Stats'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                {fields.map((f) => (
                  <div key={f.key} className="rounded-lg border border-slate-200 p-2.5">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {f.label}
                    </p>
                    {isLocked ? (
                      <p className="mt-1 text-lg font-bold text-slate-900">{values[f.key] ?? 0}</p>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        value={values[f.key] ?? 0}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) || 0 }))}
                        className={`${input} mt-1 w-full px-2 py-1 text-sm`}
                      />
                    )}
                    <div className="mt-1.5 flex items-center justify-between gap-1 border-t border-slate-100 pt-1.5 text-xs text-slate-500">
                      <span>Total %</span>
                      {isLocked ? (
                        <span>{totalPercent[f.key] != null ? `${totalPercent[f.key]}%` : '—'}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={totalPercent[f.key] ?? ''}
                          onChange={(e) =>
                            setTotalPercent((v) => ({ ...v, [f.key]: e.target.value === '' ? null : Number(e.target.value) }))
                          }
                          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-center text-xs"
                        />
                      )}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            ) : (
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-2">
                        {sheet.participant_type === 'team' ? 'Team Performance Stats' : 'Player Performance Stats'}
                      </th>
                      {fields.map((f) => (
                        <th key={f.key} className="py-2 pr-2 text-center">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 font-medium text-slate-800">Value</td>
                      {fields.map((f) => (
                        <td key={f.key} className="py-1.5 pr-2 text-center">
                          {isLocked ? (
                            values[f.key] ?? 0
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={values[f.key] ?? 0}
                              onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) || 0 }))}
                              className={`${input} w-16 px-1.5 py-1 text-center`}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-2 font-medium text-slate-800">Total %</td>
                      {fields.map((f) => (
                        <td key={f.key} className="py-1.5 pr-2 text-center">
                          {isLocked ? (
                            totalPercent[f.key] != null ? `${totalPercent[f.key]}%` : '—'
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={totalPercent[f.key] ?? ''}
                              onChange={(e) =>
                                setTotalPercent((v) => ({ ...v, [f.key]: e.target.value === '' ? null : Number(e.target.value) }))
                              }
                              className={`${input} w-16 px-1.5 py-1 text-center`}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className={label}>Further comments</label>
                {isLocked ? (
                  <p className="text-sm text-slate-700">{furtherComments || '—'}</p>
                ) : (
                  <textarea
                    value={furtherComments}
                    onChange={(e) => setFurtherComments(e.target.value)}
                    rows={3}
                    className={textarea}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={label}>Recorded by</label>
                {isLocked ? (
                  <p className="text-sm text-slate-700">{recordedBy || '—'}</p>
                ) : (
                  <input value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)} className={input} />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={label}>Signed</label>
                {isLocked ? (
                  <p className="text-sm text-slate-700">{signed || '—'}</p>
                ) : (
                  <input value={signed} onChange={(e) => setSigned(e.target.value)} className={input} />
                )}
              </div>
            </div>

            {!isLocked && (
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                {save.isError && <p className="text-xs text-red-600">{extractErrorMessage(save.error)}</p>}
                <button onClick={() => save.mutate()} disabled={save.isPending} className={buttonPrimary}>
                  {save.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
