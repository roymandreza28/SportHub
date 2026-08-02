export const SKILL_LEVELS = ['beginner', 'casual_player', 'developing_athlete', 'competitive_athlete'] as const

export type SkillLevelTier = (typeof SKILL_LEVELS)[number]

export const SKILL_LEVEL_LABELS: Record<SkillLevelTier, string> = {
  beginner: 'Beginner',
  casual_player: 'Casual Player',
  developing_athlete: 'Developing Athlete',
  competitive_athlete: 'Competitive Athlete',
}
