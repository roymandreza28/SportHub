import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createNews } from '../../lib/organizerApi'
import { buttonPrimary, fieldGroup, input, label, textarea } from '../../lib/formStyles'

export function NewsEditor() {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const mutation = useMutation({
    mutationFn: () => createNews({ title, body }),
    onSuccess: () => {
      setTitle('')
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['news'] })
    },
  })

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-800">Post news</h3>
      <div className={fieldGroup}>
        <label className={label}>Title</label>
        <input
          type="text"
          placeholder="What's the headline?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={input}
        />
      </div>
      <div className={fieldGroup}>
        <label className={label}>Body</label>
        <textarea
          placeholder="Tell the community what's happening in Morong..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={textarea}
          rows={4}
        />
      </div>
      <button
        onClick={() => mutation.mutate()}
        disabled={!title || !body || mutation.isPending}
        className={`${buttonPrimary} self-start`}
      >
        {mutation.isPending ? 'Publishing...' : 'Publish'}
      </button>
    </div>
  )
}
