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
}

export type NewsTournamentItem = {
  id: number
  name: string
  sport_id: number
  sport_format_id: number | null
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
}

export type NewsCommentItem = {
  id: number
  news_id: number
  body: string
  created_at: string
  user: { id: number; name: string; avatar_url: string | null }
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
