import { api } from './api'
import type { Paginated } from './socialApi'

export type PostMediaItem = { id: number; url: string }

export type Post = {
  id: number
  user_id: number
  caption: string | null
  // Instagram-style carousel — always at least one image, in the order
  // they were uploaded (see PostController::store()).
  media: PostMediaItem[]
  created_at: string
}

export async function fetchPosts(userId?: number) {
  const { data } = await api.get<Paginated<Post>>('/api/social/posts', {
    params: userId ? { user_id: userId } : undefined,
  })
  return data
}

export async function createPost(images: File[], caption: string) {
  const form = new FormData()
  images.forEach((image) => form.append('images[]', image))
  if (caption) form.append('caption', caption)

  const { data } = await api.post<Post>('/api/social/posts', form)
  return data
}

export async function deletePost(postId: number) {
  await api.delete(`/api/social/posts/${postId}`)
}
