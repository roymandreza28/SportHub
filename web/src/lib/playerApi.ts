import { api } from './api'
import type { Sport, SportFormat } from './venueApi'
import type { SkillLevelTier } from './skillLevels'
import type { Team } from './teamsApi'

export type SkillLevel = {
  id: number
  sport_id: number
  level: SkillLevelTier
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
  status: 'open' | 'matched' | 'expired' | 'cancelled' | 'failed'
  sport: Sport
  sport_format: SportFormat | null
  team: Team | null
  venue: { id: number; name: string } | null
  preferred_start_at: string | null
  preferred_end_at: string | null
  opponent?: { id: number; name: string; email: string }
  opponent_team?: Team | null
  // Present only when this request's venue+time preference is the one that
  // actually got auto-reserved once the pair was found — powers the
  // down-payment prompt (see DownPaymentPrompt.tsx).
  venue_registration?: {
    id: number
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    starts_at: string
    ends_at: string
    conversation_id: number | null
  }
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

export async function createMatchmakingRequest(input: {
  sport_id: number
  sport_format_id: number
  team_id?: number
  venue_id?: number
  preferred_start_at?: string
  preferred_end_at?: string
}) {
  const { data } = await api.post<MatchmakingRequestItem>('/api/matchmaking-requests', input)
  return data
}

export async function cancelMatchmakingRequest(id: number) {
  await api.delete(`/api/matchmaking-requests/${id}`)
}

export type CreatedVenueRegistration = MyVenueRegistration & {
  total_amount: number | null
  facilitator_name: string
  facilitator_phone: string | null
  conversation_id: number
}

export async function createVenueRegistration(input: {
  venue_id: number
  court_id?: number
  starts_at: string
  ends_at: string
  purpose: string
}) {
  const { data } = await api.post<CreatedVenueRegistration>('/api/venue-registrations', input)
  return data
}

export type MyVenueRegistration = {
  id: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  starts_at: string
  ends_at: string
  purpose: string | null
  venue: { id: number; name: string; address: string; latitude: string; longitude: string }
  court: { id: number; name: string } | null
  // A direct conversation with the venue's facilitator — created the
  // instant the booking is requested (not only once approved), so both
  // sides can coordinate while it's still pending. Auto-(soft)deleted once
  // the booking's day is over, regardless of whether it was ever approved.
  conversation: { id: number } | null
}

export async function fetchMyVenueRegistrations() {
  const { data } = await api.get<MyVenueRegistration[]>('/api/venue-registrations/mine')
  return data
}

export type PlayerTournamentRegistration = {
  id: number
  status: 'pending' | 'confirmed' | 'withdrawn'
  registered_by: { id: number; name: string } | null
  tournament: {
    id: number
    name: string
    status: 'draft' | 'registration' | 'preparation' | 'ongoing' | 'completed' | 'cancelled'
    starts_at: string
    sport: Sport
    venue: { id: number; name: string } | null
  }
}

export async function fetchMyTournamentRegistrationsAsPlayer() {
  const { data } = await api.get<PlayerTournamentRegistration[]>('/api/tournament-registrations/mine-as-player')
  return data
}
