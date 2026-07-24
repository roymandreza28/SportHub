import { api } from './api'
import type { Paginated } from './socialApi'

export type Post = {
  id: number
  user_id: number
  caption: string | null
  image_url: string
  created_at: string
}

export async function fetchPosts(userId?: number) {
  const { data } = await api.get<Paginated<Post>>('/api/social/posts', {
    params: userId ? { user_id: userId } : undefined,
  })
  return data
}

export async function createPost(image: File, caption: string) {
  const form = new FormData()
  form.append('image', image)
  if (caption) form.append('caption', caption)

  const { data } = await api.post<Post>('/api/social/posts', form)
  return data
}

export async function deletePost(postId: number) {
  await api.delete(`/api/social/posts/${postId}`)
}
