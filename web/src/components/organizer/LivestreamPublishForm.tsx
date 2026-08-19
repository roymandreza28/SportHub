import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { publishLivestreamToNews } from '../../lib/organizerApi'
import { buttonPrimary, fieldGroup, input, label, textarea } from '../../lib/formStyles'

// Shown to the main organizer once hop 1 (receiving the livestream
// organizer's camera feed) is connected — this is their actual job in the
// Livestreams tab: publish the feed to the newsfeed with a title and
// context. Publishing is what starts hop 2 (LivestreamViewer relaying the
// feed onward to newsfeed viewers).
export function LivestreamPublishForm({
  livestreamId,
  onPublished,
}: {
  livestreamId: number
  onPublished: (newsId: number) => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const mutation = useMutation({
    mutationFn: (input: { title: string; body: string }) => publishLivestreamToNews(livestreamId, input),
    onSuccess: (data) => {
      if (data.news_id) onPublished(data.news_id)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate({ title, body })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-teal-100 bg-teal-50/50 p-4">
      <h4 className="text-sm font-semibold text-slate-800">Go live to the newsfeed</h4>
      <p className="text-xs text-slate-500">
        Set a title and context, then publish — every logged-in user sees it in their newsfeed, and it appears
        publicly on the landing page's News.
      </p>
      <div className={fieldGroup}>
        <label className={label} htmlFor="publish-title">Title</label>
        <input
          id="publish-title"
          type="text"
          placeholder="e.g. Live from the finals!"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={input}
          required
        />
      </div>
      <div className={fieldGroup}>
        <label className={label} htmlFor="publish-body">Context</label>
        <textarea
          id="publish-body"
          placeholder="What's happening right now..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={textarea}
          rows={3}
          required
        />
      </div>
      <button type="submit" disabled={!title || !body || mutation.isPending} className={`${buttonPrimary} self-start`}>
        {mutation.isPending ? 'Publishing...' : 'Publish to newsfeed'}
      </button>
    </form>
  )
}
