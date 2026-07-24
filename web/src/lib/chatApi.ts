import { api } from './api'
import type { Paginated } from './socialApi'

export type ConversationParticipant = {
  id: number
  name: string
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
