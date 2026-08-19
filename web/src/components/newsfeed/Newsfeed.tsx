import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNewsFeed, toggleNewsReaction, type NewsItem } from '../../lib/newsApi'
import { fetchTournament, type Tournament } from '../../lib/coachApi'
import { sendMessage } from '../../lib/chatApi'
import { useChatUI } from '../../lib/ChatUIContext'
import { useAuth } from '../../lib/AuthContext'
import { NewConversationModal } from '../social/NewConversationModal'
import { RegisterPlayerModal } from '../coach/RegisterPlayerModal'
import { Avatar } from '../layout/Avatar'
import { NewsComments } from './NewsComments'
import { NewsMediaGrid } from './NewsMediaGrid'
import { LiveRelayVideo } from './LiveRelayVideo'
import { IconHeart, IconMessageCircle, IconShare, IconShieldCheck } from '../layout/icons'

// Read-only by design: player/coach can react, comment, and share an
// organizer's article to a friend, but there is no create/edit/delete UI
// anywhere in this component — that stays organizer-only (NewsEditor.tsx),
// enforced server-side by the 'manage news' permission regardless.
export function Newsfeed() {
  const queryClient = useQueryClient()
  const { openChatWindow } = useChatUI()
  const { hasRole } = useAuth()
  const { data: news, isLoading } = useQuery({ queryKey: ['newsfeed'], queryFn: fetchNewsFeed })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [sharingItem, setSharingItem] = useState<NewsItem | null>(null)
  const [askCoachId, setAskCoachId] = useState<number | null>(null)
  const [registerTournament, setRegisterTournament] = useState<Tournament | null>(null)

  const isCoach = hasRole('coach')
  const isPlayer = hasRole('player')

  const registerMutation = useMutation({
    mutationFn: fetchTournament,
    onSuccess: (tournament) => setRegisterTournament(tournament),
  })

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
    <div className="flex w-full flex-col gap-5">
      {news?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
          No news yet — check back soon.
        </p>
      )}

      {news?.map((item) => {
        const liveStream = item.livestreams.find((l) => l.status === 'live')

        return (
        <article
          key={item.id}
          className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md"
        >
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-3">
              {item.author.is_organizer ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <IconShieldCheck className="h-5 w-5" />
                </div>
              ) : (
                <Avatar name={item.author.name} size="sm" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {item.author.is_organizer ? 'Organizer' : item.author.name}
                </p>
                {item.published_at && (
                  <p className="text-xs text-slate-400">
                    {new Date(item.published_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </p>
                )}
              </div>
              {liveStream && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600" /> LIVE
                </span>
              )}
            </div>

            {item.tournament ? (
              <button
                onClick={() => {
                  if (isCoach) registerMutation.mutate(item.tournament!.id)
                  else if (isPlayer) setAskCoachId((id) => (id === item.id ? null : item.id))
                }}
                className="mt-3.5 block text-left text-lg font-bold leading-snug text-slate-900 hover:text-teal-700 hover:underline"
              >
                {item.title}
              </button>
            ) : (
              <h3 className="mt-3.5 text-lg font-bold leading-snug text-slate-900">{item.title}</h3>
            )}

            {item.tournament && askCoachId === item.id && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Ask your coach to join the tournament for you.
              </p>
            )}

            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{item.body}</p>

            {liveStream && (
              <div className="mt-3">
                <LiveRelayVideo livestreamId={liveStream.id} />
              </div>
            )}
            <NewsMediaGrid media={item.media} />
          </div>

          <div className="flex items-center gap-6 border-t border-slate-100 px-5 py-3 sm:px-6">
            <button
              onClick={() => react.mutate(item.id)}
              className={`flex items-center gap-1.5 text-sm font-medium transition ${
                item.viewer_has_reacted ? 'text-rose-600' : 'text-slate-500 hover:text-rose-600'
              }`}
            >
              <IconHeart className={`h-4 w-4 ${item.viewer_has_reacted ? 'fill-current' : ''}`} />
              {item.reactions_count > 0 ? item.reactions_count : 'React'}
            </button>
            <button
              onClick={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-teal-600"
            >
              <IconMessageCircle className="h-4 w-4" />
              {item.comments_count > 0 ? item.comments_count : 'Comment'}
            </button>
            <button
              onClick={() => setSharingItem(item)}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-teal-600"
            >
              <IconShare className="h-4 w-4" />
              Share
            </button>
          </div>

          {expandedId === item.id && (
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <NewsComments newsId={item.id} />
            </div>
          )}
        </article>
        )
      })}

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

      {registerTournament && (
        <RegisterPlayerModal
          initialTournament={registerTournament}
          onClose={() => setRegisterTournament(null)}
        />
      )}
    </div>
  )
}
