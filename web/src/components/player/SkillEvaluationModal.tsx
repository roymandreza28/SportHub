import { createPortal } from 'react-dom'
import type { SkillLevel } from '../../lib/playerApi'
import { buttonSecondary } from '../../lib/formStyles'
import { SkillLevelBadge } from './SkillLevelBadge'
import { SkillEvaluationChart } from './SkillEvaluationChart'

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
            return (
              <div key={sl.id} className="flex flex-col items-center gap-3">
                <SkillLevelBadge skillLevel={sl} />
                {attributes && Object.keys(attributes).length > 0 && (
                  <SkillEvaluationChart
                    sportName={sl.sport.name}
                    attributes={attributes}
                    caption={sl.coach ? `Evaluated by ${sl.coach.name}` : undefined}
                  />
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
