import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEvaluation, type PlayerSearchResult } from '../../lib/coachApi'
import { fetchPlayerStatSummary, fetchProfile } from '../../lib/socialApi'
import { fetchSports } from '../../lib/venueApi'
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, tiersFor, criteriaFor, type SkillLevelTier } from '../../lib/skillLevels'
import { SPORT_ATTRIBUTE_CRITERIA, SPORT_STAT_FIELDS, SPORT_COMPUTED_FIELDS, computeSportStats } from '../../lib/evaluationCriteria'
import { PlayerSearchPicker } from './PlayerSearchPicker'
import { PlayerSkillHistoryChart } from './PlayerSkillHistoryChart'
import { SkillLevelBadge } from '../player/SkillLevelBadge'
import { Avatar } from '../layout/Avatar'
import { buttonPrimary, fieldGroup, input, label, select, textarea } from '../../lib/formStyles'
import { IconChevronDown } from '../layout/icons'

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="w-full">
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

function allowedEvaluationTiers(currentLevel: SkillLevelTier | null, sportName: string | undefined): SkillLevelTier[] {
  const allTiers = tiersFor(sportName)
  if (!currentLevel) return allTiers

  const currentIndex = SKILL_LEVELS.indexOf(currentLevel)
  const maxIndex = Math.min(currentIndex + 1, allTiers.length - 1)
  return allTiers.slice(Math.max(0, currentIndex), maxIndex + 1)
}

