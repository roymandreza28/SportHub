import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEvaluation, type PlayerSearchResult } from '../../lib/coachApi'
import { fetchPlayerStatSummary, fetchProfile } from '../../lib/socialApi'
import { fetchMatchRecord } from '../../lib/organizerApi'
import { fetchSports } from '../../lib/venueApi'
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, tiersFor, criteriaFor, type SkillLevelTier } from '../../lib/skillLevels'
import { SPORT_ATTRIBUTE_CRITERIA, SPORT_STAT_FIELDS, SPORT_COMPUTED_FIELDS, computeSportStats } from '../../lib/evaluationCriteria'
import { PlayerSearchPicker } from './PlayerSearchPicker'
import { PlayerSkillHistoryChart } from './PlayerSkillHistoryChart'
import { SkillLevelBadge } from '../player/SkillLevelBadge'
import { SkillEvaluationChart } from '../player/SkillEvaluationChart'
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

function GameHistoryDetails({ matchId }: { matchId: number }) {
  const { data: record, isLoading } = useQuery({
    queryKey: ['match-record', matchId],
    queryFn: () => fetchMatchRecord(matchId),
  })

  if (isLoading) return <p className="mt-2 text-xs text-slate-500">Loading stat sheet...</p>
  if (!record || record.stat_sheets.length === 0) {
    return <p className="mt-2 text-xs text-slate-400">No detailed stat sheet recorded for this match.</p>
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      {record.stat_sheets.map((sheet, index) => {
        const rows =
          sheet.mode === 'roster'
            ? (sheet.data.rows ?? []).map((row) => ({ id: row.player_id, name: row.name, stats: row.stats }))
            : [{ id: 0, name: sheet.participant_name ?? 'Player', stats: sheet.data.values ?? {} }]

        return (
          <div key={`${sheet.participant_name ?? 'sheet'}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60">
            <p className="border-b border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {sheet.participant_name ?? 'Stat sheet'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-2.5 py-1.5 font-medium">Player</th>
                    {sheet.fields.map((field) => (
                      <th key={field.key} className="px-2 py-1.5 text-right font-medium">
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="truncate px-2.5 py-1.5 font-medium text-slate-700">{row.name}</td>
                      {sheet.fields.map((field) => (
                        <td key={field.key} className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                          {row.stats[field.key] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.data.further_comments && (
              <p className="border-t border-slate-200 bg-white px-3 py-2 italic text-slate-500">"{sheet.data.further_comments}"</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function allowedEvaluationTiers(
  currentLevel: SkillLevelTier | null,
  sportName: string | undefined,
  hasSportHistory: boolean,
): SkillLevelTier[] {
  const allTiers = tiersFor(sportName)

  if (!hasSportHistory) {
    return allTiers.filter((tier) => tier === 'beginner' || tier === 'casual_player')
  }

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
  const [showLevelMenu, setShowLevelMenu] = useState(false)
  const [hoveredLevel, setHoveredLevel] = useState<SkillLevelTier | null>(null)
  const activeSport = sports?.find((s) => s.id === sportId)
  const hasSportHistory = !!(
    activeSport && (
      selectedProfile?.user.skill_levels.some((skill) => skill.sport.name === activeSport.name) ||
      selectedStatSummary?.sports.some((summary) => summary.sport_name === activeSport.name)
    )
  )
  const currentPlayerLevel = selectedProfile?.user.skill_levels.find(
    (skill) => skill.sport_id === Number(sportId) || skill.sport.id === Number(sportId)
  )?.level ?? null
  const availableTiers = allowedEvaluationTiers(currentPlayerLevel, activeSport?.name, hasSportHistory)

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
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null)

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
  const hoverTierCriteria = hoveredLevel ? criteriaFor(sportName, hoveredLevel) : null
  const tierCriteria = criteriaFor(sportName, level)
  const activeLevelInfo = hoverTierCriteria ?? tierCriteria

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
        <PlayerSearchPicker selected={player} onSelect={setPlayer} multiple={false} />
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
                          {details.criteria?.attributes && Object.keys(details.criteria.attributes).length > 0 && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <SkillEvaluationChart
                                sportName={skillLevel.sport.name}
                                attributes={details.criteria.attributes}
                                caption={skillLevel.coach ? `Evaluated by ${skillLevel.coach.name}` : undefined}
                              />
                            </div>
                          )}

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
                  const nextSportHistory = !!(
                    nextSportName && (
                      selectedProfile?.user.skill_levels.some((skill) => skill.sport.name === nextSportName) ||
                      selectedStatSummary?.sports.some((summary) => summary.sport_name === nextSportName)
                    )
                  )
                  const nextPlayerTier = selectedProfile?.user.skill_levels.find(
                    (skill) => skill.sport_id === Number(nextSportId) || skill.sport.id === Number(nextSportId)
                  )?.level ?? null
                  const nextTiers = allowedEvaluationTiers(nextPlayerTier, nextSportName, nextSportHistory)
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
            <div className={`${fieldGroup} relative`}>
              <label className={label}>Level</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLevelMenu((v) => !v)}
                  className={`${select} flex w-full items-center justify-between text-left`}
                >
                  <span>{SKILL_LEVEL_LABELS[level]}</span>
                  <span className="text-slate-400">▾</span>
                </button>

                {showLevelMenu && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 flex gap-2">
                    <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      {availableTiers.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onMouseEnter={() => setHoveredLevel(l)}
                          onMouseLeave={() => setHoveredLevel(null)}
                          onClick={() => {
                            setLevel(l)
                            setHoveredLevel(null)
                            setShowLevelMenu(false)
                          }}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition ${
                            level === l ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{SKILL_LEVEL_LABELS[l]}</span>
                          {level === l && <span className="text-xs text-teal-600">Selected</span>}
                        </button>
                      ))}
                    </div>

                    {activeLevelInfo && (
                      <div className="hidden w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-600 shadow-lg md:block">
                        <div className="mb-2 font-semibold text-slate-800">
                          {SKILL_LEVEL_LABELS[(hoveredLevel ?? level)]}
                        </div>
                        {activeLevelInfo.range && <p className="mb-1 font-semibold text-teal-700">{activeLevelInfo.range}</p>}
                        <p>
                          <span className="font-medium text-slate-700">Profile:</span> {activeLevelInfo.profile}
                        </p>
                        <p className="mt-1">
                          <span className="font-medium text-slate-700">Skills:</span> {activeLevelInfo.skills}
                        </p>
                        <p className="mt-1">
                          <span className="font-medium text-slate-700">Focus:</span> {activeLevelInfo.focus}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
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

          {selectedStatSummary && selectedStatSummary.history.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <h4 className={`${label} mb-2`}>Game history</h4>
              <div className="flex flex-col gap-2">
                {selectedStatSummary.history.map((entry) => {
                  const expanded = expandedGameId === entry.match_id
                  return (
                    <div key={entry.match_id} className="rounded-lg border border-slate-200 bg-slate-50/50">
                      <button
                        type="button"
                        onClick={() => setExpandedGameId((current) => (current === entry.match_id ? null : entry.match_id))}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {entry.sport_name} vs {entry.opponent_name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {entry.tournament_name ?? 'Tournament'}
                            {entry.date ? ` · ${new Date(entry.date).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {entry.score && <span className="text-xs text-slate-400">{entry.score}</span>}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              entry.result === 'win'
                                ? 'bg-teal-100 text-teal-700'
                                : entry.result === 'loss'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {entry.result === 'win' ? 'W' : entry.result === 'loss' ? 'L' : 'D'}
                          </span>
                          <span className="text-xs font-medium text-slate-500">{expanded ? 'Hide' : 'Details'}</span>
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-slate-200 bg-white p-3 text-xs text-slate-600">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div><span className="font-medium text-slate-700">Tournament:</span> {entry.tournament_name ?? 'N/A'}</div>
                            <div><span className="font-medium text-slate-700">Date:</span> {entry.date ? new Date(entry.date).toLocaleDateString() : 'N/A'}</div>
                            <div><span className="font-medium text-slate-700">Opponent:</span> {entry.opponent_name}</div>
                            <div><span className="font-medium text-slate-700">Result:</span> {entry.result}</div>
                          </div>
                          {entry.score && <p className="mt-2"><span className="font-medium text-slate-700">Score:</span> {entry.score}</p>}
                          <div className="mt-3">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Match stat sheet</p>
                            <GameHistoryDetails matchId={entry.match_id} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
