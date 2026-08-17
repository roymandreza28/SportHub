import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEvaluation, type PlayerSearchResult } from '../../lib/coachApi'
import { fetchSports } from '../../lib/venueApi'
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, type SkillLevelTier } from '../../lib/skillLevels'
import {
  GENERAL_CRITERIA,
  SPORT_STAT_FIELDS,
  SPORT_COMPUTED_FIELDS,
  computeSportStats,
  type GeneralCriterionKey,
} from '../../lib/evaluationCriteria'
import { PlayerSearchPicker } from './PlayerSearchPicker'
import { PlayerSkillHistoryChart } from './PlayerSkillHistoryChart'
import { buttonPrimary, fieldGroup, input, label, select, textarea } from '../../lib/formStyles'
import { IconChevronDown } from '../layout/icons'

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="max-w-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span>{title}</span>
        <IconChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">{children}</div>}
    </div>
  )
}

export function EvaluationForm() {
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const [player, setPlayer] = useState<PlayerSearchResult | null>(null)
  const [sportId, setSportId] = useState<number | ''>('')
  const [level, setLevel] = useState<SkillLevelTier>('beginner')
  const [score, setScore] = useState('')
  const [notes, setNotes] = useState('')
  const [general, setGeneral] = useState<Partial<Record<GeneralCriterionKey, number>>>({})
  const [rawStats, setRawStats] = useState<Record<string, string>>({})

  const sportName = sports?.find((s) => s.id === sportId)?.name
  const statFields = sportName ? SPORT_STAT_FIELDS[sportName] : undefined
  const computedFields = sportName ? SPORT_COMPUTED_FIELDS[sportName] : undefined

  const rawStatsNumeric = Object.fromEntries(
    Object.entries(rawStats)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => [k, Number(v)])
  )
  const computedStats = sportName ? computeSportStats(sportName, rawStatsNumeric) : {}

  const mutation = useMutation({
    mutationFn: () =>
      createEvaluation({
        player_id: player!.id,
        sport_id: Number(sportId),
        level,
        score: score ? Number(score) : undefined,
        notes: notes || undefined,
        criteria: {
          general: Object.keys(general).length > 0 ? general : undefined,
          sport_stats:
            Object.keys(rawStatsNumeric).length > 0 ? { raw: rawStatsNumeric, computed: computedStats } : undefined,
        },
      }),
    onSuccess: () => {
      setNotes('')
      setScore('')
      setGeneral({})
      setRawStats({})
      queryClient.invalidateQueries({ queryKey: ['coach', 'evaluations', player?.id] })
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className={`${fieldGroup} max-w-md`}>
        <label className={label}>Player</label>
        <PlayerSearchPicker selected={player} onSelect={setPlayer} />
      </div>

      {player && (
        <>
          <div className="grid max-w-md gap-4 sm:grid-cols-2">
            <div className={fieldGroup}>
              <label className={label}>Sport</label>
              <select
                value={sportId}
                onChange={(e) => {
                  setSportId(e.target.value ? Number(e.target.value) : '')
                  setRawStats({})
                }}
                className={select}
              >
                <option value="">Sport...</option>
                {sports?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={fieldGroup}>
              <label className={label}>Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as SkillLevelTier)}
                className={select}
              >
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {SKILL_LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>
            <div className={fieldGroup}>
              <label className={label}>Score (optional)</label>
              <input
                type="number"
                placeholder="0–100"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className={input}
              />
            </div>
            <div className={`${fieldGroup} sm:col-span-2`}>
              <label className={label}>Notes (optional)</label>
              <textarea
                placeholder="What did you observe?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={textarea}
                rows={2}
              />
            </div>
          </div>

          <CollapsibleSection title="General Criteria">
            <div className="flex flex-col gap-4">
              {GENERAL_CRITERIA.map((c) => (
                <div key={c.key} className={fieldGroup}>
                  <div className="flex items-baseline justify-between gap-2">
                    <label className="text-sm font-medium text-slate-700">{c.label}</label>
                    <span className="text-sm font-semibold tabular-nums text-teal-700">{general[c.key] ?? '—'}</span>
                  </div>
                  <p className="text-xs text-slate-500">{c.description}</p>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={general[c.key] ?? 5}
                    onChange={(e) => setGeneral((g) => ({ ...g, [c.key]: Number(e.target.value) }))}
                    className="w-full accent-teal-600"
                  />
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {statFields && (
            <CollapsibleSection title={`${sportName} Stats`}>
              <div className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {statFields.map((f) => (
                    <div key={f.key} className={fieldGroup}>
                      <label className={label}>{f.label}</label>
                      <input
                        type="number"
                        step="any"
                        value={rawStats[f.key] ?? ''}
                        onChange={(e) => setRawStats((r) => ({ ...r, [f.key]: e.target.value }))}
                        className={input}
                      />
                    </div>
                  ))}
                </div>

                {computedFields && Object.keys(computedStats).length > 0 && (
                  <div className="border-t border-slate-100 pt-3">
                    <p className={`${label} mb-2`}>Computed</p>
                    <div className="flex flex-wrap gap-2">
                      {computedFields
                        .filter((c) => computedStats[c.key] !== undefined)
                        .map((c) => (
                          <span
                            key={c.key}
                            className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700"
                          >
                            {c.label}: {computedStats[c.key]}
                            {c.unit === '%' ? '%' : ''}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          <button
            onClick={() => mutation.mutate()}
            disabled={!sportId || mutation.isPending}
            className={`${buttonPrimary} self-start`}
          >
            {mutation.isPending ? 'Saving...' : 'Submit evaluation'}
          </button>

          <div className="border-t border-slate-100 pt-4">
            <h4 className={`${label} mb-2`}>Skill history</h4>
            <PlayerSkillHistoryChart playerId={player.id} />
          </div>
        </>
      )}
    </div>
  )
}
