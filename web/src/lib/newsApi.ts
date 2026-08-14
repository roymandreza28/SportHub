import { api } from './api'

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
  comments_count: number
  reactions_count: number
  viewer_has_reacted: boolean
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
