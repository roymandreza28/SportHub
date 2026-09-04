import type { SkillLevel } from '../../lib/playerApi'
import { SKILL_LEVEL_LABELS } from '../../lib/skillLevels'

const LEVEL_COLORS: Record<SkillLevel['level'], string> = {
  beginner: 'bg-slate-100 text-slate-800',
  casual_player: 'bg-blue-100 text-blue-800',
  developing_athlete: 'bg-purple-100 text-purple-800',
  competitive_athlete: 'bg-amber-100 text-amber-900',
  professional: 'bg-teal-100 text-teal-900',
}

export function SkillLevelBadge({ skillLevel }: { skillLevel: SkillLevel }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${LEVEL_COLORS[skillLevel.level]}`}>
      {skillLevel.sport.name}: {SKILL_LEVEL_LABELS[skillLevel.level]}
      {skillLevel.coach && ` (evaluated by ${skillLevel.coach.name})`}
    </span>
  )
}
