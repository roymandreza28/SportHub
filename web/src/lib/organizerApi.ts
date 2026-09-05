import { api } from './api'
import type { Court, Sport, SportFormat } from './venueApi'

export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin' | 'group_stage' | 'swiss'
export type TournamentStatus = 'draft' | 'registration' | 'preparation' | 'ongoing' | 'completed' | 'cancelled'
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
  // Only set once status is 'completed' — whichever of champion/champion_team
  // is non-null tells you if this was an individual or team tournament.
  champion?: { id: number; name: string } | null
  champion_team?: { id: number; name: string } | null
}

export type SetScore = { score_a: number; score_b: number }

export type BracketMatch = {
  id: number
  round: number
  group_number?: number | null
  bracket_type?: 'winners' | 'losers' | 'final' | 'swiss' | null
  participant_a_id: number | null
  participant_b_id: number | null
  // Already on the wire (GameMatch has no $hidden) — declared here so a
  // coach's team-eligibility check (e.g. for the bracket's Stat Sheet
  // button) can tell "my team" apart from "my registered player" without a
  // type discriminator on the already-shaped participant_a/participant_b.
  participant_a_team_id: number | null
  participant_b_team_id: number | null
  score_a: number
  score_b: number
  sets?: SetScore[] | null
  status: 'scheduled' | 'live' | 'completed'
  winner_id: number | null
  won_by_default: boolean
  participant_a?: { id: number; name: string } | null
  participant_b?: { id: number; name: string } | null
  winner?: { id: number; name: string } | null
  scheduled_at: string | null
  court_id: number | null
  court?: (Court & { venue: { id: number; name: string } }) | null
}

export type Bracket = {
  id: number
  tournament_id: number
  current_round: number
  // Null if generation failed partway through (e.g. too few registrants) —
  // the bracket row exists but was never populated.
  structure: BracketMatch[][] | null
  matches: BracketMatch[]
  format: TournamentFormat
}

// bracket.structure is a cached JSON blob (BracketService::buildStructure())
// only rebuilt when a match's bracket position changes (generation, or
// advanceWinner() at completion) — a match going scheduled -> live, or
// ticking score while live, updates the match row directly and never
// touches it, so structure's copy of status/score/won_by_default can be
// stale for as long as a game is in progress. bracket.matches is the same
// matches, always freshly serialized straight from the DB — but its
// participant_a/participant_b are the RAW participantA/participantB user
// relations (null for a team match, since team matches use
// participant_a_team_id instead), not the {id, name} shape MatchParticipants
// ::shape() bakes into structure — so reading a name straight off
// bracket.matches shows "TBD" for every team-tournament match regardless of
// whether it's actually determined. This merges the two: structure's own
// shaped participant_a/participant_b/winner (correct for either kind of
// tournament), with the handful of fields that change during play pulled
// fresh from bracket.matches instead of structure's frozen copy.
export function freshBracketMatch(bracket: Bracket | undefined, matchId: number): BracketMatch | undefined {
  const structureMatch = bracket?.structure?.flat().find((m) => m.id === matchId)
  const fresh = bracket?.matches.find((m) => m.id === matchId)

  if (!structureMatch) return fresh
  if (!fresh) return structureMatch

  return {
    ...structureMatch,
    status: fresh.status,
    score_a: fresh.score_a,
    score_b: fresh.score_b,
    won_by_default: fresh.won_by_default,
    participant_a_team_id: fresh.participant_a_team_id,
    participant_b_team_id: fresh.participant_b_team_id,
    scheduled_at: fresh.scheduled_at,
    court_id: fresh.court_id,
    court: fresh.court,
  }
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
  status: 'scheduled' | 'live' | 'ended'
  tournament_id: number | null
  news_id: number | null
  // Set once the broadcaster's device has uploaded its MediaRecorder
  // capture of the broadcast (see uploadLivestreamRecording) — lets a
  // viewer replay an ended stream instead of just seeing "broadcast over."
  recording_url: string | null
  broadcaster: { id: number; name: string } | null
  tournament: { id: number; organizer_id: number } | null
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
  // Optional linked newsfeed announcement, published once registration opens.
  post_title?: string
  post_body?: string
  post_media?: File[]
}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === 'post_media') continue
    form.append(key, String(value))
  }
  for (const file of input.post_media ?? []) {
    form.append('post_media[]', file)
  }
  const { data } = await api.post<Tournament>('/api/tournaments', form)
  return data
}

export async function updateTournament(
  tournamentId: number,
  input: Partial<{ name: string; starts_at: string; venue_id: number; status: 'registration' }>
) {
  const { data } = await api.patch<Tournament>(`/api/tournaments/${tournamentId}`, input)
  return data
}

export async function proceedTournament(tournamentId: number) {
  const { data } = await api.post<Tournament>(`/api/tournaments/${tournamentId}/proceed`)
  return data
}

