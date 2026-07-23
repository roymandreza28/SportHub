import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchChatMessages, postChatMessage, type ChatMessageItem } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'
import { input } from '../../lib/formStyles'

export function LivestreamChat({ livestreamId }: { livestreamId: number }) {
  const [body, setBody] = useState('')
  const [liveMessages, setLiveMessages] = useState<ChatMessageItem[]>([])
  const [viewerCount, setViewerCount] = useState(0)

  const { data: history } = useQuery({
    queryKey: ['livestream', 'chat', livestreamId],
    queryFn: () => fetchChatMessages(livestreamId),
  })

  useEffect(() => {
    setLiveMessages([])
  }, [livestreamId])

  useEffect(() => {
    const channel = echo.join(`livestream.${livestreamId}.chat`)

    channel
      .here((members: unknown[]) => setViewerCount(members.length))
      .joining(() => setViewerCount((c) => c + 1))
      .leaving(() => setViewerCount((c) => Math.max(0, c - 1)))
      .listen('.ChatMessageSent', (message: ChatMessageItem) => {
        setLiveMessages((prev) => [...prev, message])
      })

    return () => {
      echo.leave(`livestream.${livestreamId}.chat`)
    }
  }, [livestreamId])

  const mutation = useMutation({
    mutationFn: () => postChatMessage(livestreamId, body),
    onSuccess: () => setBody(''),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (body.trim()) mutation.mutate()
  }

  const allMessages = [...(history ?? []), ...liveMessages]

  return (
    <div className="flex h-64 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        {viewerCount} watching
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto text-sm">
        {allMessages.map((m) => (
          <div key={m.id}>
            <strong className="font-semibold text-slate-800">{m.user.name}:</strong>{' '}
            <span className="text-slate-600">{m.body}</span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          type="text"
          placeholder="Say something..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${input} flex-1`}
        />
        <button type="submit" disabled={mutation.isPending} className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  )
}
