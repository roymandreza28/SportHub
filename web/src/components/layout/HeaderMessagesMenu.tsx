import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchConversations } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'
import { ConversationList, conversationTitle } from '../social/ConversationList'
import { ConversationWindow } from '../social/ConversationWindow'
import { NewConversationModal } from '../social/NewConversationModal'
import { IconChevronLeft, IconMessageCircle } from './icons'

export function HeaderMessagesMenu() {
  const { user } = useAuth()
  const { pendingConversationId, consumePendingConversation } = useChatUI()
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: conversations } = useQuery({ queryKey: ['social', 'conversations'], queryFn: fetchConversations })

  useEffect(() => {
    if (pendingConversationId) {
      setSelectedId(pendingConversationId)
      setOpen(true)
      consumePendingConversation()
    }
  }, [pendingConversationId, consumePendingConversation])

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selected = conversations?.find((c) => c.id === selectedId) ?? null

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen(true)}
        aria-label="Messages"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
      >
        <IconMessageCircle className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 w-80 pt-2">
          <div className="flex h-[26rem] flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-2xl">
            {selected ? (
              <>
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  <IconChevronLeft className="h-4 w-4 shrink-0" />
                  <span className="truncate">{conversationTitle(selected, user?.id)}</span>
                </button>
                <div className="min-h-0 flex-1">
                  <ConversationWindow conversationId={selected.id} />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-900">Messages</p>
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="text-xs font-semibold text-teal-600 hover:text-teal-700"
                  >
                    New
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <ConversationList conversations={conversations ?? []} selectedId={selectedId} onSelect={setSelectedId} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