export async function cancelTournament(tournamentId: number) {
  const { data } = await api.post<Tournament>(`/api/tournaments/${tournamentId}/cancel`)
  return data
}

export async function scheduleMatch(matchId: number, input: { scheduled_at?: string | null; court_id?: number | null }) {
  const { data } = await api.patch<BracketMatch>(`/api/matches/${matchId}/schedule`, input)
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

// Folded into the same score-save round-trip every scoreboard already fires
// on each tap, rather than a second network call per click — see
// MatchController::upsertPlayerStats(). Keyed by user_id; team_id is always
// derived server-side from real team-membership rows, never sent here.
export type PlayerStatEntry = { user_id: number; stats: Record<string, number> }

export function toPlayerStatsPayload<T extends Record<string, number>>(
  stats: Record<number, T>
): PlayerStatEntry[] {
  return Object.entries(stats).map(([userId, s]) => ({ user_id: Number(userId), stats: s }))
}

export async function updateMatchScore(
  matchId: number,
  input: {
    score_a: number
    score_b: number
    status?: 'scheduled' | 'live' | 'completed'
    player_stats?: PlayerStatEntry[]
  }
) {
  const { data } = await api.patch<BracketMatch>(`/api/matches/${matchId}/score`, input)
  return data
}

export async function updateMatchSets(
  matchId: number,
  input: { sets: SetScore[]; player_stats?: PlayerStatEntry[] }
) {
  const { data } = await api.patch<BracketMatch>(`/api/matches/${matchId}/score`, input)
  return data
}

// Basketball/3x3's game clock only — every other sport's scoreboard never
// calls this. Fired on a real transition (start, pause, period/overtime
// change, manual adjustment), never once per tick; the shared-post widget
// extrapolates the running countdown locally between syncs. See
// MatchController::updateClock().
export async function updateMatchClock(
  matchId: number,
  input: {
    clock_seconds_remaining: number | null
    clock_shot_seconds_remaining: number | null
    clock_running: boolean
    clock_period_label: string | null
  }
) {
  const { data } = await api.patch(`/api/matches/${matchId}/clock`, input)
  return data
}

// The venue organizer's alternative to ever opening the scoreboard — one
// side didn't show up, so the match is decided without a single point
// played. See MatchController::forfeit() / GameMatch.won_by_default.
export async function forfeitMatch(matchId: number, winnerSide: 'a' | 'b') {
  const { data } = await api.post<BracketMatch>(`/api/matches/${matchId}/forfeit`, { winner_side: winnerSide })
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

export async function createNews(input: {
  title: string
  body: string
  media?: File[]
  tournament_id?: number
  match_id?: number
  // Explicit pick from ShareMatchModal's livestream picker — links this
  // post to that broadcast (news_id) the same way LivestreamController::
  // publish() does the other way around. Omitted entirely, the backend
  // still auto-links a lone still-unlinked live stream on the match's
  // tournament, so sharing works with zero clicks when there's only one.
  livestream_id?: number
}) {
  const form = new FormData()
  form.append('title', input.title)
  form.append('body', input.body)
  if (input.tournament_id !== undefined) {
    form.append('tournament_id', String(input.tournament_id))
  }
  if (input.match_id !== undefined) {
    form.append('match_id', String(input.match_id))
  }
  if (input.livestream_id !== undefined) {
    form.append('livestream_id', String(input.livestream_id))
  }
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
  tournament_id?: number
  news_id?: number
}) {
  const { data } = await api.post<LivestreamItem>('/api/livestreams', input)
  return data
}

export type WebRTCSignalType = 'offer' | 'answer' | 'ice-candidate' | 'broadcast-started' | 'broadcast-ended'

export async function sendWebRTCSignal(
  livestreamId: number,
  targetUserId: number,
  type: WebRTCSignalType,
  data: object
) {
  await api.post(`/api/livestreams/${livestreamId}/signal`, { target_user_id: targetUserId, type, data })
}

export async function publishLivestreamToNews(livestreamId: number, input: { title: string; body: string }) {
  const { data } = await api.post<LivestreamItem & { news: { id: number; title: string } }>(
    `/api/livestreams/${livestreamId}/publish`,
    input
  )
  return data
}

// Uploaded once the broadcaster stops (LivestreamBroadcast.tsx's
// MediaRecorder capture of their own outgoing stream) — there's no server-
// side media pipeline in this app's WebRTC relay, so this direct-from-
// browser upload is the only way a recording ever exists at all.
export async function uploadLivestreamRecording(livestreamId: number, video: Blob, filename: string) {
  const form = new FormData()
  form.append('video', video, filename)
  const { data } = await api.post<LivestreamItem>(`/api/livestreams/${livestreamId}/recording`, form)
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
