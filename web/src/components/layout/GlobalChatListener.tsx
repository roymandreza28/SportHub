import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConversations, type ConversationMessageItem } from '../../lib/chatApi'
import type { Paginated } from '../../lib/socialApi'
import { echo } from '../../lib/echo'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'

/**
 * Owns every conversation.{id} private-channel subscription for the whole
 * app. Centralizing this in one place avoids two independent subscribers
 * (e.g. a floating window closing while a list view is also listening)
 * calling echo.leave() on a channel the other one still needs — Echo
 * doesn't reference-count listeners per channel name.
 */
export function GlobalChatListener() {
  const { user, hasRole } = useAuth()
  const queryClient = useQueryClient()
  const { openChatWindow } = useChatUI()
  const enabled = !!user && hasRole('player', 'coach')

  const { data: conversations } = useQuery({
    queryKey: ['social', 'conversations'],
    queryFn: fetchConversations,
    enabled,
  })

  // Keyed on the *set* of conversation ids (not the array reference, which
  // changes on every refetch) so an incoming message's own cache
  // invalidation doesn't tear down and rejoin every channel on each message.
  const idsKey = conversations
    ? conversations
        .map((c) => c.id)
        .sort((a, b) => a - b)
        .join(',')
    : ''

  useEffect(() => {
    if (!enabled || !idsKey) return

    const conversationIds = idsKey.split(',').map(Number)

    conversationIds.forEach((conversationId) => {
      const channel = echo.private(`conversation.${conversationId}`)

      channel.listen('.ConversationMessageSent', (message: ConversationMessageItem) => {
        queryClient.setQueryData<Paginated<ConversationMessageItem> | undefined>(
          ['social', 'messages', conversationId],
          (old) => {
            if (!old) return old
            if (old.data.some((m) => m.id === message.id)) return old
            return { ...old, data: [...old.data, message] }
          }
        )
        queryClient.invalidateQueries({ queryKey: ['social', 'conversations'] })

        if (message.user.id !== user?.id) {
          openChatWindow(conversationId)
        }
      })
    })

    return () => {
      conversationIds.forEach((conversationId) => echo.leave(`conversation.${conversationId}`))
    }
  }, [enabled, idsKey, user, queryClient, openChatWindow])

  return null
}
