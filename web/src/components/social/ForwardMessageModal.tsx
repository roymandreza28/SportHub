import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchConversations, forwardMessage } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { Avatar } from '../layout/Avatar'
import { buttonSecondary } from '../../lib/formStyles'
import { IconX } from '../layout/icons'
import { conversationAvatarUrl, conversationTitle } from './ConversationList'

export function ForwardMessageModal({
  conversationId,
  messageId,
  onClose,
}: {
  conversationId: number
  messageId: number
  onClose: () => void
}) {
  const { user } = useAuth()
  const [sentTo, setSentTo] = useState<number | null>(null)

  const { data: conversations } = useQuery({
    queryKey: ['social', 'conversations'],
    queryFn: () => fetchConversations(),
  })

  const mutation = useMutation({
    mutationFn: (targetId: number) => forwardMessage(conversationId, messageId, targetId),
    onSuccess: (_data, targetId) => setSentTo(targetId),
  })

  // Any conversation the viewer is already in, including this one — Messenger
  // lets you forward a message right back into a group as a re-share too.
  const targets = conversations ?? []

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Forward message</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {mutation.isError && <p className="mt-2 text-xs text-red-600">Something went wrong — please try again.</p>}

        <div className="mt-3 flex-1 overflow-y-auto">
          {targets.length === 0 ? (
            <p className="py-4 text-sm text-slate-400">No conversations to forward to yet.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {targets.map((c) => {
                const title = conversationTitle(c, user?.id)
                const justSent = sentTo === c.id
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(c.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Avatar name={title} url={conversationAvatarUrl(c, user?.id)} size="md" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{title}</span>
                      {justSent && <span className="shrink-0 text-xs font-semibold text-teal-600">Sent</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className={buttonSecondary}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
