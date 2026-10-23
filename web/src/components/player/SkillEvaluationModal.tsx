import { createPortal } from 'react-dom'
import type { SkillLevel } from '../../lib/playerApi'
import { buttonSecondary } from '../../lib/formStyles'
import { SPORT_ATTRIBUTE_CRITERIA, SPORT_COMPUTED_FIELDS } from '../../lib/evaluationCriteria'
import { SKILL_LEVEL_LABELS } from '../../lib/skillLevels'
import { SkillLevelBadge } from './SkillLevelBadge'
import { SkillEvaluationChart } from './SkillEvaluationChart'

function EvaluationDetailList({
  sportName,
  attributes,
  rawStats,
  computedStats,
}: {
  sportName: string
  attributes?: Record<string, number>
  rawStats?: Record<string, number>
  computedStats?: Record<string, number>
}) {
  const attributeFields = SPORT_ATTRIBUTE_CRITERIA[sportName] ?? []
  const computedFields = SPORT_COMPUTED_FIELDS[sportName] ?? []

  return (
    <div className="flex flex-col gap-3">
      {attributes && Object.keys(attributes).length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Attribute ratings</p>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {attributeFields
              .filter((field) => attributes[field.key] !== undefined)
              .map((field) => (
                <span key={field.key} className="text-xs text-slate-600">
                  {field.label}: <strong className="font-semibold text-slate-800">{attributes[field.key]}/10</strong>
                </span>
              ))}
          </div>
        </div>
      )}

      {(rawStats || computedStats) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Performance stats</p>
          <div className="flex flex-wrap gap-2">
            {rawStats &&
              Object.entries(rawStats).map(([key, value]) => (
                <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
                  {key.replace(/_/g, ' ')}: {value}
                </span>
              ))}
            {computedStats &&
              computedFields
                .filter((field) => computedStats[field.key] !== undefined)
                .map((field) => (
                  <span key={field.key} className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700">
                    {field.label}: {computedStats[field.key]}
                    {field.unit === '%' ? '%' : field.unit === 'ratio' ? '' : ''}
                  </span>
                ))}
          </div>
        </div>
      )}
    </div>
  )
}

// The full skill-evaluation detail (one radar chart per evaluated sport) —
// ProfilePage.tsx's Skill Levels card shows only the compact badges and
// opens this on "Show details" instead of expanding inline, since a
// profile can have several sports' worth of charts to show at once.
export function SkillEvaluationModal({ skillLevels, onClose }: { skillLevels: SkillLevel[]; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-hidden bg-slate-950/60 p-4">
      <div
        className="flex w-full max-w-lg min-w-0 flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6"
        style={{ maxHeight: '88vh' }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">Skill Evaluations</h3>
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {skillLevels.map((sl) => {
            const attributes = sl.latest_evaluation?.criteria?.attributes
            const rawStats = sl.latest_evaluation?.criteria?.sport_stats?.raw
            const computedStats = sl.latest_evaluation?.criteria?.sport_stats?.computed
            const notes = sl.latest_evaluation?.notes
            const hasData = !!(attributes && Object.keys(attributes).length > 0) || !!(rawStats && Object.keys(rawStats).length > 0)

            return (
              <div key={sl.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex flex-col items-start gap-3">
                  <SkillLevelBadge skillLevel={sl} />

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                      {SKILL_LEVEL_LABELS[sl.level]}
                    </span>
                    {sl.score !== null && <span>Score: {sl.score}</span>}
                    {sl.coach && <span>Coach: {sl.coach.name}</span>}
                  </div>

                  {notes && (
                    <div className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Coach notes</p>
                      <p>{notes}</p>
                    </div>
                  )}
                </div>

                {hasData && (
                  <div className="mt-4 flex flex-col gap-3">
                    {attributes && Object.keys(attributes).length > 0 && (
                      <SkillEvaluationChart
                        sportName={sl.sport.name}
                        attributes={attributes}
                        caption={sl.coach ? `Evaluated by ${sl.coach.name}` : undefined}
                      />
                    )}
                    <EvaluationDetailList
                      sportName={sl.sport.name}
                      attributes={attributes}
                      rawStats={rawStats}
                      computedStats={computedStats}
                    />
                  </div>
                )}

                {!hasData && !notes && (
                  <p className="mt-3 text-sm text-slate-400">No detailed evaluation data recorded for this sport yet.</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
