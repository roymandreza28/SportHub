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
  // Bumped by POST /api/heartbeat every ~25s from any of that user's open
  // tabs — see useHeartbeat.ts and isUserOnline() below. Null means they've
  // never sent one (e.g. an account that predates this feature, or one
  // that's simply never been active since).
  last_seen_at: string | null
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
  pivot: {
    last_read_at: string | null
    muted_until: string | null
    archived_at: string | null
    blocked_at: string | null
  }
  // True only when the OTHER participant set the block, not the viewer —
  // see ConversationController::decorateConversation()'s own comment on
  // why pivot.blocked_at alone can't answer "am I the one who got
  // blocked." Always false for a group (blocking only applies to a direct
  // conversation).
  blocked_by_other: boolean
}

export function isConversationMuted(conversation: ConversationSummary): boolean {
  const until = conversation.pivot.muted_until
  return !!until && new Date(until) > new Date()
}

// Generous relative to the ~25s heartbeat interval (useHeartbeat.ts) — big
// enough to absorb a slow network/backgrounded-tab tick without flickering
// someone's status between green and gray, small enough that "online"
// still means "genuinely has this open right now," not "used the app at
// some point in the last several minutes."
const ONLINE_THRESHOLD_MS = 90 * 1000

export function isUserOnline(lastSeenAt: string | null): boolean {
  return !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
}

// See useHeartbeat.ts — fired on a fixed interval from any authenticated
// tab, regardless of role.
export async function sendHeartbeat() {
  await api.post('/api/heartbeat')
}

export async function fetchConversations(options?: { archived?: boolean }) {
  const { data } = await api.get<ConversationSummary[]>('/api/social/conversations', {
    params: options?.archived ? { archived: 1 } : undefined,
  })
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

export type MuteDuration = '15m' | '1h' | '8h' | '24h' | 'forever' | 'off'

export async function muteConversation(conversationId: number, duration: MuteDuration) {
  const { data } = await api.post<{ muted_until: string | null }>(
    `/api/social/conversations/${conversationId}/mute`,
    { duration }
  )
  return data
}

export async function archiveConversation(conversationId: number, archived: boolean) {
  await api.post(`/api/social/conversations/${conversationId}/archive`, { archived })
}

// Messenger-style "delete" — clears the thread from the caller's own list
// only; it reappears there the next time anyone sends a new message into
// it (see ConversationMessageController::store()). Nothing is actually
// deleted server-side.
export async function hideConversation(conversationId: number) {
  await api.post(`/api/social/conversations/${conversationId}/hide`)
}

// Direct conversations only — silences further messages in THIS thread
// from either side. Doesn't touch friendship/matchmaking.
export async function blockConversation(conversationId: number) {
  await api.post(`/api/social/conversations/${conversationId}/block`)
}

export async function reportConversation(conversationId: number, reason: string) {
  await api.post(`/api/social/conversations/${conversationId}/report`, { reason })
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

  // No explicit Content-Type here — the browser needs to generate its own
  // multipart boundary (e.g. `multipart/form-data; boundary=----WebKit...`).
  // A hardcoded header with no boundary makes the request body unparseable,
  // so PHP populates neither $_POST nor $_FILES and the request 422s on
  // required_without validation for both fields, every time.
  const { data } = await api.post<ConversationMessageItem>(
    `/api/social/conversations/${conversationId}/messages`,
    formData
  )
  return data
}

export function isConversationUnread(conversation: ConversationSummary, viewerId?: number): boolean {
  const lastMessage = conversation.messages[0]
  if (!lastMessage || lastMessage.user.id === viewerId) return false
  if (!conversation.pivot.last_read_at) return true
  return new Date(lastMessage.created_at) > new Date(conversation.pivot.last_read_at)
}
