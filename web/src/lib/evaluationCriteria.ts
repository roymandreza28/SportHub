export type GeneralCriterionKey =
  | 'physical_athletic_capabilities'
  | 'technical_skill_proficiency'
  | 'mental_game_understanding'
  | 'team_interaction'
  | 'psychological_resilience'

export const GENERAL_CRITERIA: { key: GeneralCriterionKey; label: string; description: string }[] = [
  {
    key: 'physical_athletic_capabilities',
    label: 'Physical Athletic Capabilities',
    description: 'Speed, lateral quickness, vertical jump, endurance, strength.',
  },
  {
    key: 'technical_skill_proficiency',
    label: 'Technical Skill Proficiency',
    description: 'Shooting mechanics, ball handling, footwork, defensive positioning, passing accuracy.',
  },
  {
    key: 'mental_game_understanding',
    label: 'Mental Game Understanding',
    description: 'Basketball/game IQ, reading the defense, decision speed, game comprehension.',
  },
  {
    key: 'team_interaction',
    label: 'Team Interaction',
    description: 'Communication on defense, leadership in tight moments, willingness to accept a role, coachability.',
  },
  {
    key: 'psychological_resilience',
    label: 'Psychological Resilience',
    description: 'Focus under pressure, emotional control after mistakes, consistency regardless of the score.',
  },
]

export type StatFieldDef = { key: string; label: string; unit?: string }

export const SPORT_STAT_FIELDS: Record<string, StatFieldDef[]> = {
  Basketball: [
    { key: 'points', label: 'Points' },
    { key: 'rebounds', label: 'Rebounds' },
    { key: 'assists', label: 'Assists' },
    { key: 'steals', label: 'Steals' },
    { key: 'blocks', label: 'Blocks' },
    { key: 'turnovers', label: 'Turnovers' },
    { key: 'fgm', label: 'Field Goals Made' },
    { key: 'fga', label: 'Field Goals Attempted' },
    { key: 'three_m', label: '3-Pointers Made' },
    { key: 'three_a', label: '3-Pointers Attempted' },
    { key: 'ftm', label: 'Free Throws Made' },
    { key: 'fta', label: 'Free Throws Attempted' },
  ],
  Volleyball: [
    { key: 'kills', label: 'Kills' },
    { key: 'errors', label: 'Errors' },
    { key: 'total_attempts', label: 'Total Attempts' },
    { key: 'assists', label: 'Assists' },
    { key: 'digs', label: 'Digs' },
    { key: 'blocks', label: 'Blocks' },
    { key: 'service_aces', label: 'Service Aces' },
    { key: 'sets_played', label: 'Sets Played' },
  ],
  Badminton: [
    { key: 'rallies_won', label: 'Rallies Won' },
    { key: 'total_rallies', label: 'Total Rallies' },
    { key: 'smash_winners', label: 'Smash Winners' },
    { key: 'total_smashes', label: 'Total Smashes' },
    { key: 'successful_serves', label: 'Successful Serves' },
    { key: 'total_serves', label: 'Total Serves' },
    { key: 'errors', label: 'Errors' },
    { key: 'net_winners', label: 'Net Winners' },
    { key: 'net_attempts', label: 'Net Attempts' },
  ],
  Tennis: [
    { key: 'first_serves_in', label: 'First Serves In' },
    { key: 'total_first_serves', label: 'Total First Serves' },
    { key: 'first_serve_points_won', label: 'First Serve Points Won' },
    { key: 'break_points_won', label: 'Break Points Won' },
    { key: 'break_points_earned', label: 'Break Points Earned' },
    { key: 'winners', label: 'Winners' },
    { key: 'unforced_errors', label: 'Unforced Errors' },
    { key: 'aces', label: 'Aces' },
    { key: 'double_faults', label: 'Double Faults' },
    { key: 'total_serves', label: 'Total Serves' },
  ],
  Pickleball: [
    { key: 'dupr_rating', label: 'DUPR Rating' },
    { key: 'matches_won', label: 'Matches Won' },
    { key: 'matches_played', label: 'Matches Played' },
    { key: 'point_differential_avg', label: 'Avg. Point Differential' },
    { key: 'errors', label: 'Errors' },
    { key: 'total_points', label: 'Total Points' },
    { key: 'dink_success_pct', label: 'Dink Success %' },
    { key: 'volley_success_pct', label: 'Volley Success %' },
    { key: 'third_shot_drop_pct', label: 'Third-Shot Drop Success %' },
  ],
  'Table Tennis': [
    { key: 'matches_won', label: 'Matches Won' },
    { key: 'matches_played', label: 'Matches Played' },
    { key: 'point_differential_avg', label: 'Avg. Point Differential' },
    { key: 'points_won_on_serve', label: 'Points Won on Serve' },
    { key: 'total_serves', label: 'Total Serves' },
    { key: 'points_won_on_receive', label: 'Points Won on Receive' },
    { key: 'total_receives', label: 'Total Receives' },
    { key: 'errors', label: 'Errors' },
    { key: 'total_points', label: 'Total Points' },
    { key: 'winners', label: 'Winners' },
    { key: 'avg_rally_length', label: 'Avg. Rally Length (shots)' },
  ],
}

export type ComputedStatDef = { key: string; label: string; unit?: '%' | 'ratio' }

