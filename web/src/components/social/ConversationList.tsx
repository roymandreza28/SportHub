import type { ConversationSummary } from '../../lib/chatApi'
import { isConversationUnread } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { formatRelativeTime } from '../../lib/formatRelativeTime'
import { Avatar } from '../layout/Avatar'

export function conversationTitle(conversation: ConversationSummary, viewerId?: number): string {
  if (conversation.type === 'group') return conversation.name ?? 'Group'
  const other = conversation.participants.find((p) => p.id !== viewerId)
  if (!other) return 'Conversation'
  // A FAQ/support thread's admin never shows their real name to the user
  // they're helping — see ConversationParticipant.is_admin.
  return other.is_admin ? 'admin-name' : other.name
}

export function conversationAvatarUrl(conversation: ConversationSummary, viewerId?: number): string | null {
  if (conversation.type === 'group') return null
  const other = conversation.participants.find((p) => p.id !== viewerId)
  return other?.avatar_url ?? null
}

export function ConversationList({
  conversations,
  onSelect,
}: {
  conversations: ConversationSummary[]
  onSelect: (id: number) => void
}) {
  const { user } = useAuth()

  if (conversations.length === 0) {
    return <p className="p-3 text-sm text-slate-400">No conversations yet.</p>
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {conversations.map((c) => {
        const title = conversationTitle(c, user?.id)
        const lastMessage = c.messages[0]
        const unread = isConversationUnread(c, user?.id)

        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-100"
            >
              <Avatar name={title} url={conversationAvatarUrl(c, user?.id)} size="md" />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                  {title}
                </span>
                {lastMessage && (
                  <span className={`block truncate text-xs ${unread ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
                    {lastMessage.user.id === user?.id ? 'You: ' : ''}
                    {lastMessage.body}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {lastMessage && <span className="text-[11px] text-slate-400">{formatRelativeTime(lastMessage.created_at)}</span>}
                {unread && <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
