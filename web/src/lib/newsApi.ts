import { api } from './api'

export type NewsMediaItem = {
  id: number
  type: 'image' | 'video'
  url: string
}

export type NewsLivestreamItem = {
  id: number
  title: string
  status: 'scheduled' | 'live' | 'ended'
  // Set once the broadcaster's device has uploaded its recording of the
  // broadcast — LiveRelayVideo falls back to playing this once status is
  // 'ended', instead of attempting (and failing) a live WebRTC connection.
  recording_url: string | null
}

export type NewsTournamentItem = {
  id: number
  name: string
  sport_id: number
  sport_format_id: number | null
}

export type NewsMatchParticipant = { id: number; name: string }

export type NewsMatchItem = {
  id: number
  status: 'scheduled' | 'live' | 'completed'
  score_a: number
  score_b: number
  won_by_default: boolean
  // Basketball/3x3's game clock only — null for every other sport, whose
  // scoreboards never sync one. clock_seconds_remaining is a snapshot as of
  // clock_synced_at; LiveMatchScore.tsx extrapolates the running countdown
  // locally from there rather than waiting on a tick-by-tick broadcast.
  clock_seconds_remaining: number | null
  clock_shot_seconds_remaining: number | null
  clock_running: boolean
  clock_period_label: string | null
  clock_synced_at: string | null
  participant_a: NewsMatchParticipant | null
  participant_b: NewsMatchParticipant | null
  winner: NewsMatchParticipant | null
}

export type NewsItem = {
  id: number
  title: string
  body: string
  cover_image_url: string | null
  published_at: string | null
  // is_organizer drives hiding the personal name on the reading feed — an
  // organizer's post reads as an official announcement, not a personal one.
  author: { id: number; name: string; is_organizer: boolean }
  media: NewsMediaItem[]
  livestreams: NewsLivestreamItem[]
  comments_count: number
  reactions_count: number
  viewer_has_reacted: boolean
  // Set when this post announces or celebrates a tournament — a player who
  // clicks the title gets told to ask their coach; a coach gets dropped into
  // the team-registration wizard pre-seeded with this tournament.
  tournament: NewsTournamentItem | null
  // Set when this post was shared from a specific game (ShareMatchModal) —
  // its score/status here is a snapshot as of when the post was fetched;
  // LiveMatchScore.tsx subscribes to the match's own public channel to keep
  // it ticking live for as long as the match stays 'live'.
  match: NewsMatchItem | null
}

export type NewsCommentItem = {
  id: number
  news_id: number
  body: string
  created_at: string
  user: { id: number; name: string; avatar_url: string | null }
}

// A post shared while a game was live gets its title auto-filled with a
// "🔴 LIVE: " prefix (see ShareMatchModal.tsx's prefillFor) — but a post's
// title is a plain string frozen at whatever it said when published, so
// that prefix stays there forever once stored, even long after the match
// it names has actually finished. Stripped at display time only (the
// stored title is never touched here) whenever the linked match is no
// longer live, so a finished game's post stops silently claiming it's
// still live.
const LIVE_TITLE_PREFIX = /^🔴\s*LIVE:\s*/

export function displayNewsTitle(item: NewsItem): string {
  if (item.match && item.match.status !== 'live') {
    return item.title.replace(LIVE_TITLE_PREFIX, '')
  }
  return item.title
}

export async function fetchNewsFeed() {
  const { data } = await api.get<NewsItem[]>('/api/news')
  return data
}

export async function fetchNewsComments(newsId: number) {
  const { data } = await api.get<NewsCommentItem[]>(`/api/news/${newsId}/comments`)
  return data
}

export async function createNewsComment(newsId: number, body: string) {
  const { data } = await api.post<NewsCommentItem>(`/api/news/${newsId}/comments`, { body })
  return data
}

export async function deleteNewsComment(commentId: number) {
  await api.delete(`/api/news-comments/${commentId}`)
}

export async function toggleNewsReaction(newsId: number) {
  const { data } = await api.post<{ reacted: boolean; reactions_count: number }>(`/api/news/${newsId}/react`)
  return data
}

// Editing/deleting is enforced server-side to the post's own author
// (NewsPolicy::update/delete) — the frontend only ever shows these to
// item.author.id === the viewer's own id, but the backend is the real gate.
export async function updateNews(newsId: number, input: { title: string; body: string }) {
  const { data } = await api.patch<NewsItem>(`/api/news/${newsId}`, input)
  return data
}

export async function deleteNews(newsId: number) {
  await api.delete(`/api/news/${newsId}`)
}
