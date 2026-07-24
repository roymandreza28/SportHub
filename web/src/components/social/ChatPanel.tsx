import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchConversations } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { ConversationList, conversationTitle } from './ConversationList'
import { ConversationWindow } from './ConversationWindow'
import { NewConversationModal } from './NewConversationModal'
import { buttonSecondary } from '../../lib/formStyles'

export function ChatPanel({ initialConversationId }: { initialConversationId?: number }) {
  const { user } = useAuth()
  const { data: conversations } = useQuery({ queryKey: ['social', 'conversations'], queryFn: fetchConversations })
  const [selectedId, setSelectedId] = useState<number | null>(initialConversationId ?? null)
  const [showNewModal, setShowNewModal] = useState(false)

  useEffect(() => {
    if (initialConversationId) setSelectedId(initialConversationId)
  }, [initialConversationId])

  useEffect(() => {
    if (selectedId === null && conversations && conversations.length > 0) {
      setSelectedId(conversations[0].id)
    }
  }, [conversations, selectedId])

  const selected = conversations?.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex gap-4">
      <div className="w-56 shrink-0">
        <button onClick={() => setShowNewModal(true)} className={`${buttonSecondary} mb-3 w-full`}>
          New conversation
        </button>
        <ConversationList conversations={conversations ?? []} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div className="flex-1">
        {selected ? (
          <ConversationWindow conversationId={selected.id} title={conversationTitle(selected, user?.id)} />
        ) : (
          <p className="text-sm text-slate-400">Select or start a conversation.</p>
        )}
      </div>

      {showNewModal && (
        <NewConversationModal
          onClose={() => setShowNewModal(false)}
          onCreated={(conversationId) => {
            setShowNewModal(false)
            setSelectedId(conversationId)
          }}
        />
      )}
    </div>
  )
}
