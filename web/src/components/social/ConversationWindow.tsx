import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchMessages, sendMessage } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { input } from '../../lib/formStyles'

export function ConversationWindow({ conversationId }: { conversationId: number }) {
  const { user } = useAuth()
  const [body, setBody] = useState('')

  // No socket subscription here — GlobalChatListener owns the single
  // subscription per conversation and keeps this query's cache fresh, so
  // every open surface (a floating window, a future re-render) just reads it.
  const { data: history } = useQuery({
    queryKey: ['social', 'messages', conversationId],
    queryFn: () => fetchMessages(conversationId),
  })

  const mutation = useMutation({
    mutationFn: () => sendMessage(conversationId, body),
    onSuccess: () => setBody(''),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (body.trim()) mutation.mutate()
  }

  const messages = history?.data ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {messages.map((m) => (
          <div key={m.id} className={m.user.id === user?.id ? 'text-right' : ''}>
            <span
              className={`inline-block max-w-[80%] rounded-lg px-3 py-1.5 text-left ${
                m.user.id === user?.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {m.user.id !== user?.id && <strong className="mr-1.5 block text-xs font-semibold opacity-70">{m.user.name}</strong>}
              {m.body}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-100 p-2">
        <input
          type="text"
          placeholder="Type a message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${input} flex-1`}
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
