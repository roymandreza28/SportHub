import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchChatMessages, postChatMessage } from '../../lib/organizerApi'

export function LivestreamChat({ livestreamId }: { livestreamId: number }) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')

  const { data: messages } = useQuery({
    queryKey: ['livestream', 'chat', livestreamId],
    queryFn: () => fetchChatMessages(livestreamId),
    refetchInterval: 3000,
  })

  const mutation = useMutation({
    mutationFn: () => postChatMessage(livestreamId, body),
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['livestream', 'chat', livestreamId] })
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (body.trim()) mutation.mutate()
  }

  return (
    <div className="flex h-64 flex-col rounded border p-2">
      <div className="flex-1 overflow-y-auto text-sm">
        {messages?.map((m) => (
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
