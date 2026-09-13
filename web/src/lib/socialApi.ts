import { api } from './api'
import type { Role } from './AuthContext'
import type { SkillLevel } from './playerApi'

export type FriendshipStatus = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'friends'

export type SocialUserSummary = {
  id: number
  name: string
  email: string
  roles: { id: number; name: Role }[]
  avatar_url: string | null
}

export type Paginated<T> = {
  data: T[]
  current_page: number
  last_page: number
  total: number
}

export type ProfileResponse = {
  user: {
    id: number
    name: string
    roles: Role[]
    bio: string | null
    primary_sport: string | null
    avatar_url: string | null
    cover_url: string | null
    friends_count: number
    // A coach's evaluation surfaces here as the skill level it updated —
    // see ProfileController::show()'s own doc comment.
    skill_levels: SkillLevel[]
  }
  friendship_status: FriendshipStatus
  friendship_id: number | null
}

export async function searchSocialUsers(search: string) {
  const { data } = await api.get<Paginated<SocialUserSummary>>('/api/social/users', { params: { search } })
  return data
}

export async function fetchProfile(userId: number) {
  const { data } = await api.get<ProfileResponse>(`/api/social/users/${userId}`)
  return data
}

export async function updateOwnCover(file: File) {
  const form = new FormData()
  form.append('cover', file)
  const { data } = await api.post<{ cover_url: string }>('/api/social/profile/cover', form)
  return data
}

// Career totals from the venue organizer's live scoreboard stats (see
// MatchController::upsertPlayerStats()), summed per sport across every
// completed tournament match — powers the profile's stats pentagon. Only
// sports with at least one recorded match are returned. win/loss counts come
// from the same bracket winner_id/winner_team_id BracketService maintains —
// a match with neither set (a draw, or a group-stage match with no single
// decider) counts toward matches_played but not wins or losses.
export type PlayerStatSummaryEntry = {
  sport_id: number
  sport_name: string
  matches_played: number
  wins: number
  losses: number
  win_rate: number
  totals: Record<string, number>
  pentagon_fields: { key: string; label: string; scale_max: number }[]
}

export type PlayerMatchHistoryEntry = {
  match_id: number
  sport_name: string
  tournament_name: string | null
  opponent_name: string
  result: 'win' | 'loss' | 'draw'
  score: string | null
  date: string | null
}

export type PlayerStatOverall = {
  matches_played: number
  wins: number
  losses: number
  win_rate: number
  by_sport: { sport_id: number; sport_name: string; win_rate: number }[]
}

export type PlayerStatSummary = {
  sports: PlayerStatSummaryEntry[]
  overall: PlayerStatOverall
  history: PlayerMatchHistoryEntry[]
}

export async function fetchPlayerStatSummary(userId: number) {
  const { data } = await api.get<PlayerStatSummary>(`/api/social/users/${userId}/stat-summary`)
  return data
}
