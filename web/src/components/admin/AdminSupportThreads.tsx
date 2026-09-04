import { useQuery } from '@tanstack/react-query'
import { fetchConversations } from '../../lib/chatApi'
import { useChatUI } from '../../lib/ChatUIContext'
import { ConversationList } from '../social/ConversationList'

// Every conversation reaching the admin IS a support/FAQ thread — the admin
// never friends anyone or joins a group, so this is the same endpoint the
// header's own Messages dropdown already reads, surfaced here as a full
// page list instead of a small popover. Clicking a thread opens the
// existing floating chat window (see FloatingChatWindows.tsx) rather than
// duplicating a whole conversation UI inline.
export function AdminSupportThreads() {
  const { data: conversations, isLoading } = useQuery({ queryKey: ['social', 'conversations'], queryFn: fetchConversations })
  const { openChatWindow } = useChatUI()

  return (
    <div className="flex flex-col gap-2">
      {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
      {!isLoading && <ConversationList conversations={conversations ?? []} onSelect={openChatWindow} />}
    </div>
  )
}
