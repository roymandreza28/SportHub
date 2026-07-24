import type { ConversationSummary } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'

export function conversationTitle(conversation: ConversationSummary, viewerId?: number): string {
  if (conversation.type === 'group') return conversation.name ?? 'Group'
  const other = conversation.participants.find((p) => p.id !== viewerId)
  return other?.name ?? 'Conversation'
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: ConversationSummary[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const { user } = useAuth()

  if (conversations.length === 0) {
    return <p className="text-sm text-slate-400">No conversations yet.</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {conversations.map((c) => {
        const lastMessage = c.messages[0]
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === c.id ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="block truncate font-medium">{conversationTitle(c, user?.id)}</span>
              {lastMessage && (
                <span className={`block truncate text-xs ${selectedId === c.id ? 'text-teal-100' : 'text-slate-400'}`}>
                  {lastMessage.body}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
