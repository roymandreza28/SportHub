import { api } from './api'
import type { Paginated } from './socialApi'

export type ConversationParticipant = {
  id: number
  name: string
  avatar_url: string | null
}

export type ConversationMessageItem = {
  id: number
  body: string
  conversation_id: number
  user: { id: number; name: string }
  created_at: string
}

export type ConversationSummary = {
  id: number
  type: 'direct' | 'group'
  name: string | null
  participants: ConversationParticipant[]
  messages: ConversationMessageItem[]
  // Pivot of the *viewer's own* membership row — present because the /conversations
  // list is queried through the authenticated user's own conversations() relation.
  pivot: { last_read_at: string | null }
}

export async function fetchConversations() {
  const { data } = await api.get<ConversationSummary[]>('/api/social/conversations')
  return data
}

export async function startDirectConversation(userId: number) {
  const { data } = await api.post<ConversationSummary>('/api/social/conversations', {
    type: 'direct',
    user_id: userId,
  })
  return data
}

export async function createGroupConversation(name: string, participantIds: number[]) {
  const { data } = await api.post<ConversationSummary>('/api/social/conversations', {
    type: 'group',
    name,
    participant_ids: participantIds,
  })
  return data
}

export async function addConversationParticipant(conversationId: number, userId: number) {
  const { data } = await api.post<ConversationSummary>(`/api/social/conversations/${conversationId}/participants`, {
    user_id: userId,
  })
  return data
}

export async function markConversationRead(conversationId: number) {
  await api.post(`/api/social/conversations/${conversationId}/read`)
}

export async function fetchMessages(conversationId: number) {
  const { data } = await api.get<Paginated<ConversationMessageItem>>(
    `/api/social/conversations/${conversationId}/messages`
  )
  return data
}

export async function sendMessage(conversationId: number, body: string) {
  const { data } = await api.post<ConversationMessageItem>(
    `/api/social/conversations/${conversationId}/messages`,
    { body }
  )
  return data
}

export function isConversationUnread(conversation: ConversationSummary, viewerId?: number): boolean {
  const lastMessage = conversation.messages[0]
  if (!lastMessage || lastMessage.user.id === viewerId) return false
  if (!conversation.pivot.last_read_at) return true
  return new Date(lastMessage.created_at) > new Date(conversation.pivot.last_read_at)
}
