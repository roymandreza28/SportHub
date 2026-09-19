import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pinMessage, removeMessage, type ConversationMessageItem } from '../../lib/chatApi'
import { IconDotsVertical } from '../layout/icons'
import { ForwardMessageModal } from './ForwardMessageModal'
import { ReportMessageModal } from './ReportMessageModal'

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

const MENU_WIDTH = 176 // w-44

// The per-message "..." menu — Reply / Forward / Pin / Report / Remove,
// mirroring ConversationRowMenu's own pattern for the per-conversation one.
// isOwn gates Remove (author-only, enforced server-side too) and hides
// Report (reporting your own message makes no sense); pin is open to any
// participant, same as the shared pinned-messages list it toggles.
//
// The dropdown is portaled to document.body and positioned with fixed
// coordinates computed from the trigger's own bounding rect, rather than
// a plain `absolute` box inside the message row. A floating chat window is
// a short, fixed-height box with `overflow-hidden` AND a scrollable message
// list nested inside it — an absolutely positioned dropdown anchored to a
// message near the bottom of that list gets its own box clipped/misplaced
// by those ancestors (verified: it rendered detached, well outside the
// window's own rounded border). Fixed positioning relative to the viewport
// sidesteps all of that, same as every modal in this app already does.
export function MessageRowMenu({
  conversationId,
  message,
  isOwn,
  align = 'right',
  onReply,
}: {
  conversationId: number
  message: ConversationMessageItem
  isOwn: boolean
  align?: 'left' | 'right'
  onReply: (message: ConversationMessageItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const pinned = !!message.pinned_at

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['social', 'messages', conversationId] })
  }

  const pinMutation = useMutation({
    mutationFn: (next: boolean) => pinMessage(conversationId, message.id, next),
    onSuccess: invalidate,
  })
  const removeMutation = useMutation({
    mutationFn: () => removeMessage(conversationId, message.id),
    onSuccess: invalidate,
  })

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setCoords({
        top: rect.bottom + 4,
        left: align === 'right' ? rect.right - MENU_WIDTH : rect.left,
      })
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    // Also close on any scroll (e.g. the message list itself) — a fixed-
    // position menu doesn't scroll with its trigger, so keeping it open
    // through a scroll would leave it pointing at the wrong message.
    function handleScroll() {
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          toggleOpen()
        }}
        aria-label="Message options"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 opacity-60 transition hover:bg-slate-200 hover:text-slate-600 hover:opacity-100"
      >
        <IconDotsVertical className="h-3.5 w-3.5" />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
            className="fixed z-50 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-2xl"
          >
            <MenuItem
              label="Reply"
              onClick={() => {
                onReply(message)
                setOpen(false)
              }}
            />
            <MenuItem
              label="Forward"
              onClick={() => {
                setForwardOpen(true)
                setOpen(false)
              }}
            />
            <MenuItem
              label={pinned ? 'Unpin' : 'Pin'}
              onClick={() => {
                pinMutation.mutate(!pinned)
                setOpen(false)
              }}
            />
            {!isOwn && (
              <MenuItem
                danger
                label="Report"
                onClick={() => {
                  setReportOpen(true)
                  setOpen(false)
                }}
              />
            )}
            {isOwn && (
              <MenuItem
                danger
                label="Remove"
                onClick={() => {
                  if (window.confirm('Remove this message? It will be removed for everyone in this conversation.')) {
                    removeMutation.mutate()
                  }
                  setOpen(false)
                }}
              />
            )}
          </div>,
          document.body
        )}

      {forwardOpen && (
        <ForwardMessageModal conversationId={conversationId} messageId={message.id} onClose={() => setForwardOpen(false)} />
      )}
      {reportOpen && (
        <ReportMessageModal conversationId={conversationId} messageId={message.id} onClose={() => setReportOpen(false)} />
      )}
    </>
  )
}
