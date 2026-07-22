import type { SkillLevel } from '../../lib/playerApi'

const LEVEL_COLORS: Record<SkillLevel['level'], string> = {
  beginner: 'bg-gray-100 text-gray-800',
  intermediate: 'bg-blue-100 text-blue-800',
  advanced: 'bg-purple-100 text-purple-800',
  pro: 'bg-amber-100 text-amber-900',
}

export function SkillLevelBadge({ skillLevel }: { skillLevel: SkillLevel }) {
  return (
    <span className={`rounded px-2 py-1 text-xs ${LEVEL_COLORS[skillLevel.level]}`}>
      {skillLevel.sport.name}: {skillLevel.level}
      {skillLevel.coach && ` (evaluated by ${skillLevel.coach.name})`}
    </span>
  )
}
