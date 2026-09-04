import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchConversations, fetchMessages, markConversationRead, type ConversationSummary } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'
import { Avatar } from './Avatar'
import { conversationAvatarUrl, conversationTitle } from '../social/ConversationList'
import { ConversationWindow } from '../social/ConversationWindow'

function FloatingChatWindow({
  conversation,
  onClose,
  fullScreen = false,
}: {
  conversation: ConversationSummary
  onClose: () => void
  fullScreen?: boolean
}) {
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
    <div
      className={
        fullScreen
          ? 'flex h-full w-full flex-col overflow-hidden bg-white'
          : 'flex h-96 w-80 flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl'
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2 bg-teal-600 px-3 py-2 text-pure-white">
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
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-pure-white/70 transition hover:bg-teal-700 hover:text-pure-white"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ConversationWindow conversation={conversation} />
      </div>
    </div>
  )
}

export function FloatingChatWindows() {
  const { user, hasRole } = useAuth()
  const { openWindows, closeChatWindow } = useChatUI()
  // venue_facilitator included: they can't start chats, but can be dropped
  // into a booking-triggered conversation once a booking is approved.
  // admin/organizer/venue_organizer/livestream_organizer included: none of
  // them can start a chat on their own either, but all need to see/reply to
  // the "FAQ" support threads reaching them (see ConversationController::
  // contactAdmin()).
  const enabled =
    !!user && hasRole('player', 'coach', 'venue_facilitator', 'admin', 'organizer', 'venue_organizer', 'livestream_organizer')

  const { data: conversations } = useQuery({
    queryKey: ['social', 'conversations'],
    queryFn: fetchConversations,
    enabled: enabled && openWindows.length > 0,
  })

  if (!enabled || openWindows.length === 0) return null

  // Mobile: a corner stack of 320px boxes doesn't fit a phone screen, and
  // there's no hover affordance on touch to notice it — a new/incoming
  // message instead pops the most recently opened conversation full-screen,
  // with an explicit close button. Desktop keeps the existing Messenger-
  // style corner stack (up to MAX_OPEN_WINDOWS, oldest-to-newest left-to-right).
  const mostRecentId = openWindows[openWindows.length - 1]
  const mostRecentConversation = conversations?.find((c) => c.id === mostRecentId)

  return (
    <>
      {mostRecentConversation && (
        <div className="fixed inset-0 z-40 md:hidden">
          <FloatingChatWindow
            conversation={mostRecentConversation}
            onClose={() => closeChatWindow(mostRecentId)}
            fullScreen
          />
        </div>
      )}

      {/* Right-anchored container, normal (non-reversed) row order: since
          openWindows lists oldest-opened first, the most recently opened
          conversation ends up as the last DOM child — closest to the corner —
          matching how Messenger keeps the newest chat nearest the edge. */}
      <div className="fixed bottom-0 right-4 z-40 hidden items-end gap-3 md:flex">
        {openWindows.map((id) => {
          const conversation = conversations?.find((c) => c.id === id)
          if (!conversation) return null
          return <FloatingChatWindow key={id} conversation={conversation} onClose={() => closeChatWindow(id)} />
        })}
      </div>
    </>
  )
}
