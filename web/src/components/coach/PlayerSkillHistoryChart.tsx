import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchEvaluations, updateEvaluation, type EvaluationEntry } from '../../lib/coachApi'
import { SKILL_LEVEL_LABELS, tiersFor, type SkillLevelTier } from '../../lib/skillLevels'
import { SPORT_ATTRIBUTE_CRITERIA, SPORT_COMPUTED_FIELDS } from '../../lib/evaluationCriteria'
import { useAuth } from '../../lib/AuthContext'
import { buttonGhost, buttonPrimary, buttonSecondary, fieldGroup, input, label, select, textarea } from '../../lib/formStyles'
import { extractErrorMessage } from '../../lib/errors'

const LEVEL_HEIGHT: Record<SkillLevelTier, string> = {
  beginner: '20%',
  casual_player: '40%',
  developing_athlete: '60%',
  competitive_athlete: '80%',
  professional: '100%',
}

function EvaluationDetail({ evaluation }: { evaluation: EvaluationEntry }) {
  const criteria = evaluation.criteria
  const attributes = criteria?.attributes
  const rawStats = criteria?.sport_stats?.raw
  const computedStats = criteria?.sport_stats?.computed
  const sportName = evaluation.skill_level.sport.name
  const computedFields = SPORT_COMPUTED_FIELDS[sportName]
  const attributeFields = SPORT_ATTRIBUTE_CRITERIA[sportName]

  if (!attributes && !rawStats) return null

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      {attributes && attributeFields && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {attributeFields.filter((c) => attributes[c.key] !== undefined).map((c) => (
            <span key={c.key} className="text-xs text-slate-600">
              {c.label}: <strong className="font-semibold text-slate-800">{attributes[c.key]}/10</strong>
            </span>
          ))}
        </div>
      )}
      {computedStats && computedFields && Object.keys(computedStats).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {computedFields
            .filter((c) => computedStats[c.key] !== undefined)
            .map((c) => (
              <span key={c.key} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
                {c.label}: {computedStats[c.key]}
                {c.unit === '%' ? '%' : ''}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

// Corrects level/score/notes on an existing evaluation — deliberately not
// the full attribute-ratings/stat-input UI EvaluationForm offers on create,
// since this is for fixing a mistake, not re-recording a full assessment
// (a new evaluation still covers that, keeping its own history entry).
function EditEvaluationForm({
  evaluation,
  onDone,
}: {
  evaluation: EvaluationEntry
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [level, setLevel] = useState<SkillLevelTier>(evaluation.skill_level.level)
  const [score, setScore] = useState(evaluation.skill_level.score ?? '')
  const [notes, setNotes] = useState(evaluation.notes ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateEvaluation(evaluation.id, {
        level,
        score: score === '' ? undefined : Number(score),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach', 'evaluations'] })
      onDone()
    },
  })

  const availableTiers = tiersFor(evaluation.skill_level.sport.name)

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-teal-100 bg-teal-50/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label className={label}>Level</label>
          <select value={level} onChange={(e) => setLevel(e.target.value as SkillLevelTier)} className={select}>
            {availableTiers.map((l) => (
              <option key={l} value={l}>
                {SKILL_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldGroup}>
          <label className={label}>Score</label>
          <input
            type="number"
            placeholder="0–100"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className={input}
          />
        </div>
      </div>
      <div className={fieldGroup}>
        <label className={label}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textarea} rows={2} />
      </div>
      {mutation.isError && <p className="text-xs text-red-600">{extractErrorMessage(mutation.error)}</p>}
      <div className="flex gap-2">
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className={`${buttonPrimary} text-xs`}>
          {mutation.isPending ? 'Saving...' : 'Save correction'}
        </button>
        <button onClick={onDone} className={`${buttonSecondary} text-xs`}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export function PlayerSkillHistoryChart({ playerId }: { playerId: number }) {
  const { user } = useAuth()
  const { data: evaluations } = useQuery({
    queryKey: ['coach', 'evaluations', playerId],
    queryFn: () => fetchEvaluations(playerId),
  })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  if (!evaluations || evaluations.length === 0) {
    return <p className="text-sm text-slate-400">No evaluation history for this player yet.</p>
  }

  // Oldest first, so the bar chart reads left-to-right as a timeline.
  const chronological = [...evaluations].reverse()

  // Only the most recent evaluation per sport is editable (the backend
  // enforces this too) — evaluations arrive newest-first, so the first
  // occurrence of each skill_level id is that sport's editable one.
  const latestSkillLevelIds = new Set<number>()
  const editableIds = new Set<number>()
  for (const e of evaluations) {
    if (!latestSkillLevelIds.has(e.skill_level.id)) {
      latestSkillLevelIds.add(e.skill_level.id)
      editableIds.add(e.id)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-24 items-end gap-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        {chronological.map((evaluation) => (
          <div
            key={evaluation.id}
            title={`${evaluation.skill_level.sport.name}: ${SKILL_LEVEL_LABELS[evaluation.skill_level.level]} on ${new Date(evaluation.created_at).toLocaleDateString()}`}
            className="w-4 rounded-t-sm bg-gradient-to-t from-teal-600 to-teal-400"
            style={{ height: LEVEL_HEIGHT[evaluation.skill_level.level] }}
          />
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-slate-100 text-xs text-slate-600">
        {evaluations.map((evaluation) => {
          const hasDetail = !!(evaluation.criteria?.attributes || evaluation.criteria?.sport_stats?.raw)
          const canEdit = editableIds.has(evaluation.id) && user?.id === evaluation.coach.id
          return (
            <li key={evaluation.id} className="py-1.5">
              <div className="flex items-start justify-between gap-2">
                <p>
                  <span className="text-slate-400">{new Date(evaluation.created_at).toLocaleDateString()}</span> —{' '}
                  {evaluation.skill_level.sport.name}:{' '}
                  <strong className="font-semibold text-slate-800">
                    {SKILL_LEVEL_LABELS[evaluation.skill_level.level]}
                  </strong>
                  {evaluation.skill_level.score && ` (${evaluation.skill_level.score})`} by {evaluation.coach.name}
                  {evaluation.notes && ` — "${evaluation.notes}"`}
                </p>
                <div className="flex shrink-0 gap-2">
                  {canEdit && editingId !== evaluation.id && (
                    <button onClick={() => setEditingId(evaluation.id)} className={buttonGhost}>
                      Edit
                    </button>
                  )}
                  {hasDetail && (
                    <button
                      onClick={() => setExpandedId((id) => (id === evaluation.id ? null : evaluation.id))}
                      className="text-xs font-medium text-teal-600 hover:text-teal-700"
                    >
                      {expandedId === evaluation.id ? 'Hide details' : 'Details'}
                    </button>
                  )}
                </div>
              </div>
              {editingId === evaluation.id && (
                <EditEvaluationForm evaluation={evaluation} onDone={() => setEditingId(null)} />
              )}
              {expandedId === evaluation.id && <EvaluationDetail evaluation={evaluation} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
