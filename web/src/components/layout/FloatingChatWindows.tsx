import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  fetchConversations,
  fetchMessages,
  isUserOnline,
  markConversationRead,
  type ConversationSummary,
} from '../../lib/chatApi'
import { formatRelativeTime } from '../../lib/formatRelativeTime'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'
import { Avatar } from './Avatar'
import { IconMinimize } from './icons'
import { conversationAvatarUrl, conversationTitle } from '../social/ConversationList'
import { ConversationRowMenu } from '../social/ConversationRowMenu'
import { ConversationWindow } from '../social/ConversationWindow'

// Green while they're within the ~90s online window (see isUserOnline()),
// gray once they've aged past it (with "Active {relative} ago" if we at
// least know when), red if the reason they can't be reached isn't absence
// at all — they've blocked this conversation (see
// ConversationSummary.blocked_by_other's own comment on why that's the
// only direction this can mean "blocked ME", not "I blocked them").
function StatusLine({ blockedByOther, lastSeenAt }: { blockedByOther: boolean; lastSeenAt: string | null }) {
  if (blockedByOther) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-pure-white/80">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
        Blocked you
      </span>
    )
  }

  const online = isUserOnline(lastSeenAt)

  return (
    <span className="flex items-center gap-1 text-[11px] text-pure-white/80">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? 'bg-green-400' : 'bg-slate-300'}`} />
      {online ? 'Active now' : lastSeenAt ? `Active ${formatRelativeTime(lastSeenAt)} ago` : 'Offline'}
    </span>
  )
}

function FloatingChatWindow({
  conversation,
  onClose,
  minimized = false,
  onToggleMinimize,
  fullScreen = false,
}: {
  conversation: ConversationSummary
  onClose: () => void
  minimized?: boolean
  onToggleMinimize?: () => void
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
  const avatarUrl = conversationAvatarUrl(conversation, user?.id)

  const showBubble = minimized && !fullScreen
  const online = otherParticipant ? isUserOnline(otherParticipant.last_seen_at) : false

  return (
    <>
      {/* Real Messenger's own minimized state: not a collapsed header bar,
          but the conversation shrinking down to just its round avatar
          bubble (photo, or Avatar's own first-initial fallback when
          there's no photo — see Avatar.tsx). A sibling of the full window
          below, not a replacement for it — see that div's own comment on
          why both stay mounted at once. */}
      <button
        onClick={onToggleMinimize}
        aria-label={`Expand chat with ${title}`}
        className={`relative shrink-0 rounded-full shadow-2xl transition hover:scale-105 ${showBubble ? '' : 'hidden'}`}
      >
        <Avatar name={title} url={avatarUrl} size="lg" className="ring-2 ring-white" />
        {otherParticipant && (
          <span
            className={`absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
              conversation.blocked_by_other ? 'bg-red-500' : online ? 'bg-green-500' : 'bg-slate-300'
            }`}
          />
        )}
      </button>

      <div
        className={`${showBubble ? 'hidden' : 'flex'} ${
          fullScreen
            ? 'h-full w-full flex-col overflow-hidden bg-white'
            : 'h-96 w-80 flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 bg-teal-600 px-3 py-2 text-pure-white">
          <div className="flex min-w-0 items-center gap-2">
            {/* The avatar image still opens the profile (only meaningful for
                a direct conversation — a group has no single profile to go
                to); the NAME next to it is its own trigger now, opening the
                same options list ConversationRowMenu shows from the
                conversation list row (Mark as read/Mute/Archive/Delete/
                Block/Report), reachable here too instead of only there. */}
            {otherParticipant ? (
              <Link to={`/profile/${otherParticipant.id}`} aria-label={`View ${title}'s profile`} className="shrink-0 hover:opacity-90">
                <Avatar name={title} url={avatarUrl} size="sm" />
              </Link>
            ) : (
              <Avatar name={title} url={null} size="sm" />
            )}
            <div className="min-w-0">
              <ConversationRowMenu conversation={conversation} variant="inline" />
              {otherParticipant && (
                <StatusLine blockedByOther={conversation.blocked_by_other} lastSeenAt={otherParticipant.last_seen_at} />
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!fullScreen && onToggleMinimize && (
              <button
                onClick={onToggleMinimize}
                aria-label={`Minimize chat with ${title}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-pure-white/70 transition hover:bg-teal-700 hover:text-pure-white"
              >
                <IconMinimize className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={`Close chat with ${title}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-pure-white/70 transition hover:bg-teal-700 hover:text-pure-white"
            >
              ×
            </button>
          </div>
        </div>
        {/* Always mounted, even while the bubble above is what's actually
            showing — an in-progress draft in the composer shouldn't vanish
            just because the window got minimized, same as real Messenger. */}
        <div className="min-h-0 flex-1">
          <ConversationWindow conversation={conversation} />
        </div>
      </div>
    </>
  )
}

export function FloatingChatWindows() {
  const { user, hasRole } = useAuth()
  const { openWindows, minimizedIds, closeChatWindow, toggleMinimizeChatWindow } = useChatUI()
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
    queryFn: () => fetchConversations(),
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
          return (
            <FloatingChatWindow
              key={id}
              conversation={conversation}
              onClose={() => closeChatWindow(id)}
              minimized={minimizedIds.includes(id)}
              onToggleMinimize={() => toggleMinimizeChatWindow(id)}
            />
          )
        })}
      </div>
    </>
  )
}
