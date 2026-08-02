import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchConversations, fetchMessages, markConversationRead, type ConversationSummary } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'
import { conversationAvatarUrl, conversationTitle } from '../social/ConversationList'
import { ConversationWindow } from '../social/ConversationWindow'
import { Avatar } from './Avatar'

function FloatingChatWindow({ conversation, onClose }: { conversation: ConversationSummary; onClose: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Opening (or receiving into) a floating window counts as reading it.
  const { data: history } = useQuery({
    queryKey: ['social', 'messages', conversation.id],
    queryFn: () => fetchMessages(conversation.id),
  })

  useEffect(() => {
    markConversationRead(conversation.id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['social', 'conversations'] })
    })
  }, [conversation.id, history?.data.length, queryClient])

  const title = conversationTitle(conversation, user?.id)
  const otherParticipant = conversation.type === 'direct' ? conversation.participants.find((p) => p.id !== user?.id) : null

  return (
    <div className="flex h-96 w-80 flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-2 bg-teal-600 px-3 py-2 text-white">
        {otherParticipant ? (
          <Link to={`/profile/${otherParticipant.id}`} className="flex min-w-0 items-center gap-2 hover:opacity-90">
            <Avatar name={title} url={conversationAvatarUrl(conversation, user?.id)} size="sm" />
            <span className="truncate text-sm font-semibold">{title}</span>
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={title} url={null} size="sm" />
            <span className="truncate text-sm font-semibold">{title}</span>
          </span>
        )}
        <button
          onClick={onClose}
          aria-label={`Close chat with ${title}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-teal-100 transition hover:bg-teal-700 hover:text-white"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ConversationWindow conversationId={conversation.id} />
      </div>
    </div>
  )
}

export function FloatingChatWindows() {
  const { user, hasRole } = useAuth()
  const { openWindows, closeChatWindow } = useChatUI()
  // venue_facilitator included: they can't start chats, but can be dropped
  // into a booking-triggered conversation once a booking is approved.
  const enabled = !!user && hasRole('player', 'coach', 'venue_facilitator')

  const { data: conversations } = useQuery({
    queryKey: ['social', 'conversations'],
    queryFn: fetchConversations,
    enabled: enabled && openWindows.length > 0,
  })

  if (!enabled || openWindows.length === 0) return null

  return (
    // Right-anchored container, normal (non-reversed) row order: since
    // openWindows lists oldest-opened first, the most recently opened
    // conversation ends up as the last DOM child — closest to the corner —
    // matching how Messenger keeps the newest chat nearest the edge.
    <div className="fixed bottom-0 right-4 z-40 flex items-end gap-3">
      {openWindows.map((id) => {
        const conversation = conversations?.find((c) => c.id === id)
        if (!conversation) return null
        return <FloatingChatWindow key={id} conversation={conversation} onClose={() => closeChatWindow(id)} />
      })}
    </div>
  )
}
