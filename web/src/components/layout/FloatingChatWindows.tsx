import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConversations, fetchMessages, markConversationRead, type ConversationSummary } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'
import { conversationTitle } from '../social/ConversationList'
import { ConversationWindow } from '../social/ConversationWindow'

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

  return (
    <div className="flex h-96 w-80 flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between bg-teal-600 px-3 py-2.5 text-white">
        <span className="truncate text-sm font-semibold">{conversationTitle(conversation, user?.id)}</span>
        <button
          onClick={onClose}
          aria-label={`Close chat with ${conversationTitle(conversation, user?.id)}`}
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
  const enabled = !!user && hasRole('player', 'coach')

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
