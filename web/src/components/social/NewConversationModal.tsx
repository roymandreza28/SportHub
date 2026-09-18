import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchFriends } from '../../lib/friendsApi'
import { createGroupConversation, startDirectConversation } from '../../lib/chatApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label } from '../../lib/formStyles'
import { Avatar } from '../layout/Avatar'
import { useIsMobile } from '../../lib/useIsMobile'
import { IconX } from '../layout/icons'

export function NewConversationModal({
  onClose,
  onCreated,
  title = 'New conversation',
  helperText,
  submitLabel = 'Start',
  submitPendingLabel = 'Starting...',
  singleSelect = false,
}: {
  onClose: () => void
  onCreated: (conversationId: number) => void
  title?: string
  helperText?: string
  submitLabel?: string
  submitPendingLabel?: string
  // Sharing something to exactly one friend doesn't need the "turn this
  // into a group" affordance below — restrict to picking a single friend
  // and skip straight to a direct conversation.
  singleSelect?: boolean
}) {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const { data: friends, isLoading: friendsLoading } = useQuery({ queryKey: ['social', 'friends'], queryFn: fetchFriends })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [groupName, setGroupName] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected)
      if (ids.length === 1 && !groupName) {
        return startDirectConversation(ids[0])
      }
      return createGroupConversation(groupName, ids)
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['social', 'conversations'] })
      onCreated(conversation.id)
    },
  })

  function toggle(id: number) {
    setSelected((prev) => {
      if (singleSelect) return prev.has(id) ? new Set() : new Set([id])
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isGroup = !singleSelect && (selected.size > 1 || !!groupName)

  // Portaled to <body> rather than rendered inline — this modal is opened
  // from inside the header's backdrop-blur dropdown (HeaderMessagesMenu),
  // and backdrop-filter establishes a new containing block for fixed-
  // position descendants. Left inline, "fixed inset-0" resolves against the
  // header's own (short) box instead of the viewport, squeezing the dialog
  // into a thin strip at the top instead of centering it on the page.
  //
  // z-50: higher than HeaderMessagesMenu's mobile "Chats" panel (z-40) —
  // that panel is itself a full-screen portal, so on mobile it used to sit
  // on top of and completely hide this one at the old z-30, even though the
  // friend list was rendering the whole time. HeaderMessagesMenu now also
  // closes that panel before opening this one, but the higher z-index here
  // means the picker stays visible either way.
  //
  // Mobile gets its own full-bleed layout (no backdrop, no rounded card, no
  // max-width) rather than the desktop centered card shrunk to fit — same
  // fork StatSheetModal.tsx uses. The friends list itself becomes the
  // flexible middle section (flex-1) so it fills whatever room is left
  // between the header and the action buttons, with its own scroll, instead
  // of staying capped at a desktop-sized ~192px on a full phone screen.
  return createPortal(
    <div
      className={
        isMobile
          ? 'fixed inset-0 z-50 flex flex-col bg-white'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4'
      }
    >
      <div
        className={
          isMobile
            ? 'flex h-full w-full flex-col p-4'
            : 'flex w-full max-w-sm flex-col rounded-xl bg-white p-6 shadow-2xl'
        }
        style={isMobile ? undefined : { maxHeight: '92vh' }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {helperText && <p className="mt-1 text-sm text-slate-500">{helperText}</p>}
          </div>
          {isMobile && (
            <button onClick={onClose} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-600">
              <IconX className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className={`${fieldGroup} min-h-0 ${isMobile ? 'flex-1' : ''}`}>
            <label className={label}>Friends</label>
            <div
              className={`overflow-y-auto rounded-lg border border-slate-100 ${isMobile ? 'flex-1' : 'max-h-48'}`}
            >
              {friendsLoading && <p className="p-3 text-sm text-slate-400">Loading...</p>}
              {!friendsLoading && friends?.length === 0 && (
                <p className="p-3 text-sm text-slate-400">Add a friend first.</p>
              )}
              {friends?.map((friend) => (
                <label
                  key={friend.friendship_id}
                  className="flex items-center gap-2.5 border-b border-slate-50 px-3 py-2 text-sm font-medium text-slate-700 last:border-0 hover:bg-slate-50"
                >
                  <input
                    type={singleSelect ? 'radio' : 'checkbox'}
                    checked={selected.has(friend.user.id)}
                    onChange={() => toggle(friend.user.id)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <Avatar name={friend.user.name} url={friend.user.avatar_url} size="sm" />
                  {friend.user.name}
                </label>
              ))}
            </div>
          </div>

          {isGroup && (
            <div className={fieldGroup}>
              <label className={label}>Group name</label>
              <input
                type="text"
                placeholder="Weekend Squad"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className={input}
              />
            </div>
          )}

          {mutation.isError && <p className="text-xs text-red-600">Couldn't start that conversation.</p>}
        </div>

        <div className="mt-5 flex shrink-0 justify-end gap-2">
          {!isMobile && (
            <button onClick={onClose} className={buttonSecondary}>
              Cancel
            </button>
          )}
          <button
            onClick={() => mutation.mutate()}
            disabled={selected.size === 0 || (isGroup && !groupName) || mutation.isPending}
            className={buttonPrimary}
          >
            {mutation.isPending ? submitPendingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
