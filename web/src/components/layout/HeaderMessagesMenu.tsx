import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchConversations, isConversationUnread } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'
import { ConversationList, conversationTitle } from '../social/ConversationList'
import { NewConversationModal } from '../social/NewConversationModal'
import { IconMessageCircle, IconSearch } from './icons'

type FilterTab = 'all' | 'unread' | 'groups'

export function HeaderMessagesMenu() {
  const { user } = useAuth()
  const { openChatWindow } = useChatUI()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [showNewModal, setShowNewModal] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: conversations } = useQuery({ queryKey: ['social', 'conversations'], queryFn: fetchConversations })

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

  const filtered = (conversations ?? [])
    .filter((c) => (tab === 'unread' ? isConversationUnread(c, user?.id) : tab === 'groups' ? c.type === 'group' : true))
    .filter((c) => conversationTitle(c, user?.id).toLowerCase().includes(search.toLowerCase()))

  function handleSelect(conversationId: number) {
    openChatWindow(conversationId)
    setOpen(false)
  }

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
        <div className="absolute right-0 top-full z-20 w-96 pt-2">
          <div className="flex h-[30rem] flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between px-4 pt-3">
              <p className="text-lg font-bold text-slate-900">Chats</p>
              <button
                onClick={() => setShowNewModal(true)}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                New
              </button>
            </div>

            <div className="shrink-0 px-4 pt-3">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Messenger"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>

            <div className="flex shrink-0 gap-2 px-4 pb-1 pt-3">
              {(['all', 'unread', 'groups'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    tab === t ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <ConversationList conversations={filtered} onSelect={handleSelect} />
            </div>
          </div>
        </div>
      )}

      {showNewModal && (
        <NewConversationModal
          onClose={() => setShowNewModal(false)}
          onCreated={(conversationId) => {
            setShowNewModal(false)
            setOpen(false)
            openChatWindow(conversationId)
          }}
        />
      )}
    </div>
  )
}
