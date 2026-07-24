import { api } from './api'
import type { Role } from './AuthContext'

export type FriendshipStatus = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'friends'

export type SocialUserSummary = {
  id: number
  name: string
  email: string
  roles: { id: number; name: Role }[]
}

export type Paginated<T> = {
  data: T[]
  current_page: number
  last_page: number
  total: number
}

export type ProfileResponse = {
  user: {
    id: number
    name: string
    roles: Role[]
    bio: string | null
  }
  friendship_status: FriendshipStatus
  friendship_id: number | null
}

export async function searchSocialUsers(search: string) {
  const { data } = await api.get<Paginated<SocialUserSummary>>('/api/social/users', { params: { search } })
  return data
}

export async function fetchProfile(userId: number) {
  const { data } = await api.get<ProfileResponse>(`/api/social/users/${userId}`)
  return data
}
