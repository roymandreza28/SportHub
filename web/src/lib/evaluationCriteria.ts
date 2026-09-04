export type AttributeCriterionDef = { key: string; label: string; description: string }

// Every sport's own attribute-rating categories (coach rates each 1-10,
// grouped into an overall skill level) — replaces a single generic
// sport-agnostic 5-criterion list with real per-sport categories, since
// e.g. "Ball Handling" only means something for Basketball and "Spin
// Control" only for Table Tennis.
export const SPORT_ATTRIBUTE_CRITERIA: Record<string, AttributeCriterionDef[]> = {
  Basketball: [
    { key: 'shooting', label: 'Shooting', description: 'Accuracy, range.' },
    { key: 'ball_handling', label: 'Ball Handling', description: 'Dribbling, control under pressure.' },
    { key: 'passing', label: 'Passing', description: 'Vision, accuracy.' },
    { key: 'defense', label: 'Defense', description: 'On-ball, help defense, steals, blocks.' },
    { key: 'athleticism', label: 'Athleticism', description: 'Speed, strength, vertical jump.' },
    { key: 'basketball_iq', label: 'Basketball IQ', description: 'Decision-making, awareness.' },
  ],
  Volleyball: [
    { key: 'serving', label: 'Serving', description: 'Accuracy, power, consistency.' },
    { key: 'passing', label: 'Passing', description: 'Serve receive, forearm control.' },
    { key: 'setting', label: 'Setting', description: 'Precision, decision-making.' },
    { key: 'attacking', label: 'Attacking', description: 'Spiking power, shot variety.' },
    { key: 'blocking', label: 'Blocking', description: 'Timing, positioning.' },
    { key: 'defense', label: 'Defense', description: 'Digging, coverage, reflexes.' },
    { key: 'volleyball_iq', label: 'Volleyball IQ', description: 'Rotations, tactical awareness, communication.' },
  ],
  Badminton: [
    { key: 'serving', label: 'Serving', description: 'Short, flick, drive.' },
    { key: 'footwork', label: 'Footwork', description: 'Speed, agility, recovery.' },
    { key: 'attacking', label: 'Attacking', description: 'Smash power, placement.' },
    { key: 'defensive', label: 'Defensive', description: 'Blocks, lifts, counter-smashes.' },
    { key: 'net_play', label: 'Net Play', description: 'Drops, tumbles, kills.' },
    { key: 'shot_variety', label: 'Shot Variety', description: 'Clears, drives, cross-court.' },
    { key: 'badminton_iq', label: 'Badminton IQ', description: 'Tactics, anticipation, positioning.' },
  ],
  Pickleball: [
    { key: 'serving_return', label: 'Serving & Return', description: 'Accuracy, depth, consistency.' },
    { key: 'dinking', label: 'Dinking', description: 'Control, patience, placement.' },
    { key: 'third_shot', label: 'Third-Shot Drop/Drive', description: 'Execution, decision-making.' },
    { key: 'volleys_net_play', label: 'Volleys & Net Play', description: 'Reaction time, dominance at the kitchen line.' },
    { key: 'defense', label: 'Defense', description: 'Resets, blocks, counter-attacks.' },
    { key: 'footwork_positioning', label: 'Footwork & Positioning', description: 'Court coverage, recovery.' },
    { key: 'pickleball_iq', label: 'Pickleball IQ', description: 'Strategy, anticipation, teamwork.' },
  ],
  Tennis: [
    { key: 'serve', label: 'Serve', description: 'Power, spin, accuracy.' },
    { key: 'forehand_backhand', label: 'Forehand & Backhand', description: 'Consistency, variety, placement.' },
    { key: 'volleys_net_play', label: 'Volleys & Net Play', description: 'Reflexes, control, positioning.' },
    { key: 'footwork_movement', label: 'Footwork & Movement', description: 'Speed, recovery, agility.' },
    { key: 'defense', label: 'Defense', description: 'Counter-punching, lobs, passing shots.' },
    { key: 'tactical_iq', label: 'Tactical IQ', description: 'Shot selection, strategy, anticipation.' },
    { key: 'mental_game', label: 'Mental Game', description: 'Focus, resilience, composure.' },
  ],
  'Table Tennis': [
    { key: 'serving', label: 'Serving', description: 'Spin, placement, deception.' },
    { key: 'forehand_backhand', label: 'Forehand & Backhand', description: 'Drive, loop, smash, consistency.' },
    { key: 'blocking_defense', label: 'Blocking & Defense', description: 'Timing, control, anticipation.' },
    { key: 'footwork_positioning', label: 'Footwork & Positioning', description: 'Speed, recovery, agility.' },
    { key: 'spin_control', label: 'Spin Control', description: 'Topspin, backspin, sidespin variation.' },
    { key: 'tactical_iq', label: 'Tactical IQ', description: 'Shot selection, rally strategy, anticipation.' },
    { key: 'mental_game', label: 'Mental Game', description: 'Focus, resilience, composure.' },
  ],
  Bowling: [
    { key: 'release_accuracy', label: 'Release & Accuracy', description: 'Consistency, control, repeatability.' },
    { key: 'hook_ball_motion', label: 'Hook & Ball Motion', description: 'Ability to adjust to lane conditions.' },
    { key: 'spare_shooting', label: 'Spare Shooting', description: 'Conversion rate, reliability.' },
    { key: 'lane_reading', label: 'Lane Reading', description: 'Oil pattern recognition, adjustments.' },
    { key: 'mental_game', label: 'Mental Game', description: 'Focus, resilience, composure.' },
    { key: 'physical_conditioning', label: 'Physical Conditioning', description: 'Stamina, injury prevention.' },
  ],
}

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
  attributes?: Partial<Record<string, number>>
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
