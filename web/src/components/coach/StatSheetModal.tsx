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
  const queryClient = useQueryClient()

  const { data: sheet, isLoading } = useQuery({
    queryKey: ['coach', 'stat-sheet', matchId],
    queryFn: () => fetchMatchStatSheet(matchId),
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
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        ref={containerRef}
        className="flex w-full max-w-6xl flex-col gap-4 overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
        style={{ maxHeight: '92vh' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {sheet ? `${sheet.participant_name} ${sheet.sport_name} Stat Sheet` : 'Stat Sheet'}
            </h3>
            {sheet && <p className="mt-0.5 text-xs text-slate-500">{sheet.tournament_name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className={buttonSecondary}>
              {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            </button>
            <button onClick={onClose} className={buttonSecondary}>
              Close
            </button>
          </div>
        </div>

        {isLoading && <p className="text-sm text-slate-500">Loading stat sheet...</p>}

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
              <div className="overflow-x-auto">
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
            ) : (
              <div className="overflow-x-auto">
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
