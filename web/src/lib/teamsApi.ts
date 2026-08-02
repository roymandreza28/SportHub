import { api } from './api'
import type { Sport, SportFormat } from './venueApi'

export type TeamUserRef = { id: number; name: string; email: string }

export type TeamMemberRef = {
  id: number
  team_id: number
  user_id: number
  status: 'invited' | 'accepted' | 'declined'
  responded_at: string | null
  user: TeamUserRef
}

export type Team = {
  id: number
  sport_id: number
  sport_format_id: number
  captain_id: number
  name: string | null
  status: 'forming' | 'ready' | 'disbanded'
  is_captain: boolean
  sport: Sport
  sport_format: SportFormat
  captain: TeamUserRef
  members: TeamMemberRef[]
}

export async function fetchMyTeams() {
  const { data } = await api.get<Team[]>('/api/teams/mine')
  return data
}

export async function createTeam(input: { sport_id: number; sport_format_id: number; name?: string }) {
  const { data } = await api.post<Team>('/api/teams', input)
  return data
}

export async function inviteToTeam(teamId: number, userId: number) {
  const { data } = await api.post<TeamMemberRef>(`/api/teams/${teamId}/invite`, { user_id: userId })
  return data
}

export async function acceptTeamInvite(teamMemberId: number) {
  const { data } = await api.post(`/api/team-members/${teamMemberId}/accept`)
  return data
}

export async function declineTeamInvite(teamMemberId: number) {
  await api.post(`/api/team-members/${teamMemberId}/decline`)
}

export async function removeTeamMember(teamId: number, teamMemberId: number) {
  await api.delete(`/api/teams/${teamId}/members/${teamMemberId}`)
}

export async function disbandTeam(teamId: number) {
  await api.delete(`/api/teams/${teamId}`)
}
