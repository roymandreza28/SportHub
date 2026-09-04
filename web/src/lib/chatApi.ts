import { api } from './api'
import type { Paginated } from './socialApi'

export type ConversationParticipant = {
  id: number
  name: string
  avatar_url: string | null
  // True only for the admin account on a FAQ/support thread (see
  // ConversationController::flagAdminParticipants()) — drives masking their
  // real name behind "admin-name" and picking the email-style composer vs.
  // the normal chat thread (see ConversationWindow.tsx).
  is_admin: boolean
}

export type ConversationMessageItem = {
  id: number
  body: string
  attachment_url: string | null
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

// Powers the "FAQ" button in the player/coach/venue_facilitator settings
// dropdown — opens (or reopens) a direct line to an admin. Unlike
// startDirectConversation() above, this doesn't require being friends with
// the recipient first.
export async function contactAdmin() {
  const { data } = await api.post<ConversationSummary>('/api/social/conversations/contact-admin')
  return data
}

export type OrganizerDirectoryEntry = {
  id: number
  name: string
  email: string
  avatar_url: string | null
  role: 'organizer' | 'venue_organizer' | 'livestream_organizer'
}

// The organizer/venue_organizer/livestream_organizer "staff directory" —
// every member of that family except the caller, so the main organizer can
// message a venue/livestream organizer (or either of those message the main
// organizer back) without a friends list, which none of these roles have.
export async function fetchOrganizerDirectory() {
  const { data } = await api.get<OrganizerDirectoryEntry[]>('/api/social/organizer-directory')
  return data
}

export async function contactColleague(userId: number) {
  const { data } = await api.post<ConversationSummary>('/api/social/conversations/contact-colleague', {
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

export async function sendMessage(conversationId: number, body: string, attachment?: File) {
  if (!attachment) {
    const { data } = await api.post<ConversationMessageItem>(
      `/api/social/conversations/${conversationId}/messages`,
      { body }
    )
    return data
  }

  const formData = new FormData()
  if (body) formData.append('body', body)
  formData.append('attachment', attachment)

  const { data } = await api.post<ConversationMessageItem>(
    `/api/social/conversations/${conversationId}/messages`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return data
}

export function isConversationUnread(conversation: ConversationSummary, viewerId?: number): boolean {
  const lastMessage = conversation.messages[0]
  if (!lastMessage || lastMessage.user.id === viewerId) return false
  if (!conversation.pivot.last_read_at) return true
  return new Date(lastMessage.created_at) > new Date(conversation.pivot.last_read_at)
}
