import { api } from './api'
import type { Sport } from './venueApi'
import type { SkillLevelTier } from './skillLevels'
import type { EvaluationCriteria } from './evaluationCriteria'

export type PlayerSearchResult = { id: number; name: string; email: string }

export type Tournament = {
  id: number
  name: string
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'
  starts_at: string
  sport: Sport
  venue: { id: number; name: string } | null
  // Set only for a team tournament — registering requires building a full
  // team via /api/teams first, instead of registering a lone player.
  sport_format_id: number | null
  sport_format?: { id: number; name: string; players_per_side: number } | null
}

export type CoachTournamentRegistration = {
  id: number
  status: 'pending' | 'confirmed' | 'withdrawn'
  created_at: string
  user: { id: number; name: string; email: string } | null
  team: { id: number; name: string | null } | null
  tournament: Tournament
}

export type EvaluationEntry = {
  id: number
  criteria: EvaluationCriteria | null
  notes: string | null
  created_at: string
  coach: { id: number; name: string }
  skill_level: {
    id: number
    level: SkillLevelTier
    score: string | null
    sport: Sport
  }
}

export async function searchPlayers(search: string) {
  const { data } = await api.get<PlayerSearchResult[]>('/api/players', { params: { search } })
  return data
}

export async function fetchTournaments(status?: string, sportId?: number) {
  const { data } = await api.get<Tournament[]>('/api/tournaments', { params: { status, sport_id: sportId } })
  return data
}

export async function registerPlayerForTournament(tournamentId: number, userId: number) {
  const { data } = await api.post(`/api/tournaments/${tournamentId}/registrations`, { user_id: userId })
  return data
}

export async function registerTeamForTournament(tournamentId: number, teamId: number) {
  const { data } = await api.post(`/api/tournaments/${tournamentId}/team-registrations`, { team_id: teamId })
  return data
}

export async function fetchMyTournamentRegistrations() {
  const { data } = await api.get<CoachTournamentRegistration[]>('/api/tournament-registrations/mine')
  return data
}

export async function fetchEvaluations(playerId: number) {
  const { data } = await api.get<EvaluationEntry[]>('/api/evaluations', { params: { player_id: playerId } })
  return data
}

export async function createEvaluation(input: {
  player_id: number
  sport_id: number
  level: SkillLevelTier
  score?: number
  criteria?: EvaluationCriteria
  notes?: string
}) {
  const { data } = await api.post<EvaluationEntry>('/api/evaluations', input)
  return data
}
