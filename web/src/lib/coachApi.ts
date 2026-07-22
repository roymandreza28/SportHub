import { api } from './api'
import type { Sport } from './venueApi'

export type PlayerSearchResult = { id: number; name: string; email: string }

export type Tournament = {
  id: number
  name: string
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'
  starts_at: string
  sport: Sport
  venue: { id: number; name: string } | null
}

export type EvaluationEntry = {
  id: number
  criteria: Record<string, unknown> | null
  notes: string | null
  created_at: string
  coach: { id: number; name: string }
  skill_level: {
    id: number
    level: 'beginner' | 'intermediate' | 'advanced' | 'pro'
    score: string | null
    sport: Sport
  }
}

export async function searchPlayers(search: string) {
  const { data } = await api.get<PlayerSearchResult[]>('/api/players', { params: { search } })
  return data
}

export async function fetchTournaments(status?: string) {
  const { data } = await api.get<Tournament[]>('/api/tournaments', { params: { status } })
  return data
}

export async function registerPlayerForTournament(tournamentId: number, userId: number) {
  const { data } = await api.post(`/api/tournaments/${tournamentId}/registrations`, { user_id: userId })
  return data
}

export async function fetchEvaluations(playerId: number) {
  const { data } = await api.get<EvaluationEntry[]>('/api/evaluations', { params: { player_id: playerId } })
  return data
}

export async function createEvaluation(input: {
  player_id: number
  sport_id: number
  level: 'beginner' | 'intermediate' | 'advanced' | 'pro'
  score?: number
  criteria?: Record<string, unknown>
  notes?: string
}) {
  const { data } = await api.post<EvaluationEntry>('/api/evaluations', input)
  return data
}
