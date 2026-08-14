import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createNewsComment, deleteNewsComment, fetchNewsComments } from '../../lib/newsApi'
import { useAuth } from '../../lib/AuthContext'
import { Avatar } from '../layout/Avatar'
import { buttonPrimary, input } from '../../lib/formStyles'

export function NewsComments({ newsId }: { newsId: number }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')

  const { data: comments } = useQuery({
    queryKey: ['newsfeed', 'comments', newsId],
    queryFn: () => fetchNewsComments(newsId),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['newsfeed', 'comments', newsId] })
    // Keeps the card's comment count in sync without a full feed refetch.
    queryClient.invalidateQueries({ queryKey: ['newsfeed'] })
  }

  const addComment = useMutation({
    mutationFn: () => createNewsComment(newsId, body),
    onSuccess: () => {
      setBody('')
      refresh()
    },
  })

  const removeComment = useMutation({
    mutationFn: (commentId: number) => deleteNewsComment(commentId),
    onSuccess: refresh,
  })

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
      {comments?.length === 0 && <p className="text-xs text-slate-400">No comments yet — be the first.</p>}

      <ul className="flex flex-col gap-2.5">
        {comments?.map((comment) => (
          <li key={comment.id} className="flex items-start gap-2.5">
            <Avatar name={comment.user.name} url={comment.user.avatar_url} size="sm" />
            <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">{comment.user.name}</p>
                {comment.user.id === user?.id && (
                  <button
                    onClick={() => removeComment.mutate(comment.id)}
                    className="text-[11px] font-medium text-slate-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-sm text-slate-700">{comment.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim()) addComment.mutate()
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment..."
          className={`${input} flex-1`}
        />
        <button type="submit" disabled={!body.trim() || addComment.isPending} className={buttonPrimary}>
          Post
        </button>
      </form>
    </div>
  )
}
