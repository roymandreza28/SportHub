export const SKILL_LEVELS = [
  'beginner',
  'casual_player',
  'developing_athlete',
  'competitive_athlete',
  'professional',
] as const

export type SkillLevelTier = (typeof SKILL_LEVELS)[number]

export const SKILL_LEVEL_LABELS: Record<SkillLevelTier, string> = {
  beginner: 'Beginner / Recreational',
  casual_player: 'Intermediate / Developmental',
  developing_athlete: 'Advanced / Competitive',
  competitive_athlete: 'Elite / National Level',
  professional: 'Professional / World-Class',
}

// Every sport offers the same first 4 rungs of the ladder — only Bowling's
// real-world tier structure (PBA/international tour) goes to a 5th. The
// stored `level` enum stays shared/generic (see the skill_levels CHECK
// constraint) since matchmaking already compares tiers scoped to one sport
// at a time (MatchmakingRequestController) — it's purely which OPTIONS the
// coach evaluation form offers that varies per sport.
export function tiersFor(sportName: string | undefined): SkillLevelTier[] {
  if (sportName === 'Bowling') return [...SKILL_LEVELS]
  return SKILL_LEVELS.filter((t) => t !== 'professional')
}

export type TierCriteria = {
  profile: string
  skills: string
  focus: string
  // Only a few sports publish a numeric rating-system range for this tier
  // (DUPR for Pickleball, NTRP/UTR for Tennis).
  range?: string
}

