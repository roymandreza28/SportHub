import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMessages, sendMessage, type ConversationMessageItem } from '../../lib/chatApi'
import { echo } from '../../lib/echo'
import { useAuth } from '../../lib/AuthContext'
import { input } from '../../lib/formStyles'

export function ConversationWindow({ conversationId, title }: { conversationId: number; title: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [liveMessages, setLiveMessages] = useState<ConversationMessageItem[]>([])

  const { data: history } = useQuery({
    queryKey: ['social', 'messages', conversationId],
    queryFn: () => fetchMessages(conversationId),
  })

  useEffect(() => {
    setLiveMessages([])
  }, [conversationId])

  useEffect(() => {
    const channel = echo.private(`conversation.${conversationId}`)

    channel.listen('.ConversationMessageSent', (message: ConversationMessageItem) => {
      setLiveMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      queryClient.invalidateQueries({ queryKey: ['social', 'conversations'] })
    })

    return () => {
      echo.leave(`conversation.${conversationId}`)
    }
  }, [conversationId, queryClient])

  const mutation = useMutation({
    mutationFn: () => sendMessage(conversationId, body),
    onSuccess: () => setBody(''),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (body.trim()) mutation.mutate()
  }

  const historyMessages = history?.data ?? []
  const allMessages = [...historyMessages, ...liveMessages.filter((m) => !historyMessages.some((h) => h.id === m.id))]

  return (
    <div className="flex h-96 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
        {allMessages.map((m) => (
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
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-100 p-3">
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
