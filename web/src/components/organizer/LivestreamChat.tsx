import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchChatMessages, postChatMessage, type ChatMessageItem } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'

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
    <div className="flex h-64 flex-col rounded border p-2">
      <div className="mb-1 text-xs text-gray-500">{viewerCount} watching</div>
      <div className="flex-1 overflow-y-auto text-sm">
        {allMessages.map((m) => (
          <div key={m.id}>
            <strong>{m.user.name}:</strong> {m.body}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          type="text"
          placeholder="Say something..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 rounded border px-2 py-1 text-sm"
        />
        <button type="submit" disabled={mutation.isPending} className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">
          Send
        </button>
      </form>
    </div>
  )
}
