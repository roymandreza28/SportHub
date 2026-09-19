import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  archiveConversation,
  blockConversation,
  hideConversation,
  isConversationMuted,
  markConversationRead,
  muteConversation,
  type ConversationSummary,
  type MuteDuration,
} from '../../lib/chatApi'
import { conversationTitle } from './ConversationList'
import { useAuth } from '../../lib/AuthContext'
import { IconChevronDown, IconDotsVertical } from '../layout/icons'
import { ReportConversationModal } from './ReportConversationModal'

const MUTE_OPTIONS: { label: string; value: MuteDuration }[] = [
  { label: '15 minutes', value: '15m' },
  { label: '1 hour', value: '1h' },
  { label: '8 hours', value: '8h' },
  { label: '24 hours', value: '24h' },
  { label: 'Until I turn it back on', value: 'forever' },
]

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3.5 py-2 text-left text-sm transition ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )
}

// The per-conversation "..." menu — Mark as read / Mute / Archive / Delete /
// Block / Report, each following the same per-viewer-only semantics real
// Messenger uses: every action here changes only how THIS conversation
// looks in the CALLER's own list (or, for Block, whether messages can flow
// in it at all) — never anything about the other participant's own copy of
// the same conversation. See ConversationController's mute/archive/hide/
// block/report methods for the server side of each.
//
// variant="icon" (default) is the small standalone "..." trigger used on a
// ConversationList row. variant="inline" instead renders its own trigger as
// plain text + a chevron, meant to sit where a conversation's name already
// is (see FloatingChatWindows' header) so clicking the name itself opens
// this same options list, instead of only being reachable from the list.
export function ConversationRowMenu({
  conversation,
  className,
  variant = 'icon',
}: {
  conversation: ConversationSummary
  className?: string
  variant?: 'icon' | 'inline'
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [muteSubmenu, setMuteSubmenu] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const muted = isConversationMuted(conversation)
  const archived = !!conversation.pivot.archived_at
  const blocked = !!conversation.pivot.blocked_at
  const otherName = conversationTitle(conversation, user?.id)

  function invalidate() {
    // Invalidates every ['social', 'conversations', ...] query — the plain
    // list AND the separate ?archived=1 one HeaderMessagesMenu's Archived
    // tab holds under the same key prefix — so archiving/unarchiving moves
    // a row between the two views immediately rather than only on the next
    // unrelated refetch.
    queryClient.invalidateQueries({ queryKey: ['social', 'conversations'] })
  }

  const readMutation = useMutation({ mutationFn: () => markConversationRead(conversation.id), onSuccess: invalidate })
  const muteMutation = useMutation({
    mutationFn: (duration: MuteDuration) => muteConversation(conversation.id, duration),
    onSuccess: invalidate,
  })
  const archiveMutation = useMutation({
    mutationFn: (next: boolean) => archiveConversation(conversation.id, next),
    onSuccess: invalidate,
  })
  const hideMutation = useMutation({ mutationFn: () => hideConversation(conversation.id), onSuccess: invalidate })
  const blockMutation = useMutation({ mutationFn: () => blockConversation(conversation.id), onSuccess: invalidate })

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function closeMenu() {
    setOpen(false)
    setMuteSubmenu(false)
  }

  return (
    // For variant="icon", the caller's own className already sets
    // position:absolute (ConversationList anchors the "..." trigger to the
    // corner of its row) — that already makes this element a valid
    // positioning context for the dropdown below, so `relative` is only
    // added for variant="inline" (a plain, unpositioned className, if any).
    <div ref={containerRef} className={`${variant === 'inline' ? 'relative' : ''} ${className ?? ''}`}>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={(e) => {
            // Stops the click from also bubbling into the row's own
            // onClick={() => onSelect(c.id)} — the two buttons overlap
            // visually (this one sits absolutely positioned on top of the
            // row), so without this, opening the menu would ALSO open the
            // conversation underneath it.
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          aria-label="Conversation options"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
        >
          <IconDotsVertical className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left text-sm transition hover:bg-black/10"
        >
          <span className="min-w-0 truncate font-semibold">{otherName}</span>
          <IconChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 text-slate-900 shadow-2xl ${
            variant === 'icon' ? 'right-0' : 'left-0'
          }`}
        >
          {!muteSubmenu ? (
            <>
              <MenuItem label="Mark as read" onClick={() => (readMutation.mutate(), closeMenu())} />
              <MenuItem
                label={muted ? 'Muted — change' : 'Mute notifications'}
                onClick={() => setMuteSubmenu(true)}
              />
              <MenuItem
                label={archived ? 'Unarchive' : 'Archive'}
                onClick={() => (archiveMutation.mutate(!archived), closeMenu())}
              />
              <MenuItem
                label="Delete"
                onClick={() => {
                  if (window.confirm(`Delete this conversation with ${otherName}? It'll come back if a new message arrives.`)) {
                    hideMutation.mutate()
                  }
                  closeMenu()
                }}
              />
              {conversation.type === 'direct' && !blocked && (
                <MenuItem
                  danger
                  label="Block"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Block ${otherName}? Neither of you will be able to send messages in this conversation anymore.`
                      )
                    ) {
                      blockMutation.mutate()
                    }
                    closeMenu()
                  }}
                />
              )}
              <MenuItem
                danger
                label="Report"
                onClick={() => {
                  setReportOpen(true)
                  closeMenu()
                }}
              />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMuteSubmenu(false)}
                className="flex w-full items-center gap-1.5 border-b border-slate-100 px-3.5 py-2 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                <IconChevronDown className="h-3 w-3 rotate-90" /> Mute for...
              </button>
              {muted && <MenuItem label="Unmute" onClick={() => (muteMutation.mutate('off'), closeMenu())} />}
              {MUTE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} label={opt.label} onClick={() => (muteMutation.mutate(opt.value), closeMenu())} />
              ))}
            </>
          )}
        </div>
      )}

      {reportOpen && <ReportConversationModal conversationId={conversation.id} onClose={() => setReportOpen(false)} />}
    </div>
  )
}
