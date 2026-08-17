import { api } from './api'
import type { Sport, SportFormat } from './venueApi'

export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin' | 'group_stage' | 'swiss'
export type TournamentStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'
export type ScoringType = 'single_score' | 'best_of_sets'

export type OrganizerOption = { id: number; name: string; email: string }

export type Tournament = {
  id: number
  name: string
  format: TournamentFormat
  status: TournamentStatus
  starts_at: string
  sport: Sport
  venue: { id: number; name: string } | null
  organizer_id: number
  venue_organizer_id: number | null
  livestream_organizer_id: number | null
  venue_organizer?: { id: number; name: string } | null
  livestream_organizer?: { id: number; name: string } | null
  scoring_type: ScoringType
  sets_to_win: number | null
  // Set only for a team tournament — every registration/match participant is
  // a Team instead of an individual player. Null preserves today's
  // individual-registration behavior unchanged.
  sport_format_id: number | null
  sport_format?: SportFormat | null
}

export type SetScore = { score_a: number; score_b: number }

export type BracketMatch = {
  id: number
  round: number
  group_number?: number | null
  bracket_type?: 'winners' | 'losers' | 'final' | 'swiss' | null
  participant_a_id: number | null
  participant_b_id: number | null
  score_a: number
  score_b: number
  sets?: SetScore[] | null
  status: 'scheduled' | 'live' | 'completed'
  winner_id: number | null
  participant_a?: { id: number; name: string } | null
  participant_b?: { id: number; name: string } | null
  winner?: { id: number; name: string } | null
}

export type Bracket = {
  id: number
  tournament_id: number
  current_round: number
  structure: BracketMatch[][]
  matches: BracketMatch[]
}

export type NewsMediaItem = {
  id: number
  type: 'image' | 'video'
  url: string
}

export type NewsItem = {
  id: number
  title: string
  body: string
  cover_image_url: string | null
  published_at: string | null
  author: { id: number; name: string }
  media: NewsMediaItem[]
}

export type LivestreamItem = {
  id: number
  title: string
  platform: 'youtube' | 'facebook'
  embed_url: string
  status: 'scheduled' | 'live' | 'ended'
  tournament_id: number | null
  news_id: number | null
}

export type ChatMessageItem = {
  id: number
  body: string
  created_at: string
  user: { id: number; name: string }
}

export async function fetchOrganizerTournaments() {
  const { data } = await api.get<Tournament[]>('/api/tournaments')
  return data
}

export async function createTournament(input: {
  sport_id: number
  sport_format_id?: number
  name: string
  format: TournamentFormat
  starts_at: string
  venue_id?: number
  venue_organizer_id?: number
  livestream_organizer_id?: number
  scoring_type?: ScoringType
  sets_to_win?: number
}) {
  const { data } = await api.post<Tournament>('/api/tournaments', input)
  return data
}

export async function updateTournament(
  tournamentId: number,
  input: Partial<{ name: string; starts_at: string; venue_id: number; status: TournamentStatus }>
) {
  const { data } = await api.patch<Tournament>(`/api/tournaments/${tournamentId}`, input)
  return data
}

export async function fetchAvailableOrganizers() {
  const { data } = await api.get<{ venue_organizers: OrganizerOption[]; livestream_organizers: OrganizerOption[] }>(
    '/api/organizers/available'
  )
  return data
}

export async function generateBracket(tournamentId: number) {
  const { data } = await api.post<Bracket>(`/api/tournaments/${tournamentId}/generate-bracket`)
  return data
}

export async function fetchBracket(tournamentId: number) {
  const { data } = await api.get<Bracket>(`/api/tournaments/${tournamentId}/bracket`)
  return data
}

export async function updateMatchScore(
  matchId: number,
  input: { score_a: number; score_b: number; status?: 'scheduled' | 'live' | 'completed' }
) {
  const { data } = await api.patch<BracketMatch>(`/api/matches/${matchId}/score`, input)
  return data
}

export async function updateMatchSets(matchId: number, sets: SetScore[]) {
  const { data } = await api.patch<BracketMatch>(`/api/matches/${matchId}/score`, { sets })
  return data
}

export type MatchRosterTeam = { id: number; name: string; members: { id: number; name: string }[] }

export async function fetchMatchRoster(matchId: number) {
  const { data } = await api.get<{ team_a: MatchRosterTeam | null; team_b: MatchRosterTeam | null }>(
    `/api/matches/${matchId}/roster`
  )
  return data
}

export async function fetchNews() {
  const { data } = await api.get<NewsItem[]>('/api/news')
  return data
}

export async function createNews(input: { title: string; body: string; media?: File[] }) {
  const form = new FormData()
  form.append('title', input.title)
  form.append('body', input.body)
  for (const file of input.media ?? []) {
    form.append('media[]', file)
  }
  const { data } = await api.post<NewsItem>('/api/news', form)
  return data
}

export async function fetchLivestreams() {
  const { data } = await api.get<LivestreamItem[]>('/api/livestreams')
  return data
}

export async function createLivestream(input: {
  title: string
  platform: 'youtube' | 'facebook'
  embed_url: string
  tournament_id?: number
  news_id?: number
}) {
  const { data } = await api.post<LivestreamItem>('/api/livestreams', input)
  return data
}

export async function fetchChatMessages(livestreamId: number) {
  const { data } = await api.get<ChatMessageItem[]>(`/api/livestreams/${livestreamId}/messages`)
  return data
}

export async function postChatMessage(livestreamId: number, body: string) {
  const { data } = await api.post<ChatMessageItem>(`/api/livestreams/${livestreamId}/messages`, { body })
  return data
}
