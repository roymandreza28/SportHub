import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchConversations, isConversationUnread } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'
import { useIsMobile } from '../../lib/useIsMobile'
import { ConversationList, conversationTitle } from '../social/ConversationList'
import { NewConversationModal } from '../social/NewConversationModal'
import { ColleagueDirectoryModal } from '../social/ColleagueDirectoryModal'
import { IconMessageCircle, IconSearch, IconX } from './icons'

type FilterTab = 'all' | 'unread' | 'groups'

export function HeaderMessagesMenu() {
  const { user, hasRole } = useAuth()
  // The organizer family has no friends list (only player/coach hold
  // 'manage friendships'), so "New" opens the staff directory instead of
  // NewConversationModal's friend picker — see ColleagueDirectoryModal.
  const isOrganizerFamily = hasRole('organizer', 'venue_organizer', 'livestream_organizer')
  const { openChatWindow } = useChatUI()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [showNewModal, setShowNewModal] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // The mobile panel is portaled to document.body (see the createPortal
  // call below), so in the real DOM it's NOT a descendant of containerRef
  // even though it's still nested inside it in JSX/React-tree terms.
  // Without tracking it separately here, handleClickOutside's
  // containerRef.contains() check saw every tap inside the mobile panel —
  // including "New" itself — as an outside click, closing the panel via
  // mousedown before the tap's own click/onClick ever got to fire. On
  // mobile the panel is opaque and covers the full viewport anyway (no
  // real "outside" to tap — it already has its own explicit X close
  // button), so this ref exists purely to make every in-panel tap count as
  // "inside" there, same as it always has on desktop.
  const panelRef = useRef<HTMLDivElement>(null)

  const { data: conversations } = useQuery({ queryKey: ['social', 'conversations'], queryFn: fetchConversations })

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const unreadCount = (conversations ?? []).filter((c) => isConversationUnread(c, user?.id)).length

  const filtered = (conversations ?? [])
    .filter((c) => (tab === 'unread' ? isConversationUnread(c, user?.id) : tab === 'groups' ? c.type === 'group' : true))
    .filter((c) => conversationTitle(c, user?.id).toLowerCase().includes(search.toLowerCase()))

  function handleSelect(conversationId: number) {
    openChatWindow(conversationId)
    setOpen(false)
  }

  const panel = (
    <div
      className={
        isMobile
          ? 'flex h-full w-full flex-col bg-white'
          : 'flex h-[30rem] w-96 flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-2xl'
      }
    >
      <div className="flex shrink-0 items-center justify-between px-4 pt-3">
        <p className="text-lg font-bold text-slate-900">Chats</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowNewModal(true)
              // On mobile the "Chats" panel below is a z-40 full-screen
              // portal (see the createPortal call further down) — left
              // open, it sat on top of and completely hid the friend-
              // picker modal underneath it (z-30 previously, now z-50 —
              // see NewConversationModal/ColleagueDirectoryModal), even
              // though the picker was rendering fine the whole time.
              // Closing it here is what actually made the friend list
              // impossible to see; desktop never had this problem (the
              // panel there is just an absolute dropdown, not a
              // screen-covering portal), so only close it on mobile.
              if (isMobile) setOpen(false)
            }}
            className="text-xs font-semibold text-teal-600 hover:text-teal-700"
          >
            New
          </button>
          {/* No "click outside" affordance once the panel fills the whole
              screen — mobile needs an explicit close button instead. */}
          {isMobile && (
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600">
              <IconX className="h-5 w-5" />
            </button>
          )}
        </div>
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
              tab === t ? 'bg-teal-600 text-pure-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
  )

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
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
      >
        <IconMessageCircle className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-semibold text-pure-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && !isMobile && <div className="absolute right-0 top-full z-20 pt-2">{panel}</div>}

      {/* Mobile: portaled to <body> — this component lives inside the
          header's backdrop-blur bar, which establishes a new containing
          block for position: fixed descendants (same issue fixed earlier
          for NewConversationModal/AccountSettingsModal). Without the
          portal, "fixed inset-0" would resolve against the header's own
          short box instead of the real viewport. */}
      {open && isMobile && createPortal(<div ref={panelRef} className="fixed inset-0 z-40">{panel}</div>, document.body)}

      {showNewModal && isOrganizerFamily && (
        <ColleagueDirectoryModal
          onClose={() => setShowNewModal(false)}
          onOpened={(conversationId) => {
            setShowNewModal(false)
            setOpen(false)
            openChatWindow(conversationId)
          }}
        />
      )}

      {showNewModal && !isOrganizerFamily && (
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