export function EvaluationForm() {
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const [player, setPlayer] = useState<PlayerSearchResult | null>(null)
  const [expandedSkillId, setExpandedSkillId] = useState<number | null>(null)
  const { data: selectedProfile } = useQuery({
    queryKey: ['social', 'profile', player?.id],
    queryFn: () => fetchProfile(player!.id),
    enabled: !!player,
  })
  const { data: selectedStatSummary } = useQuery({
    queryKey: ['social', 'stat-summary', player?.id],
    queryFn: () => fetchPlayerStatSummary(player!.id),
    enabled: !!player,
  })
  const [sportId, setSportId] = useState<number | ''>('')
  const [level, setLevel] = useState<SkillLevelTier>('beginner')
  const activeSport = sports?.find((s) => s.id === sportId)
  const currentPlayerLevel = selectedProfile?.user.skill_levels.find(
    (skill) => skill.sport_id === Number(sportId) || skill.sport.id === Number(sportId)
  )?.level ?? null
  const availableTiers = allowedEvaluationTiers(currentPlayerLevel, activeSport?.name)

  useEffect(() => {
    if (!sportId) {
      setLevel('beginner')
      return
    }

    if (!availableTiers.includes(level)) {
      setLevel(availableTiers[0] ?? 'beginner')
    }
  }, [sportId, availableTiers, level])
  const [score, setScore] = useState('')
  const [notes, setNotes] = useState('')
  const [attributes, setAttributes] = useState<Partial<Record<string, number>>>({})
  const [rawStats, setRawStats] = useState<Record<string, string>>({})

  const recommendedSportNames = new Set<string>([
    ...(selectedProfile?.user.skill_levels ?? []).map((skill) => skill.sport.name),
    ...(selectedStatSummary?.sports ?? []).map((summary) => summary.sport_name),
  ])

  const orderedSports = [...(sports ?? [])].sort((a, b) => {
    const aRecommended = recommendedSportNames.has(a.name) ? 0 : 1
    const bRecommended = recommendedSportNames.has(b.name) ? 0 : 1
    if (aRecommended !== bRecommended) return aRecommended - bRecommended
    return a.name.localeCompare(b.name)
  })

  const sportName = activeSport?.name
  const statFields = sportName ? SPORT_STAT_FIELDS[sportName] : undefined
  const computedFields = sportName ? SPORT_COMPUTED_FIELDS[sportName] : undefined
  const attributeFields = sportName ? SPORT_ATTRIBUTE_CRITERIA[sportName] : undefined
  const tierCriteria = criteriaFor(sportName, level)

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
          attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
          sport_stats:
            Object.keys(rawStatsNumeric).length > 0 ? { raw: rawStatsNumeric, computed: computedStats } : undefined,
        },
      }),
    onSuccess: () => {
      setNotes('')
      setScore('')
      setAttributes({})
      setRawStats({})
      queryClient.invalidateQueries({ queryKey: ['coach', 'evaluations', player?.id] })
    },
  })

  return (
    <div className="flex w-full flex-col gap-4">
      <div className={fieldGroup}>
        <label className={label}>Player</label>
        <PlayerSearchPicker selected={player} onSelect={setPlayer} />
      </div>

      {player && (
        <>
          <div className="mx-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-center gap-3 text-center">
              <Avatar name={player.name} url={selectedProfile?.user.avatar_url ?? null} size="lg" className="border-2 border-white shadow-sm" />
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-900">{player.name}</p>
                <p className="text-sm text-slate-500">{player.email}</p>
              </div>
            </div>

            {selectedProfile?.user.skill_levels && selectedProfile.user.skill_levels.length > 0 ? (
              <div className="mt-4 flex w-full flex-col gap-2">
                {selectedProfile.user.skill_levels.map((skillLevel) => {
                  const isExpanded = expandedSkillId === skillLevel.id
                  const details = skillLevel.latest_evaluation

                  return (
                    <div key={skillLevel.id} className="w-full rounded-lg border border-slate-200 bg-slate-50/60">
                      <button
                        type="button"
                        onClick={() => setExpandedSkillId((current) => (current === skillLevel.id ? null : skillLevel.id))}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      >
                        <span className="w-full max-w-full">
                          <SkillLevelBadge skillLevel={skillLevel} />
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-500">{isExpanded ? 'Hide' : 'Show'}</span>
                      </button>

                      {isExpanded && details && (
                        <div className="border-t border-slate-200 bg-white p-3 text-left text-xs text-slate-600">
                          <div className="grid gap-2 sm:grid-cols-2">
                            {details.criteria?.attributes && Object.entries(details.criteria.attributes).map(([key, value]) => (
                              <div key={key} className="rounded-md bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200">
                                <span className="capitalize text-slate-500">{key.replace(/_/g, ' ')}</span>
                                <div className="mt-1 text-base font-semibold text-slate-800">{value}/10</div>
                              </div>
                            ))}
                          </div>

                          {details.criteria?.sport_stats?.computed && Object.keys(details.criteria.sport_stats.computed).length > 0 && (
                            <div className="mt-3">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Computed stats</p>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(details.criteria.sport_stats.computed).map(([key, value]) => (
                                  <span key={key} className="rounded-full bg-teal-50 px-2.5 py-1 font-medium text-teal-700">
                                    {key.replace(/_/g, ' ')}: {value}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {details.notes && <p className="mt-3 rounded-md bg-amber-50 p-2 text-slate-700">Notes: {details.notes}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-3 text-center text-sm text-slate-400">No coach evaluations yet.</p>
            )}
          </div>

          <div className="grid w-full gap-4 sm:grid-cols-2">
            <div className={fieldGroup}>
              <label className={label}>Sport</label>
              <select
                value={sportId}
                onChange={(e) => {
                  const nextSportId = e.target.value ? Number(e.target.value) : ''
                  setSportId(nextSportId)
                  setRawStats({})
                  setAttributes({})
                  const nextSportName = sports?.find((s) => s.id === nextSportId)?.name
                  const nextPlayerTier = selectedProfile?.user.skill_levels.find(
                    (skill) => skill.sport_id === Number(nextSportId) || skill.sport.id === Number(nextSportId)
                  )?.level ?? null
                  const nextTiers = allowedEvaluationTiers(nextPlayerTier, nextSportName)
                  if (!nextTiers.includes(level)) setLevel(nextTiers[0] ?? 'beginner')
                }}
                className={select}
              >
                <option value="">Sport...</option>
                {orderedSports.map((s) => {
                  const isRecommended = recommendedSportNames.has(s.name)
                  return (
                    <option key={s.id} value={s.id}>
                      {isRecommended ? `Recommended — ${s.name}` : s.name}
                    </option>
                  )
                })}
              </select>
            </div>
            <div className={fieldGroup}>
              <label className={label}>Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as SkillLevelTier)}
                className={select}
              >
                {availableTiers.map((l) => (
                  <option key={l} value={l}>
                    {SKILL_LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
              {tierCriteria && (
                <div className="mt-1 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-xs text-slate-600">
                  {tierCriteria.range && (
                    <p className="mb-1 font-semibold text-teal-700">{tierCriteria.range}</p>
                  )}
                  <p>
                    <span className="font-medium text-slate-700">Profile:</span> {tierCriteria.profile}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">Skills:</span> {tierCriteria.skills}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">Focus:</span> {tierCriteria.focus}
                  </p>
                </div>
              )}
            </div>
            <div className={`${fieldGroup} sm:col-span-2`}>
              <label className={label}>Score (optional)</label>
              <input
                type="number"
                placeholder="0–100"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className={`${input} w-full`}
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

          {attributeFields && (
            <CollapsibleSection title={`${sportName} Attribute Ratings`}>
              <div className="flex flex-col gap-4">
                {attributeFields.map((c) => (
                  <div key={c.key} className={fieldGroup}>
                    <div className="flex items-baseline justify-between gap-2">
                      <label className="text-sm font-medium text-slate-700">{c.label}</label>
                      <span className="text-sm font-semibold tabular-nums text-teal-700">
                        {attributes[c.key] ?? '—'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{c.description}</p>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={attributes[c.key] ?? 5}
                      onChange={(e) => setAttributes((a) => ({ ...a, [c.key]: Number(e.target.value) }))}
                      className="w-full accent-teal-600"
                    />
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

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