// Every computed field's label/unit, so the form and history view can render
// results consistently without duplicating this list.
export const SPORT_COMPUTED_FIELDS: Record<string, ComputedStatDef[]> = {
  Basketball: [
    { key: 'fg_pct', label: 'FG%', unit: '%' },
    { key: 'three_pct', label: '3P%', unit: '%' },
    { key: 'ft_pct', label: 'FT%', unit: '%' },
    { key: 'ts_pct', label: 'True Shooting %', unit: '%' },
    { key: 'efficiency', label: 'Efficiency (EFF)' },
  ],
  Volleyball: [{ key: 'hitting_pct', label: 'Hitting %', unit: '%' }],
  Badminton: [
    { key: 'rally_win_pct', label: 'Rally Win Rate', unit: '%' },
    { key: 'smash_success_pct', label: 'Smash Success Rate', unit: '%' },
    { key: 'service_accuracy_pct', label: 'Service Accuracy', unit: '%' },
    { key: 'unforced_error_pct', label: 'Unforced Error Rate', unit: '%' },
    { key: 'net_kill_pct', label: 'Net Kill Rate', unit: '%' },
  ],
  Tennis: [
    { key: 'first_serve_pct', label: 'First Serve %', unit: '%' },
    { key: 'first_serve_pts_won_pct', label: 'First Serve Points Won', unit: '%' },
    { key: 'break_point_conversion_pct', label: 'Break Point Conversion', unit: '%' },
    { key: 'winner_to_ue_ratio', label: 'Winner-to-UE Ratio', unit: 'ratio' },
    { key: 'ace_rate_pct', label: 'Ace Rate', unit: '%' },
    { key: 'double_fault_rate_pct', label: 'Double Fault Rate', unit: '%' },
  ],
  Pickleball: [
    { key: 'win_rate_pct', label: 'Win Rate', unit: '%' },
    { key: 'unforced_error_pct', label: 'Unforced Error Rate', unit: '%' },
  ],
  'Table Tennis': [
    { key: 'win_rate_pct', label: 'Win Rate', unit: '%' },
    { key: 'serve_effectiveness_pct', label: 'Serve Effectiveness', unit: '%' },
    { key: 'receive_effectiveness_pct', label: 'Receive Effectiveness', unit: '%' },
    { key: 'unforced_error_pct', label: 'Unforced Error Rate', unit: '%' },
    { key: 'winner_to_error_ratio', label: 'Winner-to-Error Ratio', unit: 'ratio' },
  ],
}

export type EvaluationCriteria = {
  general?: Partial<Record<GeneralCriterionKey, number>>
  sport_stats?: {
    raw?: Record<string, number>
    computed?: Record<string, number>
  }
}

function pct(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (!numerator && numerator !== 0) return undefined
  if (!denominator) return undefined
  return (numerator / denominator) * 100
}

function ratio(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (!numerator && numerator !== 0) return undefined
  if (!denominator) return undefined
  return numerator / denominator
}

function round(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 100) / 100
}

export function computeSportStats(sportName: string, raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  const set = (key: string, value: number | undefined) => {
    if (value !== undefined && Number.isFinite(value)) out[key] = round(value)!
  }

  switch (sportName) {
    case 'Basketball': {
      set('fg_pct', pct(raw.fgm, raw.fga))
      set('three_pct', pct(raw.three_m, raw.three_a))
      set('ft_pct', pct(raw.ftm, raw.fta))
      if (raw.fga !== undefined && raw.fta !== undefined && raw.points !== undefined) {
        const denom = 2 * (raw.fga + 0.44 * raw.fta)
        set('ts_pct', denom ? (raw.points / denom) * 100 : undefined)
      }
      if (
        [raw.points, raw.rebounds, raw.assists, raw.steals, raw.blocks, raw.fga, raw.fgm, raw.fta, raw.ftm].every(
          (v) => v !== undefined
        )
      ) {
        const turnovers = raw.turnovers ?? 0
        set(
          'efficiency',
          raw.points +
            raw.rebounds +
            raw.assists +
            raw.steals +
            raw.blocks -
            (raw.fga - raw.fgm) -
            (raw.fta - raw.ftm) -
            turnovers
        )
      }
      break
    }
    case 'Volleyball': {
      if (raw.kills !== undefined && raw.errors !== undefined) {
        set('hitting_pct', pct(raw.kills - raw.errors, raw.total_attempts))
      }
      break
    }
    case 'Badminton': {
      set('rally_win_pct', pct(raw.rallies_won, raw.total_rallies))
      set('smash_success_pct', pct(raw.smash_winners, raw.total_smashes))
      set('service_accuracy_pct', pct(raw.successful_serves, raw.total_serves))
      set('unforced_error_pct', pct(raw.errors, raw.total_rallies))
      set('net_kill_pct', pct(raw.net_winners, raw.net_attempts))
      break
    }
    case 'Tennis': {
      set('first_serve_pct', pct(raw.first_serves_in, raw.total_first_serves))
      set('first_serve_pts_won_pct', pct(raw.first_serve_points_won, raw.first_serves_in))
      set('break_point_conversion_pct', pct(raw.break_points_won, raw.break_points_earned))
      set('winner_to_ue_ratio', ratio(raw.winners, raw.unforced_errors))
      set('ace_rate_pct', pct(raw.aces, raw.total_first_serves))
      set('double_fault_rate_pct', pct(raw.double_faults, raw.total_serves))
      break
    }
    case 'Pickleball': {
      set('win_rate_pct', pct(raw.matches_won, raw.matches_played))
      set('unforced_error_pct', pct(raw.errors, raw.total_points))
      break
    }
    case 'Table Tennis': {
      set('win_rate_pct', pct(raw.matches_won, raw.matches_played))
      set('serve_effectiveness_pct', pct(raw.points_won_on_serve, raw.total_serves))
      set('receive_effectiveness_pct', pct(raw.points_won_on_receive, raw.total_receives))
      set('unforced_error_pct', pct(raw.errors, raw.total_points))
      set('winner_to_error_ratio', ratio(raw.winners, raw.errors))
      break
    }
  }

  return out
}
