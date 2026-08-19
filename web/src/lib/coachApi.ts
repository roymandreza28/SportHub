import { api } from './api'
import type { Sport } from './venueApi'
import type { SkillLevelTier } from './skillLevels'
import type { EvaluationCriteria } from './evaluationCriteria'

export type PlayerSearchResult = { id: number; name: string; email: string }

export type Tournament = {
  id: number
  name: string
  status: 'draft' | 'registration' | 'preparation' | 'ongoing' | 'completed' | 'cancelled'
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

// Powers a coach clicking a tournament-linked newsfeed post — that post only
// carries a minimal {id, name, sport_id, sport_format_id} shape, so this
// fetches the full Tournament (sport, venue, sport_format) TeamTournamentWizard
// needs before pre-seeding its register step.
export async function fetchTournament(id: number) {
  const { data } = await api.get<Tournament>(`/api/tournaments/${id}`)
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

// The stat-sheet columns themselves are entirely server-driven (see
// api/app/Support/StatSheetFieldSets.php) — a sport's field list and mode
// arrive in MatchStatSheet.fields/mode below, so StatSheetModal.tsx renders
// any supported sport generically with no per-sport frontend code.
export type MatchStatSheetField = { key: string; label: string }

export type MatchStatSheetRosterRow = {
  player_id: number | null
  name: string
  jersey_number: string
  notes: string
  stats: Record<string, number>
}

export type MatchStatSheetRosterData = {
  rows: MatchStatSheetRosterRow[]
  further_comments: string | null
  recorded_by: string | null
  signed: string | null
}

export type MatchStatSheetSummaryData = {
  values: Record<string, number>
  total_percent: Record<string, number | null>
  further_comments: string | null
  recorded_by: string | null
  signed: string | null
}

export type MatchStatSheet = {
  id: number
  match_id: number
  sport_name: string
  mode: 'roster' | 'summary'
  fields: MatchStatSheetField[]
  participant_type: 'team' | 'user'
  participant_name: string
  opponent_name: string
  tournament_name: string
  scheduled_at: string | null
  match_status: 'scheduled' | 'live' | 'completed'
  is_locked: boolean
  locked_at: string | null
  filled_by: { id: number; name: string } | null
  data: MatchStatSheetRosterData | MatchStatSheetSummaryData
}

export type UpcomingStatSheetMatch = {
  match_id: number
  participant_name: string
  opponent_name: string
  tournament_name: string
  scheduled_at: string | null
  status: 'scheduled' | 'live'
}

// Every match — across every sport StatSheetFieldSets supports — where this
// coach either captains a team or registered an individual player, and the
// match hasn't finished yet. Powers both the T-minus-10 auto-popup trigger
// and the manual "Stat Sheet" button on the Tournament tab. See
// StatSheetTrigger.tsx.
export async function fetchMyUpcomingStatSheetMatches() {
  const { data } = await api.get<UpcomingStatSheetMatch[]>('/api/matches/mine/upcoming-stat-sheets')
  return data
}

export async function fetchMatchStatSheet(matchId: number) {
  const { data } = await api.get<MatchStatSheet>(`/api/matches/${matchId}/stat-sheet`)
  return data
}

export async function updateMatchStatSheet(matchId: number, statSheetData: MatchStatSheetRosterData | MatchStatSheetSummaryData) {
  const { data } = await api.patch<MatchStatSheet>(`/api/matches/${matchId}/stat-sheet`, { data: statSheetData })
  return data
}
