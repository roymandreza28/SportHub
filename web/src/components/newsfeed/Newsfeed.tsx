import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNewsFeed, toggleNewsReaction, type NewsItem } from '../../lib/newsApi'
import { sendMessage } from '../../lib/chatApi'
import { useChatUI } from '../../lib/ChatUIContext'
import { NewConversationModal } from '../social/NewConversationModal'
import { NewsComments } from './NewsComments'
import { NewsMediaGrid } from './NewsMediaGrid'
import { IconHeart, IconMessageCircle, IconShare } from '../layout/icons'

// Read-only by design: player/coach can react, comment, and share an
// organizer's article to a friend, but there is no create/edit/delete UI
// anywhere in this component — that stays organizer-only (NewsEditor.tsx),
// enforced server-side by the 'manage news' permission regardless.
export function Newsfeed() {
  const queryClient = useQueryClient()
  const { openChatWindow } = useChatUI()
  const { data: news, isLoading } = useQuery({ queryKey: ['newsfeed'], queryFn: fetchNewsFeed })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [sharingItem, setSharingItem] = useState<NewsItem | null>(null)

  const react = useMutation({
    mutationFn: (newsId: number) => toggleNewsReaction(newsId),
    onSuccess: (result, newsId) => {
      queryClient.setQueryData<NewsItem[] | undefined>(['newsfeed'], (old) =>
        old?.map((item) =>
          item.id === newsId
            ? { ...item, viewer_has_reacted: result.reacted, reactions_count: result.reactions_count }
            : item
        )
      )
    },
  })

  if (isLoading) return <p className="text-sm text-slate-500">Loading newsfeed...</p>

  return (
    <div className="flex flex-col gap-4">
      {news?.length === 0 && <p className="text-sm text-slate-400">No news yet — check back soon.</p>}

      {news?.map((item) => (
        <article key={item.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {item.author.name}
            {item.published_at && ` — ${new Date(item.published_at).toLocaleDateString()}`}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{item.body}</p>
          <NewsMediaGrid media={item.media} />

          <div className="mt-4 flex items-center gap-5 border-t border-slate-100 pt-3">
            <button
              onClick={() => react.mutate(item.id)}
              className={`flex items-center gap-1.5 text-sm font-medium ${
                item.viewer_has_reacted ? 'text-rose-600' : 'text-slate-500 hover:text-rose-600'
              }`}
            >
              <IconHeart className={`h-4 w-4 ${item.viewer_has_reacted ? 'fill-current' : ''}`} />
              {item.reactions_count > 0 ? item.reactions_count : 'React'}
            </button>
            <button
              onClick={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-600"
            >
              <IconMessageCircle className="h-4 w-4" />
              {item.comments_count > 0 ? item.comments_count : 'Comment'}
            </button>
            <button
              onClick={() => setSharingItem(item)}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-600"
            >
              <IconShare className="h-4 w-4" />
              Share
            </button>
          </div>

          {expandedId === item.id && <NewsComments newsId={item.id} />}
        </article>
      ))}

      {sharingItem && (
        <NewConversationModal
          title={`Share "${sharingItem.title}"`}
          helperText="Send this article to a friend as a message."
          submitLabel="Share"
          submitPendingLabel="Sharing..."
          singleSelect
          onClose={() => setSharingItem(null)}
          onCreated={async (conversationId) => {
            const preview = sharingItem.body.length > 200 ? `${sharingItem.body.slice(0, 200)}...` : sharingItem.body
            await sendMessage(conversationId, `📰 ${sharingItem.title}\n${preview}`)
            openChatWindow(conversationId)
            setSharingItem(null)
          }}
        />
      )}
    </div>
  )
}
