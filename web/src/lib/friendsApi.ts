import { api } from './api'

export type FriendUserRef = {
  id: number
  name: string
  email: string
  avatar_url: string | null
}

export type Friend = {
  friendship_id: number
  user: FriendUserRef
}

export type FriendRequest = {
  id: number
  status: 'pending' | 'accepted' | 'declined'
  requester: FriendUserRef
  addressee: FriendUserRef
}

export async function fetchFriends() {
  const { data } = await api.get<Friend[]>('/api/social/friends')
  return data
}

export async function fetchFriendRequests(direction: 'incoming' | 'outgoing') {
  const { data } = await api.get<FriendRequest[]>('/api/social/friend-requests', { params: { direction } })
  return data
}

export async function sendFriendRequest(addresseeId: number) {
  const { data } = await api.post<FriendRequest>('/api/social/friend-requests', { addressee_id: addresseeId })
  return data
}

export async function acceptFriendRequest(friendshipId: number) {
  const { data } = await api.post<FriendRequest>(`/api/social/friend-requests/${friendshipId}/accept`)
  return data
}

export async function declineFriendRequest(friendshipId: number) {
  await api.post(`/api/social/friend-requests/${friendshipId}/decline`)
}

export async function removeFriendship(friendshipId: number) {
  await api.delete(`/api/social/friendships/${friendshipId}`)
}

export type FriendRequestReceivedPayload = {
  id: number
  requester: { id: number; name: string }
}

export type FriendRequestAcceptedPayload = {
  id: number
  addressee: { id: number; name: string }
}
