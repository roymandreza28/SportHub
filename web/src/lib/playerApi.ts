import { api } from './api'
import type { Sport } from './venueApi'

export type SkillLevel = {
  id: number
  sport_id: number
  level: 'beginner' | 'intermediate' | 'advanced' | 'pro'
  score: string | null
  sport: Sport
  coach: { id: number; name: string } | null
}

export type PlayerProfile = {
  id: number
  bio: string | null
  date_of_birth: string | null
  primary_sport_id: number | null
  primary_sport: Sport | null
  skill_levels?: SkillLevel[]
}

export type MatchmakingRequestItem = {
  id: number
  sport_id: number
  status: 'open' | 'matched' | 'expired' | 'cancelled'
  sport: Sport
  opponent?: { id: number; name: string; email: string }
}

export async function fetchPlayerProfile() {
  const { data } = await api.get<PlayerProfile>('/api/player-profile')
  return data
}

export async function updatePlayerProfile(input: Partial<{ bio: string; date_of_birth: string; primary_sport_id: number }>) {
  const { data } = await api.patch<PlayerProfile>('/api/player-profile', input)
  return data
}

export async function fetchMySkillLevels() {
  const { data } = await api.get<SkillLevel[]>('/api/skill-levels/mine')
  return data
}

export async function fetchMyMatchmakingRequests() {
  const { data } = await api.get<MatchmakingRequestItem[]>('/api/matchmaking-requests/mine')
  return data
}

export async function createMatchmakingRequest(input: { sport_id: number; venue_id?: number }) {
  const { data } = await api.post<MatchmakingRequestItem>('/api/matchmaking-requests', input)
  return data
}

export async function cancelMatchmakingRequest(id: number) {
  await api.delete(`/api/matchmaking-requests/${id}`)
}

export async function createVenueRegistration(input: {
  venue_id: number
  court_id?: number
  starts_at: string
  ends_at: string
  purpose?: string
}) {
  const { data } = await api.post('/api/venue-registrations', input)
  return data
}