export const SKILL_LEVEL_CRITERIA: Record<string, Partial<Record<SkillLevelTier, TierCriteria>>> = {
  Basketball: {
    beginner: {
      profile: 'New to the game, limited understanding of rules and fundamentals.',
      skills: 'Basic dribbling, passing, shooting form still developing.',
      focus: 'Learning fundamentals, building confidence, conditioning.',
    },
    casual_player: {
      profile: 'Plays regularly, understands rules, can contribute in casual leagues.',
      skills: 'Consistent layups, mid-range shots, basic defensive positioning, improved ball handling.',
      focus: 'Refining technique, learning team concepts, improving stamina.',
    },
    developing_athlete: {
      profile: 'Plays in organized leagues, strong grasp of team strategies.',
      skills: 'Reliable shooting (mid-range and some 3-point), solid defense, good passing vision, situational awareness.',
      focus: 'Specializing in roles (shooter, defender, playmaker), improving decision-making under pressure.',
    },
    competitive_athlete: {
      profile: 'Competes at collegiate or semi-professional level.',
      skills: 'High shooting percentages, advanced ball handling, strong defensive reads, leadership qualities.',
      focus: 'Mastery of offensive/defensive schemes, conditioning, mental toughness.',
    },
  },
  Volleyball: {
    beginner: {
      profile: 'Just learning the game, often in school or casual play.',
      skills: 'Basic underhand serve, bump (forearm pass), limited control, struggles with positioning.',
      focus: 'Learning rules, rotations, and fundamental techniques.',
    },
    casual_player: {
      profile: 'Plays regularly in school teams or local leagues.',
      skills: 'Overhand serve, controlled passing, basic setting, consistent bumping, some spiking attempts.',
      focus: 'Improving consistency, learning offensive/defensive systems, teamwork.',
    },
    developing_athlete: {
      profile: 'Club-level or varsity athletes.',
      skills: 'Jump serve, accurate setting, strong spiking with approach, blocking fundamentals, defensive coverage.',
      focus: 'Role specialization (setter, libero, outside hitter, middle blocker), tactical awareness, conditioning.',
    },
    competitive_athlete: {
      profile: 'Competes at collegiate, national, or semi-professional level.',
      skills: 'Powerful jump serves, quick offensive plays, strong blocking reads, advanced defensive transitions, leadership on court.',
      focus: 'Mastery of offensive/defensive systems, mental toughness, adaptability.',
    },
  },
  Badminton: {
    beginner: {
      profile: 'Just starting out, plays casually.',
      skills: 'Basic grip, short rallies, limited footwork, inconsistent serves.',
      focus: 'Learning rules, scoring system, grip techniques, and simple strokes (clear, drop, smash basics).',
    },
    casual_player: {
      profile: 'Plays regularly in school or local clubs.',
      skills: 'Consistent serves, basic footwork patterns, controlled clears and drops, occasional smashes.',
      focus: 'Improving shot accuracy, stamina, and tactical awareness (knowing when to attack or defend).',
    },
    developing_athlete: {
      profile: 'Competes in organized leagues or tournaments.',
      skills: 'Reliable smashes, deceptive shots, strong net play, efficient footwork, tactical shot placement.',
      focus: 'Role specialization (singles vs doubles strategies), advanced conditioning, mental focus.',
    },
    competitive_athlete: {
      profile: 'Collegiate, national, or semi-professional players.',
      skills: 'Powerful and consistent smashes, deceptive net shots, advanced footwork (split-step, recovery), strong tactical adaptability.',
      focus: 'Mastery of offensive/defensive transitions, endurance, psychological resilience.',
    },
  },
  Pickleball: {
    beginner: {
      profile: 'Just learning the game, casual play.',
      skills: 'Basic serve and return, short rallies, limited control, struggles with positioning.',
      focus: 'Learning rules, scoring, and fundamental strokes (dinks, volleys, drops).',
      range: '1.0–2.0 DUPR',
    },
    casual_player: {
      profile: 'Plays regularly in clubs or local leagues.',
      skills: 'Consistent serves, controlled dinks, basic third-shot drops, improved footwork, some net play.',
      focus: 'Shot accuracy, rally consistency, learning doubles strategies.',
      range: '2.5–3.5 DUPR',
    },
    developing_athlete: {
      profile: 'Competes in tournaments or organized leagues.',
      skills: 'Reliable third-shot drops, strong volleys, effective lobs, tactical shot placement, quick kitchen control.',
      focus: 'Role specialization (doubles teamwork, singles stamina), advanced tactics, conditioning.',
      range: '4.0–4.5 DUPR',
    },
    competitive_athlete: {
      profile: 'Collegiate, national, or semi-professional players.',
      skills: 'Powerful serves, deceptive shots, advanced net play, strong defensive transitions, mental toughness.',
      focus: 'Mastery of offensive/defensive systems, adaptability, endurance.',
      range: '5.0–5.5 DUPR',
    },
  },
  Tennis: {
    beginner: {
      profile: 'Just learning the game, casual play.',
      skills: 'Basic forehand/backhand, limited serve consistency, short rallies.',
      focus: 'Learning rules, scoring, grips, and fundamental strokes.',
      range: 'NTRP 1.0–2.0',
    },
    casual_player: {
      profile: 'Plays regularly in school or local clubs.',
      skills: 'Consistent groundstrokes, basic volleys, reliable serves, improved footwork.',
      focus: 'Rally consistency, shot placement, learning doubles strategies.',
      range: 'NTRP 2.5–3.5',
    },
    developing_athlete: {
      profile: 'Competes in tournaments or organized leagues.',
      skills: 'Reliable serves with spin, strong groundstrokes, effective volleys, tactical shot selection.',
      focus: 'Role specialization (singles vs doubles), advanced conditioning, mental focus.',
      range: 'NTRP 4.0–4.5',
    },
    competitive_athlete: {
      profile: 'Collegiate, national, or semi-professional players.',
      skills: 'Powerful serves, consistent topspin/backspin, advanced net play, strong defensive transitions.',
      focus: 'Mastery of offensive/defensive systems, adaptability, endurance.',
      range: 'NTRP 5.0–5.5 / UTR 9–11',
    },
  },
  'Table Tennis': {
    beginner: {
      profile: 'Just learning the game, casual play.',
      skills: 'Basic grip, short rallies, limited control, struggles with serve consistency.',
      focus: 'Learning rules, scoring, grip techniques, and fundamental strokes (forehand/backhand drive).',
    },
    casual_player: {
      profile: 'Plays regularly in school or local clubs.',
      skills: 'Consistent serves, controlled forehand/backhand drives, basic push and block, improved footwork.',
      focus: 'Rally consistency, shot placement, learning spin basics (topspin, backspin).',
    },
    developing_athlete: {
      profile: 'Competes in organized leagues or tournaments.',
      skills: 'Reliable serves with spin, strong loops, effective blocking, tactical shot selection, quick footwork.',
      focus: 'Role specialization (offensive looper vs defensive chopper), advanced conditioning, mental focus.',
    },
    competitive_athlete: {
      profile: 'Collegiate, national, or semi-professional players.',
      skills: 'Powerful loops, deceptive serves, advanced counter-attacks, strong defensive transitions, tactical adaptability.',
      focus: 'Mastery of offensive/defensive systems, endurance, psychological resilience.',
    },
  },
  Bowling: {
    beginner: {
      profile: 'Casual players, often new to the sport.',
      skills: 'Basic grip and release, inconsistent aim, limited understanding of lane conditions.',
      focus: 'Learning scoring rules, proper stance, and fundamental delivery.',
    },
    casual_player: {
      profile: 'Plays regularly in leagues or social events.',
      skills: 'Consistent release, basic hook control, improved spare shooting, some lane adjustment awareness.',
      focus: 'Refining accuracy, learning oil patterns, developing a repeatable approach.',
    },
    developing_athlete: {
      profile: 'Competes in local or regional tournaments.',
      skills: 'Reliable hook, strong spare conversion, tactical ball changes, lane-reading ability.',
      focus: 'Strategy, mental toughness, adapting to lane transitions, higher averages (typically 180–200+).',
    },
    competitive_athlete: {
      profile: 'Collegiate, national, or semi-professional bowlers.',
      skills: 'Mastery of multiple releases, advanced lane play, precision spare shooting, strong mental game.',
      focus: 'Competing on sport/challenge patterns, maintaining consistency under pressure, physical conditioning.',
    },
    professional: {
      profile: 'Competes in PBA, international tours, or world championships.',
      skills: 'Exceptional versatility, precise adjustments, advanced ball arsenal use, clutch performance.',
      focus: 'Sustaining peak averages (220+), adapting to diverse oil patterns, long-term career performance.',
    },
  },
}

export function criteriaFor(sportName: string | undefined, tier: SkillLevelTier): TierCriteria | null {
  if (!sportName) return null
  return SKILL_LEVEL_CRITERIA[sportName]?.[tier] ?? null
}
